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
void each

console.log(`Demo farm ready. Sign in as ${EMAIL} / Harvest2026`)
await pool.end()
