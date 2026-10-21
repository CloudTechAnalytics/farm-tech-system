import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addMember, as, createFarm, createItem, key, pool, rejects, rpc, stock, today, unitId } from './helpers'

let F: Awaited<ReturnType<typeof createFarm>>
let kg: string
let bag25: string

beforeAll(async () => {
  F = await createFarm('proc')
  kg = await unitId('kg')
  bag25 = await unitId('bag25')
})

afterAll(async () => {
  await pool.end()
})

async function supplier(org = F.org, owner = F.owner, terms = 30) {
  return as(owner, async (q) =>
    (await q<{ id: string }>(`insert into public.suppliers (organization_id, name, category, payment_terms_days) values ($1, $2, 'feed', $3) returning id`, [org, `Supplier ${key().slice(0, 6)}`, terms]))[0].id,
  )
}

async function order(sup: string, item: string, opts: { quantity?: number; price?: number; extra?: object[] } = {}) {
  const r = await rpc<{ purchase_order_id: string; po_number: string }>(F.owner, 'create_purchase_order', {
    p_key: key(), p_org: F.org, p_site: F.site, p_supplier: sup, p_store: F.store, p_order_date: today(),
    p_lines: [{ item_id: item, quantity: opts.quantity ?? 40, unit_id: bag25, unit_price: opts.price ?? 12000 }, ...(opts.extra ?? [])],
  })
  const lines = (await pool.query(`select id, item_id from purchase_order_lines where purchase_order_id = $1 order by created_at`, [r.purchase_order_id])).rows
  return { ...r, line: lines[0].id as string, lines }
}

const expenses = async (where: string, p: unknown[]) =>
  Number((await pool.query(`select coalesce(sum(amount), 0) as s from finance_transactions where kind = 'expense' and ${where}`, p)).rows[0].s)

describe('requests, approval and purchase orders', () => {
  it('a manager requests, only an approver orders, and the request is marked ordered', async () => {
    const manager = (await addMember(F.owner, F.org, 'proc-manager', 'manager')).user
    const item = await createItem(F.owner, F.org, `Grower mash ${key().slice(0, 4)}`, { feed: true })
    const sup = await supplier()
    const req = await rpc<{ purchase_request_id: string; request_number: string }>(manager, 'create_purchase_request', {
      p_key: key(), p_org: F.org, p_site: F.site, p_reason: 'Feed for next month',
      p_lines: [{ item_id: item, quantity: 40, unit_id: bag25, estimated_unit_cost: 11500 }],
    })
    expect(req.request_number).toMatch(/^PR-\d{5}$/)
    await rejects(rpc(manager, 'decide_purchase_request', { p_request: req.purchase_request_id, p_decision: 'approved' }), /procurement.approve/)
    await rejects(
      rpc(manager, 'create_purchase_order', { p_key: key(), p_org: F.org, p_site: F.site, p_supplier: sup, p_store: F.store, p_order_date: today(), p_lines: [{ item_id: item, quantity: 1, unit_id: bag25, unit_price: 1 }] }),
      /procurement.approve/,
    )
    // Ordering needs an approved request.
    const orderArgs = { p_org: F.org, p_site: F.site, p_supplier: sup, p_store: F.store, p_order_date: today(), p_request: req.purchase_request_id, p_lines: [{ item_id: item, quantity: 40, unit_id: bag25, unit_price: 11800 }] }
    await rejects(rpc(F.owner, 'create_purchase_order', { p_key: key(), ...orderArgs }), /approved request/)
    await rejects(rpc(F.owner, 'decide_purchase_request', { p_request: req.purchase_request_id, p_decision: 'rejected' }), /reason/)
    await rpc(F.owner, 'decide_purchase_request', { p_request: req.purchase_request_id, p_decision: 'approved' })
    const po = await rpc<{ po_number: string }>(F.owner, 'create_purchase_order', { p_key: key(), ...orderArgs })
    expect(po.po_number).toMatch(/^PO-\d{5}$/)
    const r = (await pool.query(`select status, po_number from purchase_request_summaries where id = $1`, [req.purchase_request_id])).rows[0]
    expect(r).toEqual({ status: 'ordered', po_number: po.po_number })
  })
})

describe('receiving goods', () => {
  it('adds accepted goods to stock at the PO price, verifies quantities and records no expense', async () => {
    const item = await createItem(F.owner, F.org, `Layer mash ${key().slice(0, 4)}`, { feed: true })
    const sup = await supplier()
    const po = await order(sup, item, { extra: [{ description: 'Delivery charge', quantity: 1, unit_id: await unitId('each'), unit_price: 15000 }] })
    const before = await expenses('organization_id = $1', [F.org])

    const k = key()
    const args = {
      p_key: k, p_order: po.purchase_order_id, p_received_date: today(), p_delivery_reference: 'DN-778',
      p_lines: [{ order_line_id: po.line, quantity_received: 30, quantity_rejected: 2, rejection_reason: 'Torn bags' }, { order_line_id: po.lines[1].id, quantity_received: 1 }],
    }
    const grn = await rpc<{ grn_number: string; goods_receipt_id: string }>(F.owner, 'receive_purchase_order', args)
    expect(grn.grn_number).toMatch(/^GRN-\d{5}$/)
    expect(await stock(item, F.store)).toBe(750) // 30 bags × 25 kg; the rejected bags are not stocked
    const mv = (await pool.query(`select unit_cost, total_cost, reference from inventory_movements where item_id = $1`, [item])).rows[0]
    expect(mv).toEqual({ unit_cost: 480, total_cost: 360000, reference: `${po.po_number} / ${grn.grn_number}` })
    expect(await expenses('organization_id = $1', [F.org])).toBe(before)

    // A retried submission is not received twice.
    const again = await rpc<{ goods_receipt_id: string; replayed: boolean }>(F.owner, 'receive_purchase_order', args)
    expect(again).toMatchObject({ goods_receipt_id: grn.goods_receipt_id, replayed: true })
    expect(await stock(item, F.store)).toBe(750)

    await rejects(
      rpc(F.owner, 'receive_purchase_order', { p_key: key(), p_order: po.purchase_order_id, p_received_date: today(), p_lines: [{ order_line_id: po.line, quantity_received: 11 }] }),
      /Only 10 remains to receive/,
    )
    let s = (await pool.query(`select receipt_status, received_value from purchase_order_summaries where id = $1`, [po.purchase_order_id])).rows[0]
    expect(s).toEqual({ receipt_status: 'partially_received', received_value: 375000 })

    await rpc(F.owner, 'receive_purchase_order', { p_key: key(), p_order: po.purchase_order_id, p_received_date: today(), p_lines: [{ order_line_id: po.line, quantity_received: 10 }] })
    s = (await pool.query(`select receipt_status from purchase_order_summaries where id = $1`, [po.purchase_order_id])).rows[0]
    expect(s.receipt_status).toBe('received')
    await rejects(rpc(F.owner, 'set_purchase_order_status', { p_order: po.purchase_order_id, p_status: 'cancelled', p_reason: 'x' }), /Close it instead/)
  })

  it('received stock is corrected by voiding the note, and only while it has not been used', async () => {
    const item = await createItem(F.owner, F.org, `NPK ${key().slice(0, 4)}`)
    const po = await order(await supplier(), item, { quantity: 4 })
    const grn = await rpc<{ goods_receipt_id: string }>(F.owner, 'receive_purchase_order', { p_key: key(), p_order: po.purchase_order_id, p_received_date: today(), p_lines: [{ order_line_id: po.line, quantity_received: 4 }] })
    expect(await stock(item, F.store)).toBe(100)

    const mv = (await pool.query(`select id from inventory_movements where item_id = $1`, [item])).rows[0].id
    await rejects(rpc(F.owner, 'reverse_inventory_movement', { p_key: key(), p_movement: mv, p_reason: 'wrong' }), /Void the goods received note/)

    await rpc(F.owner, 'record_stock_usage', { p_key: key(), p_store: F.store, p_item: item, p_quantity: 30, p_unit: kg, p_movement_date: today(), p_reason: 'Top dressing the garden' })
    await rejects(rpc(F.owner, 'void_goods_receipt', { p_key: key(), p_receipt: grn.goods_receipt_id, p_reason: 'Wrong delivery' }), /stock|negative|available|enough/i)
    expect(await stock(item, F.store)).toBe(70)

    // With nothing used, voiding returns stock to zero and reopens the order line.
    const item2 = await createItem(F.owner, F.org, `Urea ${key().slice(0, 4)}`)
    const po2 = await order(await supplier(), item2, { quantity: 2 })
    const grn2 = await rpc<{ goods_receipt_id: string }>(F.owner, 'receive_purchase_order', { p_key: key(), p_order: po2.purchase_order_id, p_received_date: today(), p_lines: [{ order_line_id: po2.line, quantity_received: 2 }] })
    await rpc(F.owner, 'void_goods_receipt', { p_key: key(), p_receipt: grn2.goods_receipt_id, p_reason: 'Sent back' })
    expect(await stock(item2, F.store)).toBe(0)
    const s = (await pool.query(`select receipt_status from purchase_order_summaries where id = $1`, [po2.purchase_order_id])).rows[0]
    expect(s.receipt_status).toBe('awaiting')
  })
})

describe('supplier bills and payments', () => {
  it('records each bill once, pays it within its balance, and counts the expense only when paid', async () => {
    const item = await createItem(F.owner, F.org, `Fish feed ${key().slice(0, 4)}`, { feed: true })
    const sup = await supplier(F.org, F.owner, 30)
    const po = await order(sup, item, { quantity: 10, price: 20000 }) // 200,000
    const bill = (n: string, amount: number) =>
      rpc<{ supplier_bill_id: string }>(F.owner, 'record_supplier_bill', {
        p_key: key(), p_org: F.org, p_supplier: sup, p_bill_number: n, p_bill_date: today(), p_amount: amount, p_description: 'Fish feed delivery', p_order: po.purchase_order_id,
      })
    const b = await bill('INV-4471', 150000)
    await rejects(bill(' inv-4471 ', 10000), /already been recorded/)
    await rejects(bill('INV-4472', 60000), /order value of 200,000.00/)

    const info = (await pool.query(`select due_date::text as due, category_name, amount_outstanding from supplier_bill_summaries where id = $1`, [b.supplier_bill_id])).rows[0]
    expect(info.category_name).toBe('Feed')
    expect(info.amount_outstanding).toBe(150000)
    expect(await expenses('supplier_bill_id = $1', [b.supplier_bill_id])).toBe(0)

    const pay = (amount: number, k = key()) => rpc(F.owner, 'pay_supplier_bill', { p_key: k, p_bill: b.supplier_bill_id, p_amount: amount, p_payment_date: today(), p_payment_method: 'bank_transfer' })
    const k = key()
    await pay(100000, k)
    await pay(100000, k) // retry: paid once
    await rejects(pay(50000.01), /Only 50,000.00 is outstanding/)
    expect(await expenses('supplier_bill_id = $1', [b.supplier_bill_id])).toBe(100000)

    let bal = (await pool.query(`select total_billed, total_paid, balance_outstanding from supplier_balances where id = $1`, [sup])).rows[0]
    expect(bal).toEqual({ total_billed: 150000, total_paid: 100000, balance_outstanding: 50000 })

    // Reversing a payment puts the balance back; the bill cannot be voided while payments stand.
    await rejects(rpc(F.owner, 'void_supplier_bill', { p_bill: b.supplier_bill_id, p_reason: 'Duplicate' }), /Payments have been made/)
    const txn = (await pool.query(`select id from finance_transactions where supplier_bill_id = $1`, [b.supplier_bill_id])).rows[0].id
    await rpc(F.owner, 'reverse_finance_transaction', { p_key: key(), p_transaction: txn, p_reason: 'Paid wrong account' })
    bal = (await pool.query(`select balance_outstanding from supplier_balances where id = $1`, [sup])).rows[0]
    expect(bal.balance_outstanding).toBe(150000)
    await rpc(F.owner, 'void_supplier_bill', { p_bill: b.supplier_bill_id, p_reason: 'Entered against the wrong supplier' })
    // A voided bill number can be entered again correctly.
    await bill('INV-4471', 150000)
  })
})

describe('procurement access', () => {
  it('workers cannot see suppliers, and another farm cannot receive, bill or pay against this one', async () => {
    const worker = (await addMember(F.owner, F.org, 'proc-worker', 'worker')).user
    const sup = await supplier()
    expect(await as(worker, (q) => q(`select id from suppliers where id = $1`, [sup]))).toEqual([])
    const item = await createItem(F.owner, F.org, `Vaccine ${key().slice(0, 4)}`, { category: 'treatment' })
    const po = await order(sup, item, { quantity: 1, price: 5000 })

    const other = await createFarm('proc-intruder')
    expect(await as(other.owner, (q) => q(`select id from purchase_order_summaries where id = $1`, [po.purchase_order_id]))).toEqual([])
    await rejects(
      rpc(other.owner, 'receive_purchase_order', { p_key: key(), p_order: po.purchase_order_id, p_received_date: today(), p_lines: [{ order_line_id: po.line, quantity_received: 1 }] }),
      /not found/,
    )
    await rejects(
      rpc(other.owner, 'record_supplier_bill', { p_key: key(), p_org: other.org, p_supplier: sup, p_bill_number: 'X1', p_bill_date: today(), p_amount: 100, p_description: 'Sneaky' }),
      /Supplier not found/,
    )
    const bill = await rpc<{ supplier_bill_id: string }>(F.owner, 'record_supplier_bill', { p_key: key(), p_org: F.org, p_supplier: sup, p_bill_number: 'V-1', p_bill_date: today(), p_amount: 5000, p_description: 'Vaccine' })
    await rejects(rpc(other.owner, 'pay_supplier_bill', { p_key: key(), p_bill: bill.supplier_bill_id, p_amount: 1, p_payment_date: today(), p_payment_method: 'cash' }), /not found/)
    await rejects(as(other.owner, (q) => q(`insert into suppliers (organization_id, name) values ($1, 'Hijack')`, [F.org])), /row-level security/)
  })
})
