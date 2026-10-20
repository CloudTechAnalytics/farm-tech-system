import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addMember, as, categoryId, createFarm, createItem, createUser, key, newBatch, pool, rejects, rpc, today, unitId } from './helpers'

let A: Awaited<ReturnType<typeof createFarm>>
let B: Awaited<ReturnType<typeof createFarm>>
let batchA: string
let batchB: string
let feedA: string

beforeAll(async () => {
  A = await createFarm('alpha')
  B = await createFarm('bravo')
  batchA = await newBatch(A.owner, A.org, A.site)
  batchB = await newBatch(B.owner, B.org, B.site)
  feedA = await createItem(A.owner, A.org, 'Layer mash', { feed: true })
  await rpc(A.owner, 'record_stock_receipt', {
    p_key: key(), p_store: A.store, p_item: feedA, p_movement_type: 'opening', p_quantity: 500, p_unit: await unitId('kg'), p_movement_date: today(),
  })
})

afterAll(async () => {
  await pool.end()
})

const ORG_TABLES = [
  'organizations', 'farm_sites', 'memberships', 'roles', 'role_permissions', 'batches', 'batch_events', 'inventory_items',
  'inventory_movements', 'stores', 'feed_events', 'activity_logs', 'finance_transactions', 'categories', 'audit_events',
  'alert_settings', 'subscriptions', 'production_records', 'sales', 'invitations',
]

describe('tenant isolation', () => {
  it("a farm cannot read another farm's rows in any table", async () => {
    for (const table of ORG_TABLES) {
      const col = table === 'organizations' ? 'id' : 'organization_id'
      const rows = await as(A.owner, (q) => q(`select 1 from public.${table} where ${col} = $1`, [B.org]))
      expect(rows, `${table} leaked`).toHaveLength(0)
    }
  })

  it('views apply the same isolation', async () => {
    for (const view of ['batch_summaries', 'inventory_balances', 'production_record_balances', 'sale_summaries', 'crop_cycle_summaries', 'batch_events_net']) {
      const rows = await as(A.owner, (q) => q(`select 1 from public.${view} where organization_id = $1`, [B.org]))
      expect(rows, `${view} leaked`).toHaveLength(0)
    }
  })

  it("cannot act on another farm's batch by supplying its id", async () => {
    await rejects(
      rpc(A.owner, 'record_population_change', { p_key: key(), p_batch: batchB, p_kind: 'mortality', p_quantity: 5, p_event_date: today() }),
      /Batch not found|permission/,
    )
    expect(await as(B.owner, (q) => q(`select count(*)::int as n from public.batch_events where batch_id = $1`, [batchB]))).toEqual([{ n: 1 }])
  })

  it("cannot issue its own feed to another farm's batch, or another farm's stock to its batch", async () => {
    const kg = await unitId('kg')
    await rejects(
      rpc(A.owner, 'issue_feed', { p_key: key(), p_batch: batchB, p_store: A.store, p_item: feedA, p_quantity: 10, p_unit: kg, p_event_date: today() }),
      /not found|permission/i,
    )
    await rejects(
      rpc(A.owner, 'issue_feed', { p_key: key(), p_batch: batchA, p_store: B.store, p_item: feedA, p_quantity: 10, p_unit: kg, p_event_date: today() }),
      /not found|permission/i,
    )
  })

  it("cannot create a site, invite users or post money in another farm", async () => {
    await rejects(rpc(A.owner, 'create_site', { p_org: B.org, p_name: 'Hijack' }), /permission/)
    await rejects(
      rpc(A.owner, 'create_invitation', { p_org: B.org, p_email: 'x@example.com', p_role: (await pool.query(`select id from roles where organization_id=$1 and is_owner_role`, [B.org])).rows[0].id }),
      /permission/,
    )
    await rejects(
      rpc(A.owner, 'record_finance_transaction', {
        p_key: key(), p_org: B.org, p_kind: 'expense', p_category: await categoryId(B.org, 'expense', 'feed'), p_amount: 100, p_txn_date: today(), p_description: 'x',
      }),
      /permission/,
    )
  })

  it("composite foreign keys reject cross-tenant references even for the database owner's own functions", async () => {
    // Category from org B used with org A: rejected by the category check in the RPC.
    await rejects(
      rpc(A.owner, 'record_finance_transaction', {
        p_key: key(), p_org: A.org, p_kind: 'expense', p_category: await categoryId(B.org, 'expense', 'feed'), p_amount: 100, p_txn_date: today(), p_description: 'x',
      }),
      /category/i,
    )
    // Even as a superuser, a row cannot point at another tenant's site.
    await rejects(
      pool.query(`insert into public.production_units (organization_id, site_id, production_type, kind, name) values ($1, $2, 'poultry', 'pen', 'X')`, [A.org, B.site]),
      /foreign key/,
    )
  })

  it('cannot update or delete rows in another farm', async () => {
    const updated = await as(A.owner, (q) => q(`update public.farm_sites set name = 'pwned' where id = $1 returning id`, [B.site]))
    expect(updated).toHaveLength(0)
    const name = (await pool.query(`select name from farm_sites where id = $1`, [B.site])).rows[0].name
    expect(name).not.toBe('pwned')
  })
})

describe('direct writes are blocked; ledgers change only through RPCs', () => {
  it('cannot insert, update or delete ledger rows directly', async () => {
    await rejects(
      as(A.owner, (q) => q(`insert into public.batch_events (organization_id, site_id, batch_id, event_date, kind, quantity) values ($1,$2,$3,current_date,'acquisition',100)`, [A.org, A.site, batchA])),
      /permission denied/,
    )
    await rejects(as(A.owner, (q) => q(`update public.batch_events set quantity = 5000 where batch_id = $1`, [batchA])), /permission denied/)
    await rejects(as(A.owner, (q) => q(`delete from public.inventory_movements where organization_id = $1`, [A.org])), /permission denied/)
    await rejects(as(A.owner, (q) => q(`update public.finance_transactions set amount = 1 where organization_id = $1`, [A.org])), /permission denied/)
  })

  it('cannot forge audit history', async () => {
    await rejects(
      as(A.owner, (q) => q(`insert into public.audit_events (organization_id, action, entity_type) values ($1, 'fake', 'x')`, [B.org])),
      /permission denied/,
    )
    await rejects(as(A.owner, (q) => q(`delete from public.audit_events where organization_id = $1`, [A.org])), /permission denied/)
  })

  it('cannot make yourself a platform administrator', async () => {
    await rejects(as(A.owner, (q) => q(`insert into public.platform_admins (user_id) values ($1)`, [A.owner.id])), /permission denied/)
    // Profiles have no admin flag at all; only name and phone are writable.
    await rejects(as(A.owner, (q) => q(`update public.profiles set email = 'other@example.com' where id = $1`, [A.owner.id])), /permission denied/)
    await rejects(rpc(A.owner, 'platform_overview', {}), /Platform administrators only/)
  })

  it('cannot change organization plan or status', async () => {
    await rejects(as(A.owner, (q) => q(`update public.organizations set status = 'active' where id = $1`, [A.org])), /permission denied/)
    await rejects(as(A.owner, (q) => q(`update public.subscriptions set plan_key = 'enterprise' where organization_id = $1`, [A.org])), /permission denied/)
  })

  it('anonymous visitors can read nothing and call nothing', async () => {
    for (const table of ['organizations', 'farm_sites', 'batches', 'profiles', 'finance_transactions']) {
      await rejects(as(null, (q) => q(`select 1 from public.${table} limit 1`)), /permission denied/)
    }
    await rejects(rpc(null, 'create_organization', { p_name: 'Anon farm' }), /permission denied/)
  })
})

describe('roles and site scoping inside one farm', () => {
  let site2: string
  let batch2: string
  let worker: Awaited<ReturnType<typeof addMember>>
  let accountant: Awaited<ReturnType<typeof addMember>>

  beforeAll(async () => {
    site2 = await rpc<string>(A.owner, 'create_site', { p_org: A.org, p_name: 'Alpha North', p_has_poultry: true })
    batch2 = await newBatch(A.owner, A.org, site2)
    worker = await addMember(A.owner, A.org, 'worker', 'worker', [A.site])
    accountant = await addMember(A.owner, A.org, 'accountant', 'accountant')
    await rpc(A.owner, 'record_finance_transaction', {
      p_key: key(), p_org: A.org, p_site: A.site, p_kind: 'expense', p_category: await categoryId(A.org, 'expense', 'labour'), p_amount: 25000, p_txn_date: today(), p_description: 'Casual labour',
    })
  })

  it('a site-scoped worker sees only their site', async () => {
    const sites = await as(worker.user, (q) => q<{ id: string }>(`select id from public.farm_sites where organization_id = $1`, [A.org]))
    expect(sites.map((s) => s.id)).toEqual([A.site])
    const batches = await as(worker.user, (q) => q<{ id: string }>(`select id from public.batches where organization_id = $1`, [A.org]))
    expect(batches.map((b) => b.id)).toEqual([batchA])
  })

  it('a site-scoped worker cannot record on another site', async () => {
    await rejects(
      rpc(worker.user, 'record_population_change', { p_key: key(), p_batch: batch2, p_kind: 'mortality', p_quantity: 1, p_event_date: today() }),
      /not found/,
    )
  })

  it('a worker can record daily work but not see money or manage batches', async () => {
    const r = await rpc<{ population: number }>(worker.user, 'record_population_change', { p_key: key(), p_batch: batchA, p_kind: 'mortality', p_quantity: 2, p_event_date: today() })
    expect(r.population).toBe(998)
    const money = await as(worker.user, (q) => q(`select 1 from public.finance_transactions where organization_id = $1`, [A.org]))
    expect(money).toHaveLength(0)
    await rejects(rpc(worker.user, 'close_batch', { p_batch: batchA, p_closed_on: today(), p_reason: 'x', p_write_off_remaining: true }), /permission/)
    await rejects(rpc(worker.user, 'report_finance_monthly', { p_org: A.org, p_from: today(), p_to: today() }), /permission to view financial/)
    const dash = await rpc<{ finance: unknown }>(worker.user, 'dashboard_summary', { p_org: A.org, p_from: today(), p_to: today() })
    expect(dash.finance).toBeNull()
  })

  it('an accountant sees finance but cannot record mortality', async () => {
    const money = await as(accountant.user, (q) => q(`select amount from public.finance_transactions where organization_id = $1`, [A.org]))
    expect(money.length).toBeGreaterThan(0)
    await rejects(
      rpc(accountant.user, 'record_population_change', { p_key: key(), p_batch: batchA, p_kind: 'mortality', p_quantity: 1, p_event_date: today() }),
      /permission/,
    )
  })

  it('removing a member revokes access immediately', async () => {
    const temp = await addMember(A.owner, A.org, 'temp', 'manager')
    expect(await as(temp.user, (q) => q(`select 1 from public.batches where organization_id = $1`, [A.org]))).not.toHaveLength(0)
    await rpc(A.owner, 'set_member_status', { p_membership: temp.membershipId, p_status: 'removed' })
    expect(await as(temp.user, (q) => q(`select 1 from public.batches where organization_id = $1`, [A.org]))).toHaveLength(0)
    await rejects(
      rpc(temp.user, 'record_population_change', { p_key: key(), p_batch: batchA, p_kind: 'mortality', p_quantity: 1, p_event_date: today() }),
      /not found|permission/,
    )
  })

  it('the last owner cannot be removed or demoted, and non-owners cannot grant ownership', async () => {
    const ownerMembership = (await pool.query(`select id from memberships where organization_id = $1 and user_id = $2`, [A.org, A.owner.id])).rows[0].id
    const manager = await addMember(A.owner, A.org, 'mgr2', 'manager')
    await rejects(rpc(A.owner, 'set_member_status', { p_membership: ownerMembership, p_status: 'removed' }), /yourself/)
    await rejects(
      rpc(A.owner, 'update_member_access', { p_membership: ownerMembership, p_role: (await pool.query(`select id from roles where organization_id=$1 and template_key='manager'`, [A.org])).rows[0].id, p_access_scope: 'organization' }),
      /at least one farm owner/,
    )
    // Give the manager member-management rights, then confirm they still cannot create owners.
    const mgrRole = (await pool.query(`select id from roles where organization_id=$1 and template_key='manager'`, [A.org])).rows[0].id
    const keys = (await pool.query(`select permission_key from role_permissions where role_id=$1`, [mgrRole])).rows.map((r) => r.permission_key)
    await rpc(A.owner, 'set_role_permissions', { p_role: mgrRole, p_permission_keys: [...keys, 'members.manage'] })
    const ownerRole = (await pool.query(`select id from roles where organization_id=$1 and is_owner_role`, [A.org])).rows[0].id
    await rejects(rpc(manager.user, 'create_invitation', { p_org: A.org, p_email: 'new@example.com', p_role: ownerRole }), /Only a farm owner/)
    await rejects(rpc(manager.user, 'update_member_access', { p_membership: manager.membershipId, p_role: ownerRole, p_access_scope: 'organization' }), /Only a farm owner/)
  })

  it('invitations only work for the invited email address', async () => {
    const stranger = await createUser('stranger')
    const inv = await rpc<{ token: string }>(A.owner, 'create_invitation', {
      p_org: A.org, p_email: 'someone-else@example.com', p_role: (await pool.query(`select id from roles where organization_id=$1 and template_key='worker'`, [A.org])).rows[0].id,
    })
    await rejects(rpc(stranger, 'accept_invitation', { p_token: inv.token }), /different email/)
    const info = await rpc<{ status: string }>(stranger, 'get_invitation', { p_token: inv.token })
    expect(info.status).toBe('wrong_email')
    const stored = (await pool.query(`select token_hash from invitations where organization_id = $1 and email = 'someone-else@example.com'`, [A.org])).rows[0]
    expect(stored.token_hash).not.toBe(inv.token)
  })

  it('records the changes in the audit history', async () => {
    const rows = await as(A.owner, (q) => q<{ action: string }>(`select action from public.audit_events where organization_id = $1`, [A.org]))
    const actions = new Set(rows.map((r) => r.action))
    expect(actions.has('organization.created')).toBe(true)
    expect(actions.has('farm_sites.insert')).toBe(true)
    expect(actions.has('memberships.update')).toBe(true)
    expect(actions.has('finance.recorded')).toBe(true)
  })
})

describe('organization deletion', () => {
  it('removes every record belonging to the organization and nothing else', async () => {
    const D = await createFarm('delete-me')
    const batch = await newBatch(D.owner, D.org, D.site)
    await rpc(D.owner, 'record_population_change', { p_key: key(), p_batch: batch, p_kind: 'mortality', p_quantity: 1, p_event_date: today() })
    const otherBefore = (await pool.query(`select count(*)::int as n from batches where organization_id = $1`, [A.org])).rows[0].n
    // Performed with the service role (support runbook), never from the browser.
    await pool.query(`delete from public.organizations where id = $1`, [D.org])
    for (const table of ['farm_sites', 'batches', 'batch_events', 'categories', 'memberships', 'roles', 'activity_logs', 'audit_events']) {
      const n = (await pool.query(`select count(*)::int as n from public.${table} where organization_id = $1`, [D.org])).rows[0].n
      expect(n, table).toBe(0)
    }
    expect((await pool.query(`select count(*)::int as n from batches where organization_id = $1`, [A.org])).rows[0].n).toBe(otherBefore)
  })
})
