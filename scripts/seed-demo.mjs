#!/usr/bin/env node
/**
 * Demo data for LOCAL development only. Creates a demo owner and a farm with
 * a layer flock, a fish batch, a maize cycle, stock, sales and expenses, all
 * written through the same RPCs the app uses (so every rule applies).
 *
 *   npm run db:start && node scripts/seed-demo.mjs
 *   sign in: demo.owner@farmledger.local / Harvest2026
 *
 * Refuses to run against anything that is not localhost.
 */
import pg from 'pg'
import { randomUUID } from 'node:crypto'

const DB_URL = process.env.DEMO_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
if (!/@(127\.0\.0\.1|localhost):/.test(DB_URL)) {
  console.error('Refusing to seed a non-local database. Demo data must never reach staging or production.')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: DB_URL })
const EMAIL = 'demo.owner@farmledger.local'
const day = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

async function as(user, sql, params = []) {
  const c = await pool.connect()
  try {
    await c.query('begin')
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated' })])
    await c.query('set local role authenticated')
    const r = await c.query(sql, params)
    await c.query('commit')
    return r.rows
  } catch (e) {
    await c.query('rollback')
    throw e
  } finally {
    c.release()
  }
}
const rpc = async (user, fn, args) => {
  const keys = Object.keys(args)
  const rows = await as(user, `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => (args[k] && typeof args[k] === 'object' && !Array.isArray(args[k]) ? JSON.stringify(args[k]) : Array.isArray(args[k]) && typeof args[k][0] === 'object' ? JSON.stringify(args[k]) : args[k])))
  return rows[0].r
}
const one = async (sql, p) => (await pool.query(sql, p)).rows[0]

const existing = await one(`select id from auth.users where email = $1`, [EMAIL])
if (existing) {
  if (!process.argv.includes('--reset')) {
    console.log(`Demo user already exists. Sign in as ${EMAIL} / Harvest2026 (run with --reset to rebuild it)`)
    process.exit(0)
  }
  await pool.query(`delete from public.organizations where created_by = $1`, [existing.id])
  await pool.query(`delete from auth.users where id = $1`, [existing.id])
}

const id = randomUUID()
await pool.query(
  `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
   values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, extensions.crypt('Harvest2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Owner"}', now(), now(), '', '', '', '')`,
  [id, EMAIL],
)
await pool.query(
  `insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
   values (gen_random_uuid(), $1::uuid, $1::text, jsonb_build_object('sub', $1::text, 'email', $2::text), 'email', now(), now(), now())`,
  [id, EMAIL],
)
const u = { id, email: EMAIL }
const k = () => randomUUID()

const org = await rpc(u, 'create_organization', { p_name: 'Sunrise Agro Demo' })
const site = await rpc(u, 'create_site', { p_org: org, p_name: 'Ibadan farm', p_state_region: 'Oyo', p_has_poultry: true, p_has_fish: true, p_has_crops: true })
const store = (await one(`select id from stores where site_id = $1 and is_default`, [site])).id
const unit = async (code) => (await one(`select id from units where organization_id is null and code = $1`, [code])).id
const cat = async (kind, code) => (await one(`select id from categories where organization_id = $1 and kind = $2 and code = $3`, [org, kind, code])).id
const [kg, bag25, crate, ha, each] = await Promise.all(['kg', 'bag25', 'crate30', 'ha', 'each'].map(unit))

const pu = async (type, kind, name, area) =>
  (await as(u, `insert into public.production_units (organization_id, site_id, production_type, kind, name, area, area_unit_id) values ($1,$2,$3,$4,$5,$6,$7) returning id`, [org, site, type, kind, name, area ?? null, area ? ha : null]))[0].id
const house = await pu('poultry', 'poultry_house', 'House A')
const pond = await pu('fish', 'pond', 'Pond 1')
const field = await pu('crop', 'field', 'North field', 2)

const item = async (name, code, feed, reorder) =>
  (await as(u, `insert into public.inventory_items (organization_id, name, category_id, base_unit_id, is_feed, reorder_level) values ($1,$2,$3,$4,$5,$6) returning id`, [org, name, await cat('inventory', code), kg, feed, reorder]))[0].id
const layerMash = await item('Layer mash', 'poultry_feed', true, 250)
const fishFeed = await item('Floating fish feed 4mm', 'fish_feed', true, 100)
const npk = await item('NPK 15-15-15', 'fertilizer', false, 50)

await rpc(u, 'record_stock_receipt', { p_key: k(), p_store: store, p_item: layerMash, p_movement_type: 'purchase', p_quantity: 100, p_unit: bag25, p_movement_date: day(28), p_total_cost: 1200000, p_supplier: 'Top Feeds', p_record_expense: true, p_payment_method: 'bank_transfer' })
await rpc(u, 'record_stock_receipt', { p_key: k(), p_store: store, p_item: fishFeed, p_movement_type: 'purchase', p_quantity: 300, p_unit: kg, p_movement_date: day(28), p_total_cost: 390000, p_record_expense: true, p_payment_method: 'cash' })
await rpc(u, 'record_stock_receipt', { p_key: k(), p_store: store, p_item: npk, p_movement_type: 'opening', p_quantity: 200, p_unit: kg, p_movement_date: day(60) })

const flock = (await rpc(u, 'create_batch', { p_key: k(), p_org: org, p_site: site, p_production_type: 'poultry', p_code: 'PB-DEMO-A', p_species: 'Chicken', p_breed: 'Isa Brown', p_purpose: 'layers', p_start_date: day(27), p_initial_quantity: 800, p_start_kind: 'opening', p_production_unit: house })).batch_id
const fish = (await rpc(u, 'create_batch', { p_key: k(), p_org: org, p_site: site, p_production_type: 'fish', p_code: 'FB-DEMO-1', p_species: 'Catfish (Clarias)', p_purpose: 'table_fish', p_start_date: day(27), p_initial_quantity: 3000, p_production_unit: pond, p_purchase_amount: 150000, p_payment_method: 'cash' })).batch_id
const cycle = await rpc(u, 'create_crop_cycle', { p_org: org, p_site: site, p_production_unit: field, p_code: 'MZ-DEMO', p_crop: 'Maize', p_variety: 'SAMMAZ 15', p_area: 2, p_area_unit: ha, p_planting_date: day(80), p_expected_harvest_date: day(-10) })
await rpc(u, 'record_stock_usage', { p_key: k(), p_store: store, p_item: npk, p_quantity: 150, p_unit: kg, p_movement_date: day(55), p_crop_cycle: cycle, p_activity_code: 'fertilizer' })

for (let d = 26; d >= 1; d--) {
  await rpc(u, 'issue_feed', { p_key: k(), p_batch: flock, p_store: store, p_item: layerMash, p_quantity: 90, p_unit: kg, p_event_date: day(d), p_consumed_now: true })
  await rpc(u, 'issue_feed', { p_key: k(), p_batch: fish, p_store: store, p_item: fishFeed, p_quantity: 9, p_unit: kg, p_event_date: day(d), p_consumed_now: true })
  if (d % 3 === 0) await rpc(u, 'record_population_change', { p_key: k(), p_batch: flock, p_kind: 'mortality', p_quantity: 1 + (d % 2), p_event_date: day(d) })
  if (d % 4 === 0) await rpc(u, 'record_population_change', { p_key: k(), p_batch: fish, p_kind: 'mortality', p_quantity: 6, p_event_date: day(d) })
  await rpc(u, 'record_egg_collection', { p_key: k(), p_batch: flock, p_record_date: day(d), p_quantity: 21 + (d % 3), p_unit: crate, p_rejected_quantity: d % 5 === 0 ? 1 : 0 })
}
await rpc(u, 'record_fish_sample', { p_key: k(), p_batch: fish, p_sample_date: day(3), p_sample_size: 30, p_total_weight_g: 13500 })
await rpc(u, 'record_crop_harvest', { p_key: k(), p_cycle: cycle, p_record_date: day(2), p_quantity: 5.8, p_unit: await unit('tonne'), p_rejected_quantity: 0.3 })

const eggs = await one(`select id from production_record_balances where batch_id = $1 and available_quantity > 15 order by record_date limit 1`, [flock])
await rpc(u, 'record_sale', { p_key: k(), p_org: org, p_site: site, p_sale_date: day(5), p_customer_name: 'Bodija Market Ventures', p_lines: [{ line_type: 'produce', production_record_id: eggs.id, quantity: 15, unit_id: crate, unit_price: 4800 }], p_amount_received: 72000, p_payment_method: 'cash' })
await rpc(u, 'record_finance_transaction', { p_key: k(), p_org: org, p_site: site, p_kind: 'expense', p_category: await cat('expense', 'labour'), p_amount: 85000, p_txn_date: day(7), p_description: 'Farm hands, weekly wages', p_payment_method: 'cash' })
await rpc(u, 'record_finance_transaction', { p_key: k(), p_org: org, p_site: site, p_kind: 'expense', p_category: await cat('expense', 'veterinary'), p_amount: 18500, p_txn_date: day(12), p_description: 'Newcastle vaccine (Lasota)', p_payment_method: 'pos', p_batch: flock })

// Customers, products, an overdue invoice and orders at different stages.
const customer = async (name, category, phone, terms, limit) =>
  (await as(u, `insert into public.customers (organization_id, name, category, phone, city, payment_terms_days, credit_limit) values ($1,$2,$3,$4,'Ibadan',$5,$6) returning id`, [org, name, category, phone, terms, limit]))[0].id
const bodija = await customer('Bodija Market Ventures', 'wholesaler', '0803 555 0101', 14, 500000)
const amala = await customer('Amala Spot Restaurant', 'hotel_restaurant', '0805 555 0122', 7, 150000)
await customer('Mrs. Adeyemi', 'individual', '0816 555 0190', 0, null)
const product = async (name, type, source, match, unitId, price) =>
  (await as(u, `insert into public.products (organization_id, name, production_type, source_kind, match_name, unit_id, default_price) values ($1,$2,$3,$4,$5,$6,$7) returning id`, [org, name, type, source, match, unitId, price]))[0].id
const eggCrate = await product('Eggs (crate of 30)', 'poultry', 'produce', 'Eggs', crate, 4800)
const maize = await product('Maize grain', 'crop', 'produce', 'Maize', kg, 420)
await product('Spent layers (live)', 'poultry', 'livestock', 'Chicken', each, 3500)
await product('Poultry manure (bag)', 'general', 'other', null, each, 1500)
await as(u, `insert into public.customer_prices (organization_id, customer_id, product_id, unit_price) values ($1,$2,$3,4600)`, [org, bodija, eggCrate])

const oldEggs = await one(`select id from production_record_balances where batch_id = $1 order by record_date limit 1`, [flock])
await rpc(u, 'record_sale', { p_key: k(), p_org: org, p_site: site, p_sale_date: day(20), p_customer: amala, p_lines: [{ line_type: 'produce', production_record_id: oldEggs.id, quantity: 8, unit_id: crate, unit_price: 4800 }], p_amount_received: 10000, p_payment_method: 'bank_transfer' })
const big = await rpc(u, 'create_sales_order', { p_key: k(), p_org: org, p_site: site, p_customer: bodija, p_order_date: day(4), p_required_by: day(-3), p_lines: [{ product_id: eggCrate, quantity: 60 }, { product_id: maize, quantity: 1500 }] })
const bigLines = (await pool.query(`select id, product_id from sales_order_lines where sales_order_id = $1`, [big.sales_order_id])).rows
await rpc(u, 'fulfil_sales_order', { p_key: k(), p_order: big.sales_order_id, p_fulfil_date: day(1), p_lines: bigLines.map((l) => ({ order_line_id: l.id, quantity: l.product_id === eggCrate ? 40 : 1000 })), p_amount_received: 300000, p_payment_method: 'bank_transfer' })
await rpc(u, 'create_sales_order', { p_key: k(), p_org: org, p_site: site, p_customer: amala, p_order_date: day(0), p_required_by: day(-2), p_lines: [{ product_id: eggCrate, quantity: 10 }] })

// Suppliers: a feed order part received and part paid, plus a request waiting for approval.
const supplier = async (name, category, terms) =>
  (await as(u, `insert into public.suppliers (organization_id, name, category, phone, city, payment_terms_days) values ($1,$2,$3,'0802 555 0300','Ibadan',$4) returning id`, [org, name, category, terms]))[0].id
const topFeeds = await supplier('Top Feeds Ltd', 'feed', 30)
await supplier('Agro-Allied Inputs', 'agrochemical', 14)
const pr = await rpc(u, 'create_purchase_request', { p_key: k(), p_org: org, p_site: site, p_reason: 'Layer mash for House A for the next month', p_needed_by: day(-5), p_lines: [{ item_id: layerMash, quantity: 60, unit_id: bag25, estimated_unit_cost: 11500 }] })
await rpc(u, 'decide_purchase_request', { p_request: pr.purchase_request_id, p_decision: 'approved' })
const po = await rpc(u, 'create_purchase_order', { p_key: k(), p_org: org, p_site: site, p_supplier: topFeeds, p_store: store, p_order_date: day(6), p_expected_date: day(2), p_request: pr.purchase_request_id, p_lines: [{ item_id: layerMash, quantity: 60, unit_id: bag25, unit_price: 11800 }] })
const poLine = (await one(`select id from purchase_order_lines where purchase_order_id = $1`, [po.purchase_order_id])).id
await rpc(u, 'receive_purchase_order', { p_key: k(), p_order: po.purchase_order_id, p_received_date: day(3), p_delivery_reference: 'TF-DN-2291', p_lines: [{ order_line_id: poLine, quantity_received: 40, quantity_rejected: 1, rejection_reason: 'Torn bag' }] })
const bill = await rpc(u, 'record_supplier_bill', { p_key: k(), p_org: org, p_supplier: topFeeds, p_bill_number: 'TF-INV-10432', p_bill_date: day(3), p_amount: 472000, p_description: '40 bags layer mash', p_order: po.purchase_order_id })
await rpc(u, 'pay_supplier_bill', { p_key: k(), p_bill: bill.supplier_bill_id, p_amount: 250000, p_payment_date: day(1), p_payment_method: 'bank_transfer', p_reference: 'TRF 88213' })
await rpc(u, 'create_purchase_request', { p_key: k(), p_org: org, p_site: site, p_reason: 'NPK top-up for the north field', p_lines: [{ item_id: npk, quantity: 4, unit_id: bag25 }] })

// Workers and tasks: one overdue, one waiting for review, one weekly.
const worker = async (name, title, phone) => rpc(u, 'save_employee', { p_employee: null, p_org: org, p_full_name: name, p_site_ids: [site], p_job_title: title, p_phone: phone, p_start_date: day(400) })
const musa = await worker('Musa Ibrahim', 'Pen attendant', '0803 555 0411')
const ngozi = await worker('Ngozi Eze', 'Fish farm hand', '0806 555 0422')
const taskWith = async (title, type, code, due, extra) => rpc(u, 'save_task', { p_task: null, p_org: org, p_site: site, p_production_type: type, p_category: await cat('activity', code), p_title: title, p_due_on: due, ...extra })
await taskWith('Newcastle (Lasota) booster, House A', 'poultry', 'vaccination', day(2), { p_batch: flock, p_assigned_employee: musa, p_priority: 'high', p_requires_review: true })
const pondCheck = await taskWith('Check pond water and inlet screens', 'fish', 'cleaning', day(0), { p_batch: fish, p_assigned_employee: ngozi, p_requires_review: true })
await rpc(u, 'set_task_status', { p_task: pondCheck, p_status: 'done', p_note: 'Screens cleared, water clear' })
await taskWith('Wash and disinfect drinkers', 'poultry', 'cleaning', day(-2), { p_assigned_employee: musa, p_repeat_every_days: 7 })
await taskWith('Top-dress maize with urea', 'crop', 'fertilizer', day(-5), { p_crop_cycle: cycle })

// Equipment with schedules, and health records: a booster due, a water test out of range, an open incident.
const equipment = async (name, category, unitId) =>
  (await as(u, `insert into public.assets (organization_id, site_id, name, category, production_unit_id, make, purchase_date) values ($1,$2,$3,$4,$5,'Mikano',$6) returning id`, [org, site, name, category, unitId, day(700)]))[0].id
const generator = await equipment('Generator 20kVA', 'generator', null)
const aerator = await equipment('Pond aerator', 'pump', pond)
const plan = (assetId, title, every, due) => as(u, `insert into public.maintenance_plans (organization_id, site_id, asset_id, title, interval_days, next_due_on) values ($1,$2,$3,$4,$5,$6) returning id`, [org, site, assetId, title, every, due])
const [genPlan] = await plan(generator, 'Oil and filter change', 90, day(95))
await plan(aerator, 'Clean impeller and check bearings', 30, day(3))
await rpc(u, 'record_maintenance', { p_key: k(), p_asset: generator, p_kind: 'service', p_performed_on: day(5), p_description: 'Oil, oil filter and air filter changed', p_plan: genPlan.id, p_cost: 38500, p_paid_now: true, p_payment_method: 'cash', p_performed_by: 'Sule Mechanics', p_downtime_hours: 2 })
await rpc(u, 'record_health', { p_key: k(), p_org: org, p: { record_type: 'vaccination', site_id: site, record_date: day(20), title: 'Newcastle (Lasota), first dose', batch_id: flock, route: 'water', next_due_on: day(1), administered_by: 'Musa Ibrahim' } })
await rpc(u, 'record_health', { p_key: k(), p_org: org, p: { record_type: 'inspection', site_id: site, record_date: day(2), title: 'Weekly biosecurity walk', production_type: 'general', outcome: 'needs_action', action_taken: 'Footbath at House A refilled' } })
await rpc(u, 'record_health', { p_key: k(), p_org: org, p: { record_type: 'water_quality', site_id: site, record_date: day(0), title: 'Morning test', batch_id: fish, production_unit_id: pond, dissolved_oxygen_mg_l: 2.6, ph: 7.4, ammonia_mg_l: 0.3, water_temp_c: 29.5 } })
await rpc(u, 'record_health', { p_key: k(), p_org: org, p: { record_type: 'incident', site_id: site, record_date: day(0), title: 'Fish gasping at the surface', batch_id: fish, severity: 'high', affected_count: 15, action_taken: 'Aerator restarted, feeding stopped for the day' } })

console.log(`Demo farm ready. Sign in as ${EMAIL} / Harvest2026`)
await pool.end()
