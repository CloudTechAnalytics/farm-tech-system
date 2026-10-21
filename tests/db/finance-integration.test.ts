import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addMember, as, categoryId, createFarm, daysAgo, key, pool, rejects, rpc, today, unitId } from './helpers'

let F: Awaited<ReturnType<typeof createFarm>>

// One farm with a known set of money movements:
//   invoice 10,000 (4,000 received), supplier bill 6,000 (1,000 paid),
//   a direct expense of 500 and other income of 200.
beforeAll(async () => {
  F = await createFarm('fin', { poultry: true })
  const each = await unitId('each')
  const customer = await as(F.owner, async (q) => (await q<{ id: string }>(`insert into customers (organization_id, name, payment_terms_days) values ($1, 'Owing Customer', 10) returning id`, [F.org]))[0].id)
  await rpc(F.owner, 'record_sale', {
    p_key: key(), p_org: F.org, p_site: F.site, p_sale_date: daysAgo(45), p_customer: customer,
    p_lines: [{ line_type: 'other', description: 'Manure, 100 bags', quantity: 100, unit_id: each, unit_price: 100 }],
    p_amount_received: 4000, p_payment_method: 'cash',
  })
  const supplier = await as(F.owner, async (q) => (await q<{ id: string }>(`insert into suppliers (organization_id, name, payment_terms_days) values ($1, 'Feed Mill', 0) returning id`, [F.org]))[0].id)
  const bill = await rpc<{ supplier_bill_id: string }>(F.owner, 'record_supplier_bill', {
    p_key: key(), p_org: F.org, p_supplier: supplier, p_bill_number: 'FM-1', p_bill_date: daysAgo(5), p_amount: 6000, p_description: 'Feed', p_site: F.site,
  })
  await rpc(F.owner, 'pay_supplier_bill', { p_key: key(), p_bill: bill.supplier_bill_id, p_amount: 1000, p_payment_date: daysAgo(2), p_payment_method: 'bank_transfer' })
  await rpc(F.owner, 'record_finance_transaction', {
    p_key: key(), p_org: F.org, p_site: F.site, p_kind: 'expense', p_category: await categoryId(F.org, 'expense', 'fuel'), p_amount: 500, p_txn_date: daysAgo(1), p_description: 'Diesel', p_payment_method: 'cash',
  })
  await rpc(F.owner, 'record_finance_transaction', {
    p_key: key(), p_org: F.org, p_site: F.site, p_kind: 'income', p_category: await categoryId(F.org, 'income', 'other_income'), p_amount: 200, p_txn_date: daysAgo(1), p_description: 'Tray deposit', p_payment_method: 'cash',
  })
})

afterAll(async () => {
  await pool.end()
})

describe('finance integration', () => {
  it('keeps the cash surplus distinct from accounting profit, and the gap is exactly what is owed', async () => {
    const r = await rpc<{
      cash: { money_in: number; money_out: number; surplus: number }
      accrual: { sales_invoiced: number; other_income: number; supplier_bills: number; direct_expenses: number; profit: number }
      difference: { sales_not_yet_received: number; bills_not_yet_paid: number }
    }>(F.owner, 'report_profit_comparison', { p_org: F.org, p_from: daysAgo(60), p_to: today() })
    expect(r.cash).toMatchObject({ money_in: 4200, money_out: 1500, surplus: 2700 })
    expect(r.accrual).toMatchObject({ sales_invoiced: 10000, other_income: 200, supplier_bills: 6000, direct_expenses: 500, profit: 3700 })
    expect(r.difference).toEqual({ sales_not_yet_received: 6000, bills_not_yet_paid: 5000 })
    // profit − surplus = owed to us − owed by us
    expect(r.accrual.profit - r.cash.surplus).toBe(r.difference.sales_not_yet_received - r.difference.bills_not_yet_paid)
  })

  it('ages receivables and payables and reports recorded cash by method', async () => {
    const p = await rpc<{
      receivables: { total: number; d31_60: number }
      payables: { total: number; d1_30: number }
      cash_by_method: { method: string; balance: number }[]
      net_recorded_cash: number
    }>(F.owner, 'finance_position', { p_org: F.org })
    // Invoice dated 45 days ago with 10-day terms: 35 days overdue.
    expect(p.receivables).toMatchObject({ total: 6000, d31_60: 6000 })
    expect(p.payables).toMatchObject({ total: 5000, d1_30: 5000 })
    expect(p.net_recorded_cash).toBe(2700)
    expect(p.cash_by_method).toEqual([
      { method: 'bank_transfer', balance: -1000 },
      { method: 'cash', balance: 3700 },
    ])
    const days = (await pool.query(`select days_overdue from receivables where organization_id = $1`, [F.org])).rows[0].days_overdue
    expect(days).toBe(35)
  })

  it('the cashbook opens with the earlier balance and runs to the closing balance', async () => {
    const all = await as(F.owner, (q) => q<{ is_opening: boolean; balance: number; money_in: number | null; money_out: number | null }>(
      `select * from report_cashbook($1, $2, $3)`, [F.org, daysAgo(10), today()]))
    expect(all[0]).toMatchObject({ is_opening: true, balance: 4000 })
    expect(all.at(-1)!.balance).toBe(2700)
    const cashOnly = await as(F.owner, (q) => q<{ balance: number }>(`select balance from report_cashbook($1, $2, $3, null, 'cash')`, [F.org, daysAgo(60), today()]))
    expect(cashOnly.at(-1)!.balance).toBe(3700)
  })

  it('is hidden from roles without finance access and from other farms', async () => {
    const worker = (await addMember(F.owner, F.org, 'fin-worker', 'worker')).user
    await rejects(rpc(worker, 'finance_position', { p_org: F.org }), /permission to view financial/)
    await rejects(rpc(worker, 'report_profit_comparison', { p_org: F.org, p_from: daysAgo(30), p_to: today() }), /permission/)
    expect(await as(worker, (q) => q(`select * from receivables where organization_id = $1`, [F.org]))).toEqual([])
    const other = await createFarm('fin-other')
    await rejects(rpc(other.owner, 'report_cashbook', { p_org: F.org, p_from: daysAgo(30), p_to: today() }), /permission/)
    expect(await as(other.owner, (q) => q(`select * from payables where organization_id = $1`, [F.org]))).toEqual([])
  })
})
