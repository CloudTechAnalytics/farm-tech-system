import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addMember, as, categoryId, createFarm, createItem, daysAgo, key, newBatch, pool, population, rejects, rpc, stock, today, unitId } from './helpers'

let F: Awaited<ReturnType<typeof createFarm>>
let kg: string
let each: string
let crate: string
let ha: string

beforeAll(async () => {
  F = await createFarm('produce')
  kg = await unitId('kg')
  each = await unitId('each')
  crate = await unitId('crate30')
  ha = await unitId('ha')
})

afterAll(async () => {
  await pool.end()
})

async function cropUnit() {
  return as(F.owner, async (q) => (await q<{ id: string }>(`insert into public.production_units (organization_id, site_id, production_type, kind, name, area, area_unit_id) values ($1,$2,'crop','field',$3, 2, $4) returning id`, [F.org, F.site, `Field ${key().slice(0, 4)}`, ha]))[0].id)
}

describe('fish batches', () => {
  it('stocking, mortality, sampling and harvest reconcile, with estimates labelled', async () => {
    const batch = await newBatch(F.owner, F.org, F.site, { type: 'fish', quantity: 2000 })
    const b = (await pool.query(`select count_basis from batches where id = $1`, [batch])).rows[0]
    expect(b.count_basis).toBe('estimated')

    await rpc(F.owner, 'record_population_change', { p_key: key(), p_batch: batch, p_kind: 'mortality', p_quantity: 40, p_event_date: today() })
    await rpc(F.owner, 'record_fish_sample', { p_key: key(), p_batch: batch, p_sample_date: today(), p_sample_size: 20, p_total_weight_g: 10000 })
    const s = (await pool.query(`select current_population, latest_avg_weight_g, estimated_biomass_kg from batch_summaries where id = $1`, [batch])).rows[0]
    expect(s).toEqual({ current_population: 1960, latest_avg_weight_g: 500, estimated_biomass_kg: 980 })

    await rpc(F.owner, 'record_fish_harvest', { p_key: key(), p_batch: batch, p_record_date: today(), p_head_count: 900, p_weight_kg: 480, p_rejected_kg: 5 })
    expect(await population(batch)).toBe(1060)
    const rec = (await pool.query(`select quantity, head_count, is_estimate, available_quantity from production_record_balances where batch_id = $1`, [batch])).rows[0]
    expect(rec).toEqual({ quantity: 480, head_count: 900, is_estimate: true, available_quantity: 475 })

    // The final harvest finds more fish than estimated: the gap is recorded as an explicit correction.
    const r = await rpc<{ estimate_adjusted_by: number; written_off: number }>(F.owner, 'record_fish_harvest', {
      p_key: key(), p_batch: batch, p_record_date: today(), p_head_count: 1100, p_weight_kg: 560, p_final_harvest: true,
    })
    expect(r.estimate_adjusted_by).toBe(40)
    expect(await population(batch)).toBe(0)
    const adj = (await pool.query(`select reason, is_estimate from batch_events where batch_id = $1 and kind = 'adjustment'`, [batch])).rows[0]
    expect(adj).toEqual({ reason: 'Harvest count exceeded the estimated population', is_estimate: true })
  })

  it('a counted poultry batch cannot be over-harvested or oversold', async () => {
    const batch = await newBatch(F.owner, F.org, F.site, { quantity: 50 })
    await rejects(
      rpc(F.owner, 'record_sale', {
        p_key: key(), p_org: F.org, p_site: F.site, p_sale_date: today(),
        p_lines: [{ line_type: 'livestock', batch_id: batch, quantity: 51, unit_id: each, unit_price: 6000 }],
      }),
      /has 50 recorded/,
    )
  })
})

describe('crop cycles', () => {
  it('records inputs and harvests and reports yield', async () => {
    const field = await cropUnit()
    const cycle = await rpc<string>(F.owner, 'create_crop_cycle', {
      p_org: F.org, p_site: F.site, p_production_unit: field, p_code: `MZ-${key().slice(0, 4)}`, p_crop: 'Maize', p_area: 2, p_area_unit: ha, p_planting_date: daysAgo(90), p_variety: 'SAMMAZ 15',
    })
    const fert = await createItem(F.owner, F.org, `NPK 15-15-15 ${key().slice(0, 4)}`)
    await rpc(F.owner, 'record_stock_receipt', { p_key: key(), p_store: F.store, p_item: fert, p_movement_type: 'opening', p_quantity: 300, p_unit: kg, p_movement_date: daysAgo(80) })
    await rpc(F.owner, 'record_stock_usage', { p_key: key(), p_store: F.store, p_item: fert, p_quantity: 200, p_unit: kg, p_movement_date: daysAgo(60), p_crop_cycle: cycle, p_activity_code: 'fertilizer' })
    expect(await stock(fert, F.store)).toBe(100)

    await rpc(F.owner, 'record_crop_harvest', { p_key: key(), p_cycle: cycle, p_record_date: today(), p_quantity: 7, p_unit: await unitId('tonne'), p_rejected_quantity: 0.4, p_grade: 'A', p_mark_harvested: true })
    const c = (await pool.query(`select status, harvest_kg, yield_kg_per_ha from crop_cycle_summaries where id = $1`, [cycle])).rows[0]
    expect(c).toEqual({ status: 'harvested', harvest_kg: 6600, yield_kg_per_ha: 3300 })

    const inputs = await rpc<unknown>(F.owner, 'dashboard_summary', { p_org: F.org, p_from: today(), p_to: today(), p_production_type: 'crop' })
    expect(JSON.stringify(inputs)).toContain('Maize')

    await rejects(rpc(F.owner, 'record_crop_harvest', { p_key: key(), p_cycle: cycle, p_record_date: daysAgo(100), p_quantity: 1, p_unit: kg }), /before planting/)
  })
})

describe('sales, income and expenses', () => {
  it('sells produce without selling the same eggs twice, tracks unpaid amounts, and voids cleanly', async () => {
    const flock = await newBatch(F.owner, F.org, F.site, { quantity: 800 })
    await rpc(F.owner, 'record_egg_collection', { p_key: key(), p_batch: flock, p_record_date: today(), p_quantity: 20, p_unit: crate, p_rejected_quantity: 1 })
    const record = (await pool.query(`select id, available_quantity from production_record_balances where batch_id = $1`, [flock])).rows[0]
    expect(record.available_quantity).toBe(19)

    // Sell 10 crates at ₦4,500, paid ₦30,000 now.
    const sale = await rpc<{ sale_id: string; total: number }>(F.owner, 'record_sale', {
      p_key: key(), p_org: F.org, p_site: F.site, p_sale_date: today(), p_customer_name: 'Mama Nkechi',
      p_lines: [{ line_type: 'produce', production_record_id: record.id, quantity: 10, unit_id: crate, unit_price: 4500 }],
      p_amount_received: 30000, p_payment_method: 'cash',
    })
    expect(sale.total).toBe(45000)
    let ss = (await pool.query(`select amount_received, amount_outstanding from sale_summaries where id = $1`, [sale.sale_id])).rows[0]
    expect(ss).toEqual({ amount_received: 30000, amount_outstanding: 15000 })

    // Selling in pieces converts against crates: 270 pieces = 9 crates leaves 0; 271 is too many.
    await rejects(
      rpc(F.owner, 'record_sale', { p_key: key(), p_org: F.org, p_site: F.site, p_sale_date: today(), p_lines: [{ line_type: 'produce', production_record_id: record.id, quantity: 271, unit_id: each, unit_price: 160 }] }),
      /Only 9/,
    )

    // The same sale submitted twice (retry) is recorded once.
    const k = key()
    const args = { p_key: k, p_org: F.org, p_site: F.site, p_sale_date: today(), p_lines: [{ line_type: 'produce', production_record_id: record.id, quantity: 4, unit_id: crate, unit_price: 4500 }], p_amount_received: 18000, p_payment_method: 'bank_transfer' }
    const s1 = await rpc<{ sale_id: string }>(F.owner, 'record_sale', args)
    const s2 = await rpc<{ sale_id: string; replayed: boolean }>(F.owner, 'record_sale', args)
    expect(s2.sale_id).toBe(s1.sale_id)
    expect(s2.replayed).toBe(true)
    expect((await pool.query(`select available_quantity from production_record_balances where id = $1`, [record.id])).rows[0].available_quantity).toBe(5)

    // Pay the balance; overpaying is refused.
    await rejects(rpc(F.owner, 'record_sale_payment', { p_key: key(), p_sale: sale.sale_id, p_amount: 15000.01, p_payment_date: today(), p_payment_method: 'cash' }), /Only 15,000.00 is outstanding/)
    await rpc(F.owner, 'record_sale_payment', { p_key: key(), p_sale: sale.sale_id, p_amount: 15000, p_payment_date: today(), p_payment_method: 'pos' })
    ss = (await pool.query(`select amount_outstanding from sale_summaries where id = $1`, [sale.sale_id])).rows[0]
    expect(ss.amount_outstanding).toBe(0)

    const income = (await pool.query(`select sum(amount) as s from finance_transactions where sale_id = $1`, [sale.sale_id])).rows[0].s
    expect(income).toBe(45000)
    const cat = (await pool.query(`select distinct c.code from finance_transactions t join categories c on c.id = t.category_id where t.sale_id = $1`, [sale.sale_id])).rows
    expect(cat).toEqual([{ code: 'egg_sales' }])

    // Voiding restores availability and nets the income to zero, keeping the history.
    await rpc(F.owner, 'void_sale', { p_key: key(), p_sale: sale.sale_id, p_reason: 'Customer returned the eggs' })
    expect((await pool.query(`select available_quantity from production_record_balances where id = $1`, [record.id])).rows[0].available_quantity).toBe(15)
    const net = (await pool.query(`select sum(amount) as s, count(*)::int as n from finance_transactions where sale_id = $1`, [sale.sale_id])).rows[0]
    expect(net).toEqual({ s: 0, n: 4 })
  })

  it('live bird sales reduce the flock; voiding puts them back', async () => {
    const batch = await newBatch(F.owner, F.org, F.site, { quantity: 200 })
    const sale = await rpc<{ sale_id: string }>(F.owner, 'record_sale', {
      p_key: key(), p_org: F.org, p_site: F.site, p_sale_date: today(),
      p_lines: [{ line_type: 'livestock', batch_id: batch, quantity: 60, unit_id: each, unit_price: 7500, weight_kg: 150 }],
      p_amount_received: 450000, p_payment_method: 'bank_transfer',
    })
    expect(await population(batch)).toBe(140)
    const summary = (await pool.query(`select total_sold from batch_summaries where id = $1`, [batch])).rows[0]
    expect(summary.total_sold).toBe(60)
    await rpc(F.owner, 'void_sale', { p_key: key(), p_sale: sale.sale_id, p_reason: 'Duplicate' })
    expect(await population(batch)).toBe(200)
    await rejects(rpc(F.owner, 'reverse_batch_event', { p_key: key(), p_event: (await pool.query(`select id from batch_events where batch_id=$1 and kind='sale'`, [batch])).rows[0].id, p_reason: 'x' }), /Void the sale instead|already been reversed/)
  })

  it('income and expenses feed the reports, with reversals netting out', async () => {
    const G = await createFarm('reports')
    const labour = await categoryId(G.org, 'expense', 'labour')
    const other = await categoryId(G.org, 'income', 'other_income')
    await rpc(G.owner, 'record_finance_transaction', { p_key: key(), p_org: G.org, p_site: G.site, p_kind: 'expense', p_category: labour, p_amount: 12000.5, p_txn_date: today(), p_description: 'Weeding labour', p_payment_method: 'cash' })
    const bad = await rpc<{ transaction_id: string }>(G.owner, 'record_finance_transaction', { p_key: key(), p_org: G.org, p_site: G.site, p_kind: 'expense', p_category: labour, p_amount: 9999, p_txn_date: today(), p_description: 'Typo', p_payment_method: 'cash' })
    await rpc(G.owner, 'record_finance_transaction', { p_key: key(), p_org: G.org, p_kind: 'income', p_category: other, p_amount: 50000, p_txn_date: today(), p_description: 'Manure sale' })
    await rejects(
      rpc(G.owner, 'record_finance_transaction', { p_key: key(), p_org: G.org, p_kind: 'income', p_category: labour, p_amount: 1, p_txn_date: today(), p_description: 'x' }),
      /Choose an active income category/,
    )
    await rpc(G.owner, 'reverse_finance_transaction', { p_key: key(), p_transaction: bad.transaction_id, p_reason: 'Entered twice' })

    const monthly = await as(G.owner, (q) => q<{ income: number; expense: number; net: number }>(`select income, expense, net from public.report_finance_monthly($1, $2, $3)`, [G.org, today(), today()]))
    expect(monthly).toEqual([{ income: 50000, expense: 12000.5, net: 37999.5 }])

    const dash = await rpc<{ finance: { income: number; expense: number; operating_surplus: number } }>(G.owner, 'dashboard_summary', { p_org: G.org, p_from: today(), p_to: today() })
    expect(dash.finance).toEqual({ income: 50000, expense: 12000.5, operating_surplus: 37999.5 })

    const bySite = await as(G.owner, (q) => q<{ income: number; expense: number }>(`select income, expense from public.report_site_performance($1, $2, $3)`, [G.org, today(), today()]))
    // Org-wide income (no site) is not attributed to a site.
    expect(bySite).toEqual([{ income: 0, expense: 12000.5 }])

    // A site-scoped accountant cannot post organization-wide entries.
    const acct = await addMember(G.owner, G.org, 'acct', 'accountant', [G.site])
    await rejects(
      rpc(acct.user, 'record_finance_transaction', { p_key: key(), p_org: G.org, p_kind: 'income', p_category: other, p_amount: 1, p_txn_date: today(), p_description: 'x' }),
      /Choose a farm site/,
    )
  })

  it('amounts are stored exactly to the kobo', async () => {
    const labour = await categoryId(F.org, 'expense', 'labour')
    const r = await rpc<{ transaction_id: string }>(F.owner, 'record_finance_transaction', { p_key: key(), p_org: F.org, p_site: F.site, p_kind: 'expense', p_category: labour, p_amount: 0.1 + 0.2, p_txn_date: today(), p_description: 'Rounding check' })
    const amount = (await pool.query(`select amount::text as a from finance_transactions where id = $1`, [r.transaction_id])).rows[0].a
    expect(amount).toBe('0.30')
  })
})

describe('reports and alerts', () => {
  it('mortality report and the high-mortality alert agree with the ledger', async () => {
    const H = await createFarm('alerts')
    const batch = await newBatch(H.owner, H.org, H.site, { quantity: 1000, start: daysAgo(10) })
    await rpc(H.owner, 'record_population_change', { p_key: key(), p_batch: batch, p_kind: 'mortality', p_quantity: 15, p_event_date: today() })
    const report = await as(H.owner, (q) => q<{ opening_population: number; mortality: number; mortality_pct: number }>(`select opening_population, mortality, mortality_pct from public.report_mortality($1, $2, $3)`, [H.org, today(), today()]))
    expect(report).toEqual([{ opening_population: 1000, mortality: 15, mortality_pct: 1.5 }])
    const alerts = await as(H.owner, (q) => q<{ kind: string; severity: string }>(`select kind, severity from public.org_alerts($1)`, [H.org]))
    expect(alerts).toContainEqual({ kind: 'high_mortality', severity: 'critical' })
  })

  it('missing-record alerts wait a full day and clear when work is recorded', async () => {
    const H = await createFarm('missing')
    const fresh = await newBatch(H.owner, H.org, H.site, { start: today() })
    const quiet = await newBatch(H.owner, H.org, H.site, { start: daysAgo(10) })
    const kinds = async () => (await as(H.owner, (q) => q<{ kind: string; entity_id: string }>(`select kind, entity_id from public.org_alerts($1)`, [H.org]))).filter((a) => a.kind === 'missing_records').map((a) => a.entity_id)
    // The only record for `quiet` is its stocking 10 days ago; `fresh` started today.
    expect(await kinds()).toEqual([quiet])
    await rpc(H.owner, 'record_population_change', { p_key: key(), p_batch: quiet, p_kind: 'mortality', p_quantity: 1, p_event_date: daysAgo(1) })
    expect(await kinds()).toEqual([])
    void fresh
  })

  it('low stock alerts only for items with a reorder level', async () => {
    const H = await createFarm('stock-alerts')
    const withLevel = await createItem(H.owner, H.org, 'Fish feed 4mm', { feed: true, category: 'fish_feed', reorder: 50 })
    const without = await createItem(H.owner, H.org, 'Gloves', { category: 'consumables', unit: 'each' })
    await rpc(H.owner, 'record_stock_receipt', { p_key: key(), p_store: H.store, p_item: withLevel, p_movement_type: 'opening', p_quantity: 30, p_unit: kg, p_movement_date: today() })
    await rpc(H.owner, 'record_stock_receipt', { p_key: key(), p_store: H.store, p_item: without, p_movement_type: 'opening', p_quantity: 1, p_unit: each, p_movement_date: today() })
    const alerts = await as(H.owner, (q) => q<{ kind: string; entity_id: string }>(`select kind, entity_id from public.org_alerts($1)`, [H.org]))
    expect(alerts.filter((a) => a.kind === 'low_stock').map((a) => a.entity_id)).toEqual([withLevel])
  })

  it('a new organization has an empty dashboard, not invented numbers', async () => {
    const N = await createFarm('empty')
    const d = await rpc<Record<string, unknown>>(N.owner, 'dashboard_summary', { p_org: N.org, p_from: daysAgo(30), p_to: today() })
    expect(d).toMatchObject({
      sites: 1,
      active: { poultry_batches: 0, fish_batches: 0, crop_cycles: 0 },
      mortality: { poultry: 0, fish: 0 },
      production: [],
      low_stock_items: 0,
      finance: { income: 0, expense: 0, operating_surplus: 0 },
    })
    const alerts = await as(N.owner, (q) => q(`select * from public.org_alerts($1)`, [N.org]))
    expect(alerts).toHaveLength(0)
  })
})
