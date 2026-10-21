import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addMember, as, createFarm, daysAgo, key, newBatch, pool, population, rejects, rpc, today, unitId } from './helpers'

let F: Awaited<ReturnType<typeof createFarm>>
let crate: string
let each: string

beforeAll(async () => {
  F = await createFarm('crm')
  crate = await unitId('crate30')
  each = await unitId('each')
})

afterAll(async () => {
  await pool.end()
})

async function customer(org = F.org, owner = F.owner, extra: Record<string, unknown> = {}) {
  const cols = { organization_id: org, name: `Customer ${key().slice(0, 6)}`, category: 'retailer', ...extra }
  const names = Object.keys(cols)
  return as(owner, async (q) =>
    (await q<{ id: string }>(
      `insert into public.customers (${names.join(', ')}) values (${names.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
      Object.values(cols),
    ))[0].id,
  )
}

async function product(name: string, source: 'produce' | 'livestock' | 'other', match: string | null, unit: string, price: number) {
  return as(F.owner, async (q) =>
    (await q<{ id: string }>(
      `insert into public.products (organization_id, name, source_kind, match_name, unit_id, default_price, production_type)
       values ($1, $2, $3, $4, $5, $6, 'poultry') returning id`,
      [F.org, name, source, match, unit, price],
    ))[0].id,
  )
}

async function eggs(quantity: number, date: string) {
  const flock = await newBatch(F.owner, F.org, F.site, { quantity: 900, start: daysAgo(60) })
  await rpc(F.owner, 'record_egg_collection', { p_key: key(), p_batch: flock, p_record_date: date, p_quantity: quantity, p_unit: crate })
  return (await pool.query(`select id from production_records where batch_id = $1`, [flock])).rows[0].id as string
}

const available = async (record: string) =>
  (await pool.query(`select available_quantity from production_record_balances where id = $1`, [record])).rows[0].available_quantity

describe('customers and products', () => {
  it('only roles that manage customers can add them, and the customer list stays inside the organization', async () => {
    const c = await customer()
    const worker = (await addMember(F.owner, F.org, 'crm-worker', 'worker')).user
    await rejects(customer(F.org, worker), /row-level security/)
    expect(await as(worker, (q) => q(`select id from customers where id = $1`, [c]))).toEqual([])

    const other = await createFarm('crm-other')
    expect(await as(other.owner, (q) => q(`select id from customers where id = $1`, [c]))).toEqual([])
    await rejects(customer(F.org, other.owner), /row-level security/)
  })

  it('live-animal products must be sold per head', async () => {
    await rejects(product(`Live birds ${key().slice(0, 4)}`, 'livestock', 'Chicken', crate, 7000), /per head/)
  })
})

describe('sales orders and invoices', () => {
  it('fulfils an order in parts from the oldest produce first, deducting exactly once', async () => {
    const name = `Eggs ${key().slice(0, 4)}`
    // Match on the produce name recorded by egg collection.
    const p = await product(name, 'produce', 'Eggs', crate, 4200)
    const c = await customer(F.org, F.owner, { payment_terms_days: 14 })
    await as(F.owner, (q) => q(`insert into customer_prices (organization_id, customer_id, product_id, unit_price) values ($1, $2, $3, 4000)`, [F.org, c, p]))

    const older = await eggs(6, daysAgo(3))
    const newer = await eggs(10, daysAgo(1))
    // Eggs from earlier tests on this site would also match, so measure against what this site already holds.
    const before = Number((await pool.query(`select available_quantity from product_availability where product_id = $1 and site_id = $2`, [p, F.site])).rows[0].available_quantity)

    const order = await rpc<{ sales_order_id: string; order_number: string }>(F.owner, 'create_sales_order', {
      p_key: key(), p_org: F.org, p_site: F.site, p_customer: c, p_order_date: daysAgo(1),
      p_lines: [{ product_id: p, quantity: 12 }],
    })
    expect(order.order_number).toMatch(/^SO-\d{5}$/)
    const line = (await pool.query(`select id, unit_price from sales_order_lines where sales_order_id = $1`, [order.sales_order_id])).rows[0]
    expect(line.unit_price).toBe(4000) // customer price wins over the product price

    // First delivery: 8 crates, part paid. The oldest record (6) is used up first, then 2 from the newer one.
    const k = key()
    const args = { p_key: k, p_order: order.sales_order_id, p_fulfil_date: today(), p_lines: [{ order_line_id: line.id, quantity: 8 }], p_amount_received: 20000, p_payment_method: 'cash' }
    const inv = await rpc<{ sale_id: string; invoice_number: string; total: number }>(F.owner, 'fulfil_sales_order', args)
    expect(inv.total).toBe(32000)
    expect(inv.invoice_number).toMatch(/^INV-\d{5}$/)
    expect(await available(older)).toBe(0)
    expect(await available(newer)).toBe(8)

    // A retry of the same submission does not deduct again.
    const again = await rpc<{ sale_id: string; replayed: boolean }>(F.owner, 'fulfil_sales_order', args)
    expect(again).toMatchObject({ sale_id: inv.sale_id, replayed: true })
    expect(await available(newer)).toBe(8)

    let o = (await pool.query(`select fulfilment_status, fulfilled_value from sales_order_summaries where id = $1`, [order.sales_order_id])).rows[0]
    expect(o).toEqual({ fulfilment_status: 'partially_fulfilled', fulfilled_value: 32000 })

    const s = (await pool.query(`select customer_id, due_date::text as due, amount_outstanding, order_number from sale_summaries where id = $1`, [inv.sale_id])).rows[0]
    expect(s).toEqual({ customer_id: c, due: daysAgo(-14), amount_outstanding: 12000, order_number: order.order_number })

    // Over-fulfilling the order is refused.
    await rejects(
      rpc(F.owner, 'fulfil_sales_order', { p_key: key(), p_order: order.sales_order_id, p_fulfil_date: today(), p_lines: [{ order_line_id: line.id, quantity: 5 }] }),
      /Only 4 remains/,
    )
    const second = await rpc<{ sale_id: string }>(F.owner, 'fulfil_sales_order', {
      p_key: key(), p_order: order.sales_order_id, p_fulfil_date: today(), p_lines: [{ order_line_id: line.id, quantity: 4 }],
    })
    o = (await pool.query(`select fulfilment_status from sales_order_summaries where id = $1`, [order.sales_order_id])).rows[0]
    expect(o.fulfilment_status).toBe('fulfilled')

    const bal = (await pool.query(`select invoice_count, total_invoiced, total_received, balance_outstanding from customer_balances where id = $1`, [c])).rows[0]
    expect(bal).toEqual({ invoice_count: 2, total_invoiced: 48000, total_received: 20000, balance_outstanding: 28000 })

    // Voiding the second invoice returns its eggs and reopens the order.
    await rpc(F.owner, 'void_sale', { p_key: key(), p_sale: second.sale_id, p_reason: 'Delivery refused' })
    expect(await available(newer)).toBe(8)
    o = (await pool.query(`select fulfilment_status from sales_order_summaries where id = $1`, [order.sales_order_id])).rows[0]
    expect(o.fulfilment_status).toBe('partially_fulfilled')

    const after = Number((await pool.query(`select available_quantity from product_availability where product_id = $1 and site_id = $2`, [p, F.site])).rows[0].available_quantity)
    expect(before - after).toBe(8)
  })

  it('refuses a shortfall instead of selling stock that is not there', async () => {
    const p = await product(`Plantain ${key().slice(0, 4)}`, 'produce', `Plantain-${key().slice(0, 4)}`, crate, 1000)
    const c = await customer()
    const order = await rpc<{ sales_order_id: string }>(F.owner, 'create_sales_order', {
      p_key: key(), p_org: F.org, p_site: F.site, p_customer: c, p_order_date: today(), p_lines: [{ product_id: p, quantity: 3 }],
    })
    const line = (await pool.query(`select id from sales_order_lines where sales_order_id = $1`, [order.sales_order_id])).rows[0]
    await rejects(
      rpc(F.owner, 'fulfil_sales_order', { p_key: key(), p_order: order.sales_order_id, p_fulfil_date: today(), p_lines: [{ order_line_id: line.id, quantity: 3 }] }),
      /Not enough .* 3 crate short/,
    )
    expect((await pool.query(`select count(*)::int as n from sales where sales_order_id = $1`, [order.sales_order_id])).rows[0].n).toBe(0)
  })

  it('live animals come from a chosen batch of the right species', async () => {
    const p = await product(`Live chicken ${key().slice(0, 4)}`, 'livestock', 'Chicken', each, 7500)
    const c = await customer()
    const batch = await newBatch(F.owner, F.org, F.site, { quantity: 100 })
    const fish = await newBatch(F.owner, F.org, F.site, { type: 'fish', quantity: 100 })
    const order = await rpc<{ sales_order_id: string }>(F.owner, 'create_sales_order', {
      p_key: key(), p_org: F.org, p_site: F.site, p_customer: c, p_order_date: today(), p_lines: [{ product_id: p, quantity: 30 }],
    })
    const line = (await pool.query(`select id from sales_order_lines where sales_order_id = $1`, [order.sales_order_id])).rows[0]
    const fulfil = (b: string, n: number) =>
      rpc(F.owner, 'fulfil_sales_order', { p_key: key(), p_order: order.sales_order_id, p_fulfil_date: today(), p_lines: [{ order_line_id: line.id, quantity: n, batch_id: b }] })
    await rejects(fulfil(fish, 30), /must be Chicken/)
    await rejects(fulfil(batch, 2.5), /whole numbers/)
    await fulfil(batch, 30)
    expect(await population(batch)).toBe(70)
  })

  it('enforces the credit limit and only counts unpaid invoices', async () => {
    const c = await customer(F.org, F.owner, { credit_limit: 50000 })
    const sell = (amount: number, received = 0) =>
      rpc(F.owner, 'record_sale', {
        p_key: key(), p_org: F.org, p_site: F.site, p_sale_date: today(), p_customer: c,
        p_lines: [{ line_type: 'other', description: 'Manure bags', quantity: 1, unit_id: each, unit_price: amount }],
        p_amount_received: received, p_payment_method: received ? 'cash' : null,
      })
    await sell(40000)
    await rejects(sell(20000), /credit limit of 50,000.00/)
    await sell(20000, 15000) // only 5,000 more on credit: 45,000 owed
    const bal = (await pool.query(`select balance_outstanding from customer_balances where id = $1`, [c])).rows[0]
    expect(bal.balance_outstanding).toBe(45000)
  })

  it('numbers invoices per organization without gaps from failed attempts', async () => {
    const other = await createFarm('crm-numbers')
    const sell = () =>
      rpc<{ invoice_number: string }>(other.owner, 'record_sale', {
        p_key: key(), p_org: other.org, p_site: other.site, p_sale_date: today(),
        p_lines: [{ line_type: 'other', description: 'Manure', quantity: 1, unit_id: each, unit_price: 100 }],
      })
    expect((await sell()).invoice_number).toBe('INV-00001')
    await rejects(
      rpc(other.owner, 'record_sale', { p_key: key(), p_org: other.org, p_site: other.site, p_sale_date: today(), p_lines: [{ line_type: 'other', quantity: 1, unit_id: each, unit_price: 100 }] }),
      /Describe each item/,
    )
    expect((await sell()).invoice_number).toBe('INV-00002')
  })

  it('another organization cannot order for, fulfil or cancel this farm’s orders', async () => {
    const c = await customer()
    const p = await product(`Manure ${key().slice(0, 4)}`, 'other', null, each, 500)
    const order = await rpc<{ sales_order_id: string }>(F.owner, 'create_sales_order', {
      p_key: key(), p_org: F.org, p_site: F.site, p_customer: c, p_order_date: today(), p_lines: [{ product_id: p, quantity: 2 }],
    })
    const line = (await pool.query(`select id from sales_order_lines where sales_order_id = $1`, [order.sales_order_id])).rows[0]
    const other = await createFarm('crm-intruder')

    await rejects(
      rpc(other.owner, 'create_sales_order', { p_key: key(), p_org: other.org, p_site: other.site, p_customer: c, p_order_date: today(), p_lines: [{ product_id: p, quantity: 1 }] }),
      /active customer/,
    )
    await rejects(
      rpc(other.owner, 'fulfil_sales_order', { p_key: key(), p_order: order.sales_order_id, p_fulfil_date: today(), p_lines: [{ order_line_id: line.id, quantity: 1 }] }),
      /not found/,
    )
    await rejects(rpc(other.owner, 'set_sales_order_status', { p_order: order.sales_order_id, p_status: 'cancelled', p_reason: 'x' }), /not found/)
    expect(await as(other.owner, (q) => q(`select id from sales_order_summaries where id = $1`, [order.sales_order_id]))).toEqual([])

    await rpc(F.owner, 'set_sales_order_status', { p_order: order.sales_order_id, p_status: 'cancelled', p_reason: 'Customer changed mind' })
    await rejects(
      rpc(F.owner, 'fulfil_sales_order', { p_key: key(), p_order: order.sales_order_id, p_fulfil_date: today(), p_lines: [{ order_line_id: line.id, quantity: 1 }] }),
      /Only a confirmed order/,
    )
  })
})
