import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { as, categoryId, createFarm, createItem, daysAgo, feedAtBatch, key, newBatch, pool, population, rejects, rpc, stock, today, unitId } from './helpers'

let F: Awaited<ReturnType<typeof createFarm>>
let kg: string
let bag25: string
let each: string

beforeAll(async () => {
  F = await createFarm('ledger')
  kg = await unitId('kg')
  bag25 = await unitId('bag25')
  each = await unitId('each')
})

afterAll(async () => {
  await pool.end()
})

describe('poultry population', () => {
  it('reconciles through valid transactions and never goes negative', async () => {
    const batch = await newBatch(F.owner, F.org, F.site, { quantity: 500 })
    await rpc(F.owner, 'record_population_change', { p_key: key(), p_batch: batch, p_kind: 'mortality', p_quantity: 12, p_event_date: today(), p_reason: 'Heat stress' })
    await rpc(F.owner, 'record_population_change', { p_key: key(), p_batch: batch, p_kind: 'cull', p_quantity: 8, p_event_date: today() })
    expect(await population(batch)).toBe(480)
    await rejects(rpc(F.owner, 'record_population_change', { p_key: key(), p_batch: batch, p_kind: 'mortality', p_quantity: 481, p_event_date: today() }), /has 480 birds recorded/)
    await rejects(rpc(F.owner, 'record_population_change', { p_key: key(), p_batch: batch, p_kind: 'theft_loss', p_quantity: 1, p_event_date: today() }), /reason is required/)
    const summary = (await pool.query(`select current_population, total_mortality, total_culled, mortality_pct from batch_summaries where id = $1`, [batch])).rows[0]
    expect(summary).toMatchObject({ current_population: 480, total_mortality: 12, total_culled: 8, mortality_pct: 2.4 })
  })

  it('a repeated submission is applied once', async () => {
    const batch = await newBatch(F.owner, F.org, F.site, { quantity: 100 })
    const k = key()
    const first = await rpc<{ replayed: boolean }>(F.owner, 'record_population_change', { p_key: k, p_batch: batch, p_kind: 'mortality', p_quantity: 3, p_event_date: today() })
    const second = await rpc<{ replayed: boolean }>(F.owner, 'record_population_change', { p_key: k, p_batch: batch, p_kind: 'mortality', p_quantity: 3, p_event_date: today() })
    expect(first.replayed).toBe(false)
    expect(second.replayed).toBe(true)
    expect(await population(batch)).toBe(97)
  })

  it('concurrent duplicates with the same key still apply once', async () => {
    const batch = await newBatch(F.owner, F.org, F.site, { quantity: 100 })
    const k = key()
    await Promise.all(
      Array.from({ length: 5 }, () => rpc(F.owner, 'record_population_change', { p_key: k, p_batch: batch, p_kind: 'mortality', p_quantity: 4, p_event_date: today() })),
    )
    expect(await population(batch)).toBe(96)
  })

  it('a reversal restores the count and keeps the history', async () => {
    const batch = await newBatch(F.owner, F.org, F.site, { quantity: 100 })
    await rpc(F.owner, 'record_population_change', { p_key: key(), p_batch: batch, p_kind: 'mortality', p_quantity: 10, p_event_date: today() })
    const ev = (await pool.query(`select id from batch_events where batch_id = $1 and kind = 'mortality'`, [batch])).rows[0].id
    await rpc(F.owner, 'reverse_batch_event', { p_key: key(), p_event: ev, p_reason: 'Entered on wrong batch' })
    expect(await population(batch)).toBe(100)
    await rejects(rpc(F.owner, 'reverse_batch_event', { p_key: key(), p_event: ev, p_reason: 'again' }), /already been reversed/)
    const rows = (await pool.query(`select kind from batch_events where batch_id = $1 order by created_at`, [batch])).rows.map((r) => r.kind)
    expect(rows).toEqual(['acquisition', 'mortality', 'reversal'])
    const net = (await pool.query(`select total_mortality from batch_summaries where id = $1`, [batch])).rows[0]
    expect(net.total_mortality).toBe(0)
  })

  it('transfers move birds between batches and both sides reconcile', async () => {
    const a = await newBatch(F.owner, F.org, F.site, { quantity: 300 })
    const b = await newBatch(F.owner, F.org, F.site, { quantity: 100 })
    await rpc(F.owner, 'transfer_between_batches', { p_key: key(), p_from_batch: a, p_to_batch: b, p_quantity: 50, p_event_date: today() })
    expect(await population(a)).toBe(250)
    expect(await population(b)).toBe(150)
    await rejects(rpc(F.owner, 'transfer_between_batches', { p_key: key(), p_from_batch: a, p_to_batch: b, p_quantity: 251, p_event_date: today() }), /only 250/)
  })

  it('closing requires the population to be accounted for, or an explicit write-off', async () => {
    const batch = await newBatch(F.owner, F.org, F.site, { quantity: 40 })
    await rejects(rpc(F.owner, 'close_batch', { p_batch: batch, p_closed_on: today(), p_reason: '' }), /still has 40 recorded/)
    const r = await rpc<{ written_off: number }>(F.owner, 'close_batch', { p_batch: batch, p_closed_on: today(), p_reason: 'End of lay', p_write_off_remaining: true })
    expect(r.written_off).toBe(40)
    expect(await population(batch)).toBe(0)
    await rejects(rpc(F.owner, 'record_population_change', { p_key: key(), p_batch: batch, p_kind: 'mortality', p_quantity: 1, p_event_date: today() }), /is closed/)
  })

  it('rejects dates before the batch started or in the future', async () => {
    const batch = await newBatch(F.owner, F.org, F.site, { start: daysAgo(5) })
    await rejects(rpc(F.owner, 'record_population_change', { p_key: key(), p_batch: batch, p_kind: 'mortality', p_quantity: 1, p_event_date: daysAgo(6) }), /before batch/)
    await rejects(rpc(F.owner, 'record_population_change', { p_key: key(), p_batch: batch, p_kind: 'mortality', p_quantity: 1, p_event_date: daysAgo(-5) }), /future/)
  })
})

describe('inventory ledger', () => {
  it('purchases, usage, wastage, transfers and counts produce correct balances', async () => {
    const fert = await createItem(F.owner, F.org, `NPK ${key().slice(0, 4)}`)
    const store2 = await as(F.owner, async (q) => (await q<{ id: string }>(`insert into public.stores (organization_id, site_id, name) values ($1, $2, $3) returning id`, [F.org, F.site, `Shed ${key().slice(0, 4)}`]))[0].id)

    await rpc(F.owner, 'record_stock_receipt', { p_key: key(), p_store: F.store, p_item: fert, p_movement_type: 'opening', p_quantity: 100, p_unit: kg, p_movement_date: today() })
    await rejects(
      rpc(F.owner, 'record_stock_receipt', { p_key: key(), p_store: F.store, p_item: fert, p_movement_type: 'opening', p_quantity: 1, p_unit: kg, p_movement_date: today() }),
      /already has stock history/,
    )
    // 4 bags of 25 kg = 100 kg, with the expense recorded in the same transaction.
    const purchase = await rpc<{ finance_transaction_id: string; balance: number }>(F.owner, 'record_stock_receipt', {
      p_key: key(), p_store: F.store, p_item: fert, p_movement_type: 'purchase', p_quantity: 4, p_unit: bag25, p_movement_date: today(),
      p_total_cost: 60000, p_supplier: 'Agro Dealer', p_record_expense: true, p_payment_method: 'cash',
    })
    expect(purchase.balance).toBe(200)
    const txn = (await pool.query(`select amount, kind from finance_transactions where id = $1`, [purchase.finance_transaction_id])).rows[0]
    expect(txn).toEqual({ amount: 60000, kind: 'expense' })

    await rpc(F.owner, 'record_stock_usage', { p_key: key(), p_store: F.store, p_item: fert, p_quantity: 30, p_unit: kg, p_movement_date: today(), p_reason: 'Nursery beds' })
    await rpc(F.owner, 'record_stock_wastage', { p_key: key(), p_store: F.store, p_item: fert, p_quantity: 5, p_unit: kg, p_movement_date: today(), p_reason: 'Bag torn, rain' })
    await rpc(F.owner, 'transfer_stock', { p_key: key(), p_from_store: F.store, p_to_store: store2, p_item: fert, p_quantity: 65, p_unit: kg, p_movement_date: today() })
    expect(await stock(fert, F.store)).toBe(100)
    expect(await stock(fert, store2)).toBe(65)

    // Physical count finds 97 kg: a -3 kg adjustment is posted with the reason.
    await rejects(
      rpc(F.owner, 'record_stock_count', { p_key: key(), p_store: F.store, p_item: fert, p_counted_quantity: 97, p_unit: kg, p_count_date: today() }),
      /Give a reason/,
    )
    const count = await rpc<{ variance: number }>(F.owner, 'record_stock_count', { p_key: key(), p_store: F.store, p_item: fert, p_counted_quantity: 97, p_unit: kg, p_count_date: today(), p_reason: 'Spillage' })
    expect(count.variance).toBe(-3)
    expect(await stock(fert, F.store)).toBe(97)

    await rejects(rpc(F.owner, 'record_stock_usage', { p_key: key(), p_store: F.store, p_item: fert, p_quantity: 98, p_unit: kg, p_movement_date: today(), p_reason: 'x' }), /has 97/)
    await rejects(rpc(F.owner, 'record_stock_usage', { p_key: key(), p_store: F.store, p_item: fert, p_quantity: 1, p_unit: each, p_movement_date: today(), p_reason: 'x' }), /cannot be converted/)
  })

  it('reversing a purchase also reverses its expense', async () => {
    const item = await createItem(F.owner, F.org, `Lime ${key().slice(0, 4)}`)
    const r = await rpc<{ movement_id: string; finance_transaction_id: string }>(F.owner, 'record_stock_receipt', {
      p_key: key(), p_store: F.store, p_item: item, p_movement_type: 'purchase', p_quantity: 10, p_unit: kg, p_movement_date: today(), p_total_cost: 5000, p_record_expense: true, p_payment_method: 'cash',
    })
    await rpc(F.owner, 'reverse_inventory_movement', { p_key: key(), p_movement: r.movement_id, p_reason: 'Wrong item' })
    expect(await stock(item, F.store)).toBe(0)
    const net = (await pool.query(`select sum(amount) as s from finance_transactions where id = $1 or reverses_id = $1`, [r.finance_transaction_id])).rows[0].s
    expect(net).toBe(0)
  })

  it('concurrent issues cannot overdraw a store', async () => {
    const item = await createItem(F.owner, F.org, `Urea ${key().slice(0, 4)}`)
    await rpc(F.owner, 'record_stock_receipt', { p_key: key(), p_store: F.store, p_item: item, p_movement_type: 'opening', p_quantity: 10, p_unit: kg, p_movement_date: today() })
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => rpc(F.owner, 'record_stock_usage', { p_key: key(), p_store: F.store, p_item: item, p_quantity: 4, p_unit: kg, p_movement_date: today(), p_reason: 'Top dressing' })),
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2)
    expect(await stock(item, F.store)).toBe(2)
  })
})

describe('feed: issued, consumed, returned and wasted never deduct twice', () => {
  it('follows the documented rules', async () => {
    const feed = await createItem(F.owner, F.org, `Grower mash ${key().slice(0, 4)}`, { feed: true })
    const batch = await newBatch(F.owner, F.org, F.site, { quantity: 1000 })
    await rpc(F.owner, 'record_stock_receipt', { p_key: key(), p_store: F.store, p_item: feed, p_movement_type: 'opening', p_quantity: 20, p_unit: bag25, p_movement_date: today() })
    expect(await stock(feed, F.store)).toBe(500)

    // Issue 100 kg to the house: store -100, house +100.
    await rpc(F.owner, 'issue_feed', { p_key: key(), p_batch: batch, p_store: F.store, p_item: feed, p_quantity: 4, p_unit: bag25, p_event_date: today() })
    expect(await stock(feed, F.store)).toBe(400)
    expect(await feedAtBatch(batch, feed)).toBe(100)

    // Consume 60 kg of it: store unchanged, house -60.
    await rpc(F.owner, 'record_feed_use', { p_key: key(), p_batch: batch, p_item: feed, p_kind: 'consumed', p_quantity: 60, p_unit: kg, p_event_date: today() })
    expect(await stock(feed, F.store)).toBe(400)
    expect(await feedAtBatch(batch, feed)).toBe(40)

    // Cannot consume more than is at the house.
    await rejects(rpc(F.owner, 'record_feed_use', { p_key: key(), p_batch: batch, p_item: feed, p_kind: 'consumed', p_quantity: 41, p_unit: kg, p_event_date: today() }), /Only 40/)

    // Waste 5 kg at the house (reason required), return 15 kg to the store.
    await rejects(rpc(F.owner, 'record_feed_use', { p_key: key(), p_batch: batch, p_item: feed, p_kind: 'wasted', p_quantity: 5, p_unit: kg, p_event_date: today() }), /why the feed was wasted/)
    await rpc(F.owner, 'record_feed_use', { p_key: key(), p_batch: batch, p_item: feed, p_kind: 'wasted', p_quantity: 5, p_unit: kg, p_event_date: today(), p_notes: 'Rain got into the feeder' })
    await rpc(F.owner, 'return_feed', { p_key: key(), p_batch: batch, p_store: F.store, p_item: feed, p_quantity: 15, p_unit: kg, p_event_date: today() })
    expect(await stock(feed, F.store)).toBe(415)
    expect(await feedAtBatch(batch, feed)).toBe(20)

    // Issue-and-consume in one step: store -50, house unchanged.
    await rpc(F.owner, 'issue_feed', { p_key: key(), p_batch: batch, p_store: F.store, p_item: feed, p_quantity: 50, p_unit: kg, p_event_date: today(), p_consumed_now: true })
    expect(await stock(feed, F.store)).toBe(365)
    expect(await feedAtBatch(batch, feed)).toBe(20)

    const s = (await pool.query(`select feed_consumed_kg, feed_at_batch_kg from batch_summaries where id = $1`, [batch])).rows[0]
    expect(s).toEqual({ feed_consumed_kg: 110, feed_at_batch_kg: 20 })

    // Closing is blocked while feed sits at the house.
    await rejects(rpc(F.owner, 'close_batch', { p_batch: batch, p_closed_on: today(), p_reason: 'x', p_write_off_remaining: true }), /still holds 20/)
  })

  it('reversing an issue puts the stock back once', async () => {
    const feed = await createItem(F.owner, F.org, `Starter ${key().slice(0, 4)}`, { feed: true })
    const batch = await newBatch(F.owner, F.org, F.site)
    await rpc(F.owner, 'record_stock_receipt', { p_key: key(), p_store: F.store, p_item: feed, p_movement_type: 'opening', p_quantity: 100, p_unit: kg, p_movement_date: today() })
    const r = await rpc<{ issue_event_id: string; movement_id: string }>(F.owner, 'issue_feed', { p_key: key(), p_batch: batch, p_store: F.store, p_item: feed, p_quantity: 30, p_unit: kg, p_event_date: today() })
    await rejects(rpc(F.owner, 'reverse_inventory_movement', { p_key: key(), p_movement: r.movement_id, p_reason: 'x' }), /Reverse the feed record instead/)
    await rpc(F.owner, 'reverse_feed_event', { p_key: key(), p_feed_event: r.issue_event_id, p_reason: 'Wrong batch' })
    expect(await stock(feed, F.store)).toBe(100)
    expect(await feedAtBatch(batch, feed)).toBe(0)
  })

  it('a non-feed item cannot be issued as feed, and feed cannot bypass batch tracking', async () => {
    const fert = await createItem(F.owner, F.org, `SSP ${key().slice(0, 4)}`)
    const feed = await createItem(F.owner, F.org, `Finisher ${key().slice(0, 4)}`, { feed: true })
    const batch = await newBatch(F.owner, F.org, F.site)
    await rpc(F.owner, 'record_stock_receipt', { p_key: key(), p_store: F.store, p_item: fert, p_movement_type: 'opening', p_quantity: 10, p_unit: kg, p_movement_date: today() })
    await rpc(F.owner, 'record_stock_receipt', { p_key: key(), p_store: F.store, p_item: feed, p_movement_type: 'opening', p_quantity: 10, p_unit: kg, p_movement_date: today() })
    await rejects(rpc(F.owner, 'issue_feed', { p_key: key(), p_batch: batch, p_store: F.store, p_item: fert, p_quantity: 1, p_unit: kg, p_event_date: today() }), /not marked as feed/)
    await rejects(rpc(F.owner, 'record_stock_usage', { p_key: key(), p_store: F.store, p_item: feed, p_quantity: 1, p_unit: kg, p_movement_date: today(), p_reason: 'x' }), /Issue feed to a batch/)
  })
})

describe('daily log', () => {
  it('ledger operations write log entries; manual entries cannot fake ledger activities', async () => {
    const batch = await newBatch(F.owner, F.org, F.site)
    const logs = (await pool.query(`select summary, source from activity_logs where batch_id = $1`, [batch])).rows
    expect(logs[0]).toMatchObject({ source: 'system' })
    await rejects(
      rpc(F.owner, 'log_activity', {
        p_key: key(), p_org: F.org, p_site: F.site, p_occurred_on: today(), p_production_type: 'poultry',
        p_category: await categoryId(F.org, 'activity', 'mortality'), p_summary: '50 died', p_batch: batch,
      }),
      /own screen/,
    )
    const r = await rpc<{ activity_id: string }>(F.owner, 'log_activity', {
      p_key: key(), p_org: F.org, p_site: F.site, p_occurred_on: today(), p_production_type: 'poultry',
      p_category: await categoryId(F.org, 'activity', 'vaccination'), p_summary: 'Newcastle (Lasota) via water', p_batch: batch, p_quantity: 1000, p_unit: each,
    })
    await rpc(F.owner, 'void_activity', { p_activity: r.activity_id, p_reason: 'Duplicate entry' })
    const voided = (await pool.query(`select voided_at is not null as v from activity_logs where id = $1`, [r.activity_id])).rows[0].v
    expect(voided).toBe(true)
  })
})
