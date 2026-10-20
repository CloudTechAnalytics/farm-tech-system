/**
 * Database test harness. Connects to the LOCAL Supabase Postgres started by
 * `npx supabase start` and runs every statement as a real signed-in user:
 * role `authenticated` with JWT claims set exactly as PostgREST sets them,
 * so Row Level Security and security-definer checks behave as in production.
 *
 * Never point this at a hosted project: it creates users directly.
 */
import pg from 'pg'
import { randomUUID } from 'node:crypto'

const DB_URL = process.env.TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
if (!/127\.0\.0\.1|localhost/.test(DB_URL)) {
  throw new Error('Database tests only run against a local database.')
}

export const pool = new pg.Pool({ connectionString: DB_URL, max: 8 })

// numeric -> number for readable assertions
pg.types.setTypeParser(1700, (v) => Number(v))
pg.types.setTypeParser(20, (v) => Number(v))

export interface TestUser {
  id: string
  email: string
}

export async function createUser(label: string): Promise<TestUser> {
  const id = randomUUID()
  const email = `${label}-${id.slice(0, 8)}@test.farmledger.local`
  await pool.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '', now(), '{}', $3, now(), now())`,
    [id, email, JSON.stringify({ full_name: label })],
  )
  return { id, email }
}

type Q = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>

/** Run fn inside one transaction as the given user (or anon when user is null). */
export async function as<T>(user: TestUser | null, fn: (q: Q) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    if (user) {
      const claims = JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated' })
      await client.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [claims, user.id])
      await client.query('set local role authenticated')
    } else {
      await client.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`)
      await client.query('set local role anon')
    }
    const q: Q = async (sql, params) => (await client.query(sql, params as unknown[])).rows
    const result = await fn(q)
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}

/** Call an RPC as a user and return its scalar/json result. */
export async function rpc<T = unknown>(user: TestUser | null, fn: string, args: Record<string, unknown>): Promise<T> {
  const names = Object.keys(args)
  const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`
  return as(user, async (q) => {
    const rows = await q<{ r: T }>(sql, names.map((n) => normalize(args[n])))
    return rows[0].r
  })
}

function normalize(v: unknown) {
  if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) return JSON.stringify(v)
  if (Array.isArray(v) && v.length && typeof v[0] === 'object') return JSON.stringify(v)
  return v
}

/** Expect a promise to reject with a message matching pattern. */
export async function rejects(p: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await p
  } catch (err) {
    const msg = (err as Error).message
    if (!pattern.test(msg)) throw new Error(`Expected error matching ${pattern}, got: ${msg}`)
    return
  }
  throw new Error(`Expected rejection matching ${pattern}, but it succeeded`)
}

export const key = () => randomUUID()

export async function unitId(code: string): Promise<string> {
  const { rows } = await pool.query(`select id from public.units where organization_id is null and code = $1`, [code])
  return rows[0].id
}

export async function categoryId(org: string, kind: string, code: string): Promise<string> {
  const { rows } = await pool.query(`select id from public.categories where organization_id = $1 and kind = $2 and code = $3`, [org, kind, code])
  return rows[0].id
}

export async function roleId(org: string, template: string): Promise<string> {
  const { rows } = await pool.query(`select id from public.roles where organization_id = $1 and template_key = $2`, [org, template])
  return rows[0].id
}

export async function defaultStore(site: string): Promise<string> {
  const { rows } = await pool.query(`select id from public.stores where site_id = $1 and is_default`, [site])
  return rows[0].id
}

/** A farm owner with an organization and one site. */
export async function createFarm(label: string, opts: { poultry?: boolean; fish?: boolean; crops?: boolean } = { poultry: true, fish: true, crops: true }) {
  const owner = await createUser(`${label}-owner`)
  const org = await rpc<string>(owner, 'create_organization', { p_name: `${label} Farms` })
  const site = await rpc<string>(owner, 'create_site', {
    p_org: org,
    p_name: `${label} Main Site`,
    p_has_poultry: !!opts.poultry,
    p_has_fish: !!opts.fish,
    p_has_crops: !!opts.crops,
  })
  return { owner, org, site, store: await defaultStore(site) }
}

/** Add a member with a template role, optionally scoped to sites, via the real invitation flow. */
export async function addMember(owner: TestUser, org: string, label: string, template: string, siteIds: string[] = []) {
  const user = await createUser(label)
  const role = await roleId(org, template)
  const inv = await rpc<{ token: string }>(owner, 'create_invitation', {
    p_org: org,
    p_email: user.email,
    p_role: role,
    p_access_scope: siteIds.length ? 'sites' : 'organization',
    p_site_ids: siteIds,
  })
  await rpc(user, 'accept_invitation', { p_token: inv.token })
  const { rows } = await pool.query(`select id from public.memberships where organization_id = $1 and user_id = $2`, [org, user.id])
  return { user, membershipId: rows[0].id as string }
}

export async function createItem(owner: TestUser, org: string, name: string, opts: { feed?: boolean; unit?: string; category?: string; reorder?: number } = {}) {
  const cat = await categoryId(org, 'inventory', opts.category ?? (opts.feed ? 'poultry_feed' : 'fertilizer'))
  const unit = await unitId(opts.unit ?? 'kg')
  return as(owner, async (q) => {
    const rows = await q<{ id: string }>(
      `insert into public.inventory_items (organization_id, name, category_id, base_unit_id, is_feed, reorder_level)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [org, name, cat, unit, !!opts.feed, opts.reorder ?? null],
    )
    return rows[0].id
  })
}

export async function population(batch: string): Promise<number> {
  const { rows } = await pool.query(`select coalesce(sum(quantity), 0)::int as p from public.batch_events where batch_id = $1`, [batch])
  return rows[0].p
}

export async function stock(item: string, store: string): Promise<number> {
  const { rows } = await pool.query(`select coalesce(sum(quantity), 0) as q from public.inventory_movements where item_id = $1 and store_id = $2`, [item, store])
  return Number(rows[0].q)
}

export async function feedAtBatch(batch: string, item: string): Promise<number> {
  const { rows } = await pool.query(`select coalesce(sum(quantity), 0) as q from public.feed_events where batch_id = $1 and item_id = $2`, [batch, item])
  return Number(rows[0].q)
}

export async function newBatch(owner: TestUser, org: string, site: string, opts: { type?: 'poultry' | 'fish'; quantity?: number; code?: string; start?: string } = {}) {
  const type = opts.type ?? 'poultry'
  const r = await rpc<{ batch_id: string }>(owner, 'create_batch', {
    p_key: key(),
    p_org: org,
    p_site: site,
    p_production_type: type,
    p_code: opts.code ?? `${type === 'fish' ? 'F' : 'P'}-${randomUUID().slice(0, 6)}`,
    p_species: type === 'fish' ? 'Catfish' : 'Chicken',
    p_purpose: type === 'fish' ? 'table_fish' : 'layers',
    p_start_date: opts.start ?? daysAgo(30),
    p_initial_quantity: opts.quantity ?? 1000,
  })
  return r.batch_id
}

export function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export const today = () => daysAgo(0)
