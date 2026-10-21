import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addMember, as, createFarm, createItem, daysAgo, key, newBatch, pool, population, rejects, rpc, stock, today, unitId } from './helpers'

let F: Awaited<ReturnType<typeof createFarm>>
let each: string
let crate: string
let ml: string

beforeAll(async () => {
  F = await createFarm('health')
  each = await unitId('each')
  crate = await unitId('crate30')
  ml = (await pool.query(`select id from units where organization_id is null and dimension = 'volume' order by to_base limit 1`)).rows[0].id
})

afterAll(async () => {
  await pool.end()
})

const alerts = async (kind: string) => (await as(F.owner, (q) => q<{ kind: string; entity_id: string; title: string }>(`select * from org_alerts($1)`, [F.org]))).filter((a) => a.kind === kind)

async function asset(name: string, condition = 'good') {
  return as(F.owner, async (q) =>
    (await q<{ id: string }>(`insert into assets (organization_id, site_id, name, category, condition) values ($1, $2, $3, 'generator', $4) returning id`, [F.org, F.site, name, condition]))[0].id,
  )
}

describe('equipment and maintenance', () => {
  it('records service once, moves the schedule on, and its expense is reversed only by voiding the record', async () => {
    const gen = await asset('Generator 20kVA')
    const plan = await as(F.owner, async (q) =>
      (await q<{ id: string }>(`insert into maintenance_plans (organization_id, site_id, asset_id, title, interval_days, next_due_on) values ($1, $2, $3, 'Oil and filter change', 90, $4) returning id`, [F.org, F.site, gen, daysAgo(4)]))[0].id,
    )
    expect((await alerts('maintenance_overdue')).map((a) => a.entity_id)).toContain(gen)

    const k = key()
    const args = { p_key: k, p_asset: gen, p_kind: 'service', p_performed_on: daysAgo(1), p_description: 'Oil, oil filter, air filter', p_plan: plan, p_cost: 45000, p_paid_now: true, p_payment_method: 'cash', p_downtime_hours: 3 }
    const r = await rpc<{ maintenance_record_id: string; finance_transaction_id: string }>(F.owner, 'record_maintenance', args)
    const again = await rpc<{ maintenance_record_id: string; replayed: boolean }>(F.owner, 'record_maintenance', args)
    expect(again).toMatchObject({ maintenance_record_id: r.maintenance_record_id, replayed: true })
    const t = (await pool.query(`select t.amount, c.code from finance_transactions t join categories c on c.id = t.category_id where t.id = $1`, [r.finance_transaction_id])).rows[0]
    expect(t).toEqual({ amount: 45000, code: 'repairs' })
    expect((await pool.query(`select count(*)::int as n from maintenance_records where asset_id = $1`, [gen])).rows[0].n).toBe(1)
    const p = (await pool.query(`select next_due_on::text as next, last_done_on::text as last from maintenance_plans where id = $1`, [plan])).rows[0]
    expect(p).toEqual({ last: daysAgo(1), next: daysAgo(-89) })
    expect((await alerts('maintenance_overdue')).map((a) => a.entity_id)).not.toContain(gen)

    await rejects(rpc(F.owner, 'reverse_finance_transaction', { p_key: key(), p_transaction: r.finance_transaction_id, p_reason: 'x' }), /Void the record instead/)
    await rpc(F.owner, 'void_maintenance_record', { p_key: key(), p_record: r.maintenance_record_id, p_reason: 'Entered twice' })
    const net = (await pool.query(`select sum(amount) as s from finance_transactions where id = $1 or reverses_id = $1`, [r.finance_transaction_id])).rows[0].s
    expect(net).toBe(0)
  })

  it('never records a cost twice: a billed repair is paid through the bill', async () => {
    const pump = await asset('Borehole pump')
    const sup = await as(F.owner, async (q) => (await q<{ id: string }>(`insert into suppliers (organization_id, name) values ($1, 'Pump Repairs Ltd') returning id`, [F.org]))[0].id)
    const bill = await rpc<{ supplier_bill_id: string }>(F.owner, 'record_supplier_bill', { p_key: key(), p_org: F.org, p_supplier: sup, p_bill_number: 'PR-9', p_bill_date: today(), p_amount: 30000, p_description: 'Pump rewind', p_site: F.site })
    await rejects(
      rpc(F.owner, 'record_maintenance', { p_key: key(), p_asset: pump, p_kind: 'repair', p_performed_on: today(), p_description: 'Rewind', p_cost: 30000, p_paid_now: true, p_payment_method: 'cash', p_supplier_bill: bill.supplier_bill_id }),
      /pay the bill instead/,
    )
    const r = await rpc<{ finance_transaction_id: string | null }>(F.owner, 'record_maintenance', {
      p_key: key(), p_asset: pump, p_kind: 'repair', p_performed_on: today(), p_description: 'Rewind', p_cost: 30000, p_supplier: sup, p_supplier_bill: bill.supplier_bill_id, p_condition_after: 'out_of_service',
    })
    expect(r.finance_transaction_id).toBeNull()
    expect((await alerts('equipment_down')).map((a) => a.entity_id)).toContain(pump)
  })

  it('workers see equipment but cannot change it; other farms see nothing', async () => {
    const worker = (await addMember(F.owner, F.org, 'health-worker', 'worker')).user
    const tractor = await asset('Tractor')
    expect(await as(worker, (q) => q(`select name from assets where id = $1`, [tractor]))).toEqual([{ name: 'Tractor' }])
    await rejects(rpc(worker, 'record_maintenance', { p_key: key(), p_asset: tractor, p_kind: 'inspection', p_performed_on: today(), p_description: 'Looked fine' }), /assets.manage/)
    await rejects(as(worker, (q) => q(`update assets set condition = 'poor' where id = $1 returning id`, [tractor]).then((rows) => { if (!rows.length) throw new Error('row-level security: no rows') })), /row-level security/)
    const other = await createFarm('health-other')
    expect(await as(other.owner, (q) => q(`select id from asset_summaries where id = $1`, [tractor]))).toEqual([])
    await rejects(rpc(other.owner, 'record_maintenance', { p_key: key(), p_asset: tractor, p_kind: 'inspection', p_performed_on: today(), p_description: 'x' }), /not found/)
  })
})

describe('health and biosecurity', () => {
  it('a treatment uses stock once and blocks selling animals and their eggs during the withdrawal period', async () => {
    const flock = await newBatch(F.owner, F.org, F.site, { quantity: 300, start: daysAgo(40) })
    const drug = await createItem(F.owner, F.org, `Oxytetracycline ${key().slice(0, 4)}`, { category: 'treatment', unit: (await pool.query(`select code from units where id = $1`, [ml])).rows[0].code })
    await rpc(F.owner, 'record_stock_receipt', { p_key: key(), p_store: F.store, p_item: drug, p_movement_type: 'opening', p_quantity: 1000, p_unit: ml, p_movement_date: daysAgo(30) })
    await rpc(F.owner, 'record_egg_collection', { p_key: key(), p_batch: flock, p_record_date: daysAgo(5), p_quantity: 10, p_unit: crate })
    await rpc(F.owner, 'record_egg_collection', { p_key: key(), p_batch: flock, p_record_date: daysAgo(1), p_quantity: 10, p_unit: crate })
    const [before, during] = (await pool.query(`select id from production_records where batch_id = $1 order by record_date`, [flock])).rows.map((r) => r.id as string)

    const h = await rpc<{ health_record_id: string; movement_id: string }>(F.owner, 'record_health', {
      p_key: key(), p_org: F.org,
      p: { record_type: 'treatment', site_id: F.site, record_date: daysAgo(3), title: 'CRD treatment', batch_id: flock, inventory_item_id: drug, quantity: 250, unit_id: ml, store_id: F.store, route: 'water', withdrawal_days: 7 },
    })
    expect(await stock(drug, F.store)).toBe(750)
    expect((await alerts('withdrawal_active')).map((a) => a.entity_id)).toContain(h.health_record_id)

    const sell = (lines: object[]) => rpc(F.owner, 'record_sale', { p_key: key(), p_org: F.org, p_site: F.site, p_sale_date: today(), p_lines: lines })
    await rejects(sell([{ line_type: 'livestock', batch_id: flock, quantity: 5, unit_id: each, unit_price: 5000 }]), /withdrawal period/)
    await rejects(sell([{ line_type: 'produce', production_record_id: during, quantity: 1, unit_id: crate, unit_price: 4000 }]), /withdrawal period/)
    // Eggs laid before the treatment can still be sold.
    await sell([{ line_type: 'produce', production_record_id: before, quantity: 1, unit_id: crate, unit_price: 4000 }])

    // Stock used by the treatment cannot be reversed on its own; voiding the record returns it and lifts the block.
    await rejects(rpc(F.owner, 'reverse_inventory_movement', { p_key: key(), p_movement: h.movement_id, p_reason: 'x' }), /Void the health record/)
    await rpc(F.owner, 'void_health_record', { p_key: key(), p_record: h.health_record_id, p_reason: 'Wrong batch' })
    expect(await stock(drug, F.store)).toBe(1000)
    await sell([{ line_type: 'livestock', batch_id: flock, quantity: 5, unit_id: each, unit_price: 5000 }])
    expect(await population(flock)).toBe(295)
  })

  it('a crop spray blocks selling the harvest until its pre-harvest interval ends', async () => {
    const ha = await unitId('ha')
    const field = await as(F.owner, async (q) => (await q<{ id: string }>(`insert into production_units (organization_id, site_id, production_type, kind, name, area, area_unit_id) values ($1,$2,'crop','field',$3, 1, $4) returning id`, [F.org, F.site, `Plot ${key().slice(0, 4)}`, ha]))[0].id)
    const cycle = await rpc<string>(F.owner, 'create_crop_cycle', { p_org: F.org, p_site: F.site, p_production_unit: field, p_code: `TM-${key().slice(0, 4)}`, p_crop: 'Tomato', p_area: 1, p_area_unit: ha, p_planting_date: daysAgo(80) })
    await rpc(F.owner, 'record_health', { p_key: key(), p_org: F.org, p: { record_type: 'pest_disease', site_id: F.site, record_date: daysAgo(2), title: 'Tuta absoluta spray', crop_cycle_id: cycle, severity: 'medium', withdrawal_days: 5 } })
    await rpc(F.owner, 'record_crop_harvest', { p_key: key(), p_cycle: cycle, p_record_date: today(), p_quantity: 200, p_unit: await unitId('kg') })
    const rec = (await pool.query(`select id from production_records where crop_cycle_id = $1`, [cycle])).rows[0].id
    await rejects(
      rpc(F.owner, 'record_sale', { p_key: key(), p_org: F.org, p_site: F.site, p_sale_date: today(), p_lines: [{ line_type: 'produce', production_record_id: rec, quantity: 10, unit_id: await unitId('kg'), unit_price: 800 }] }),
      /withdrawal period/,
    )
  })

  it('flags water outside safe ranges, open serious incidents and boosters due; access follows health permissions', async () => {
    const pond = await newBatch(F.owner, F.org, F.site, { type: 'fish', quantity: 1000, start: daysAgo(20) })
    const w = await rpc<{ health_record_id: string }>(F.owner, 'record_health', { p_key: key(), p_org: F.org, p: { record_type: 'water_quality', site_id: F.site, record_date: today(), title: 'Morning test', batch_id: pond, dissolved_oxygen_mg_l: 2.1, ph: 7.2, ammonia_mg_l: 0.8, water_temp_c: 29 } })
    expect((await alerts('water_quality')).map((a) => a.entity_id)).toContain(w.health_record_id)
    await rejects(rpc(F.owner, 'record_health', { p_key: key(), p_org: F.org, p: { record_type: 'water_quality', site_id: F.site, record_date: today(), title: 'Empty' , batch_id: pond } }), /check constraint|violates/)

    const inc = await rpc<{ health_record_id: string }>(F.owner, 'record_health', { p_key: key(), p_org: F.org, p: { record_type: 'incident', site_id: F.site, record_date: today(), title: 'Sudden deaths in pond', batch_id: pond, severity: 'critical', affected_count: 40 } })
    expect((await alerts('health_incident')).find((a) => a.entity_id === inc.health_record_id)).toBeTruthy()
    await rpc(F.owner, 'resolve_health_incident', { p_record: inc.health_record_id, p_resolved_on: today(), p_note: 'Aerator repaired' })
    expect((await alerts('health_incident')).find((a) => a.entity_id === inc.health_record_id)).toBeFalsy()

    const flock = await newBatch(F.owner, F.org, F.site, { quantity: 100, start: daysAgo(30) })
    const v = await rpc<{ health_record_id: string }>(F.owner, 'record_health', { p_key: key(), p_org: F.org, p: { record_type: 'vaccination', site_id: F.site, record_date: daysAgo(14), title: 'Gumboro (first dose)', batch_id: flock, route: 'water', next_due_on: daysAgo(1) } })
    expect((await alerts('vaccination_due')).map((a) => a.entity_id)).toContain(v.health_record_id)
    await rpc(F.owner, 'record_health', { p_key: key(), p_org: F.org, p: { record_type: 'vaccination', site_id: F.site, record_date: today(), title: 'Gumboro (booster)', batch_id: flock, route: 'water' } })
    expect((await alerts('vaccination_due')).map((a) => a.entity_id)).not.toContain(v.health_record_id)

    const worker = (await addMember(F.owner, F.org, 'health-worker2', 'worker')).user
    expect(await as(worker, (q) => q(`select id from health_records where id = $1`, [inc.health_record_id]))).toEqual([])
    await rejects(rpc(worker, 'record_health', { p_key: key(), p_org: F.org, p: { record_type: 'inspection', site_id: F.site, record_date: today(), title: 'x' } }), /health.record/)
    const other = await createFarm('health-other2')
    expect(await as(other.owner, (q) => q(`select id from health_record_summaries where id = $1`, [inc.health_record_id]))).toEqual([])
    await rejects(rpc(other.owner, 'void_health_record', { p_key: key(), p_record: inc.health_record_id, p_reason: 'x' }), /not found/)
  })
})
