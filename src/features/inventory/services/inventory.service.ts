import { supabase } from '@/shared/lib/supabase'
import { blankToNull } from '@/shared/lib/utils'
import type { Database } from '@/shared/types/database.generated'

export interface InventoryItem {
  id: string
  organization_id: string
  name: string
  category_id: string
  base_unit_id: string
  sku: string | null
  production_type: 'poultry' | 'fish' | 'crop' | 'general' | null
  is_feed: boolean
  reorder_level: number | null
  status: 'active' | 'archived'
  notes: string | null
  category: { name: string } | null
  unit: { symbol: string; name: string; dimension: string } | null
}

export interface InventoryItemValues {
  name: string
  category_id: string
  base_unit_id: string
  sku?: string
  production_type?: InventoryItem['production_type']
  is_feed: boolean
  reorder_level?: number | null
  notes?: string
}

export interface StockBalance {
  organization_id: string
  site_id: string
  site_name: string
  store_id: string
  store_name: string
  item_id: string
  item_name: string
  category_id: string
  category_name: string
  is_feed: boolean
  production_type: string | null
  base_unit_id: string
  unit_symbol: string
  reorder_level: number | null
  quantity: number
  last_movement_date: string | null
}

export interface StockMovement {
  id: string
  site_id: string
  store_id: string
  item_id: string
  movement_type: string
  movement_date: string
  quantity: number
  entered_quantity: number
  entered_unit_id: string
  conversion_factor: number
  unit_cost: number | null
  total_cost: number | null
  supplier: string | null
  reference: string | null
  reason: string | null
  batch_id: string | null
  crop_cycle_id: string | null
  reverses_movement_id: string | null
  transfer_group_id: string | null
  stock_count_id: string | null
  created_at: string
  item: { name: string; unit: { symbol: string } | null } | null
  store: { name: string } | null
  entered_unit: { symbol: string } | null
  batch: { code: string } | null
  crop_cycle: { code: string } | null
}

export const MOVEMENT_LABEL: Record<string, string> = {
  opening: 'Opening balance',
  purchase: 'Purchase',
  receipt: 'Receipt',
  issue: 'Issued to batch',
  consumption: 'Used',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  adjustment: 'Count adjustment',
  return: 'Returned',
  wastage: 'Wastage',
  reversal: 'Reversal',
}

export interface FeedEvent {
  id: string
  batch_id: string
  item_id: string
  event_date: string
  kind: 'issued' | 'consumed' | 'wasted' | 'returned' | 'reversal'
  quantity: number
  inventory_movement_id: string | null
  reverses_feed_event_id: string | null
  notes: string | null
  created_at: string
  item: { name: string; unit: { symbol: string } | null } | null
}

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))

export const inventoryService = {
  async items(orgId: string, opts: { includeArchived?: boolean } = {}): Promise<InventoryItem[]> {
    let q = supabase
      .from('inventory_items')
      .select('*, category:categories(name), unit:units(symbol, name, dimension)')
      .eq('organization_id', orgId)
      .order('name')
    if (!opts.includeArchived) q = q.eq('status', 'active')
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((i) => ({ ...(i as unknown as InventoryItem), reorder_level: n(i.reorder_level) }))
  },

  async createItem(orgId: string, v: InventoryItemValues): Promise<void> {
    const { error } = await supabase.from('inventory_items').insert({
      organization_id: orgId,
      name: v.name.trim(),
      category_id: v.category_id,
      base_unit_id: v.base_unit_id,
      sku: blankToNull(v.sku),
      production_type: v.production_type ?? null,
      is_feed: v.is_feed,
      reorder_level: v.reorder_level ?? null,
      notes: blankToNull(v.notes),
    })
    if (error) throw error
  },

  async updateItem(id: string, v: Partial<InventoryItemValues> & { status?: 'active' | 'archived' }): Promise<void> {
    const patch: Database['public']['Tables']['inventory_items']['Update'] = {}
    if (v.name !== undefined) patch.name = v.name.trim()
    if (v.category_id !== undefined) patch.category_id = v.category_id
    if (v.base_unit_id !== undefined) patch.base_unit_id = v.base_unit_id
    if (v.sku !== undefined) patch.sku = blankToNull(v.sku)
    if (v.production_type !== undefined) patch.production_type = v.production_type
    if (v.is_feed !== undefined) patch.is_feed = v.is_feed
    if (v.reorder_level !== undefined) patch.reorder_level = v.reorder_level
    if (v.notes !== undefined) patch.notes = blankToNull(v.notes)
    if (v.status !== undefined) patch.status = v.status
    const { error } = await supabase.from('inventory_items').update(patch).eq('id', id)
    if (error) throw error
  },

  async balances(orgId: string, siteId?: string): Promise<StockBalance[]> {
    let q = supabase.from('inventory_balances').select('*').eq('organization_id', orgId).order('item_name')
    if (siteId) q = q.eq('site_id', siteId)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((b) => ({ ...(b as unknown as StockBalance), quantity: Number(b.quantity), reorder_level: n(b.reorder_level) }))
  },

  async movements(orgId: string, f: { siteId?: string; itemId?: string; from?: string; to?: string; limit?: number }): Promise<StockMovement[]> {
    let q = supabase
      .from('inventory_movements')
      .select(
        '*, item:inventory_items(name, unit:units(symbol)), store:stores(name), entered_unit:units!inventory_movements_entered_unit_id_fkey(symbol), batch:batches(code), crop_cycle:crop_cycles(code)',
      )
      .eq('organization_id', orgId)
      .order('movement_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(f.limit ?? 200)
    if (f.siteId) q = q.eq('site_id', f.siteId)
    if (f.itemId) q = q.eq('item_id', f.itemId)
    if (f.from) q = q.gte('movement_date', f.from)
    if (f.to) q = q.lte('movement_date', f.to)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((m) => ({
      ...(m as unknown as StockMovement),
      quantity: Number(m.quantity),
      entered_quantity: Number(m.entered_quantity),
      conversion_factor: Number(m.conversion_factor),
      unit_cost: n(m.unit_cost),
      total_cost: n(m.total_cost),
    }))
  },

  async receive(
    key: string,
    v: {
      store_id: string
      item_id: string
      type: 'opening' | 'purchase' | 'receipt'
      quantity: number
      unit_id: string
      date: string
      total_cost?: number | null
      supplier?: string
      reference?: string
      reason?: string
      record_expense: boolean
      payment_method?: string
      expense_category_id?: string
    },
  ) {
    const { data, error } = await supabase.rpc('record_stock_receipt', {
      p_key: key,
      p_store: v.store_id,
      p_item: v.item_id,
      p_movement_type: v.type,
      p_quantity: v.quantity,
      p_unit: v.unit_id,
      p_movement_date: v.date,
      p_total_cost: v.total_cost ?? undefined,
      p_supplier: blankToNull(v.supplier) ?? undefined,
      p_reference: blankToNull(v.reference) ?? undefined,
      p_reason: blankToNull(v.reason) ?? undefined,
      p_record_expense: v.record_expense,
      p_payment_method: v.record_expense ? v.payment_method : undefined,
      p_expense_category: v.record_expense && v.expense_category_id ? v.expense_category_id : undefined,
    })
    if (error) throw error
    return data as { balance: number }
  },

  async use(key: string, v: { store_id: string; item_id: string; quantity: number; unit_id: string; date: string; crop_cycle_id?: string; activity_code?: string; reason?: string }) {
    const { data, error } = await supabase.rpc('record_stock_usage', {
      p_key: key,
      p_store: v.store_id,
      p_item: v.item_id,
      p_quantity: v.quantity,
      p_unit: v.unit_id,
      p_movement_date: v.date,
      p_crop_cycle: v.crop_cycle_id || undefined,
      p_activity_code: v.activity_code || undefined,
      p_reason: blankToNull(v.reason) ?? undefined,
    })
    if (error) throw error
    return data as { balance: number }
  },

  async waste(key: string, v: { store_id: string; item_id: string; quantity: number; unit_id: string; date: string; reason: string }) {
    const { error } = await supabase.rpc('record_stock_wastage', {
      p_key: key,
      p_store: v.store_id,
      p_item: v.item_id,
      p_quantity: v.quantity,
      p_unit: v.unit_id,
      p_movement_date: v.date,
      p_reason: v.reason,
    })
    if (error) throw error
  },

  async transfer(key: string, v: { from_store: string; to_store: string; item_id: string; quantity: number; unit_id: string; date: string; reason?: string }) {
    const { error } = await supabase.rpc('transfer_stock', {
      p_key: key,
      p_from_store: v.from_store,
      p_to_store: v.to_store,
      p_item: v.item_id,
      p_quantity: v.quantity,
      p_unit: v.unit_id,
      p_movement_date: v.date,
      p_reason: blankToNull(v.reason) ?? undefined,
    })
    if (error) throw error
  },

  async count(key: string, v: { store_id: string; item_id: string; counted: number; unit_id: string; date: string; reason?: string }) {
    const { data, error } = await supabase.rpc('record_stock_count', {
      p_key: key,
      p_store: v.store_id,
      p_item: v.item_id,
      p_counted_quantity: v.counted,
      p_unit: v.unit_id,
      p_count_date: v.date,
      p_reason: blankToNull(v.reason) ?? undefined,
    })
    if (error) throw error
    return data as { variance: number }
  },

  async reverseMovement(key: string, movementId: string, reason: string) {
    const { error } = await supabase.rpc('reverse_inventory_movement', { p_key: key, p_movement: movementId, p_reason: reason })
    if (error) throw error
  },

  // ---- Feed -----------------------------------------------------------------
  async feedEvents(batchId: string): Promise<FeedEvent[]> {
    const { data, error } = await supabase
      .from('feed_events')
      .select('*, item:inventory_items(name, unit:units(symbol))')
      .eq('batch_id', batchId)
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((e) => ({ ...(e as unknown as FeedEvent), quantity: Number(e.quantity) }))
  },

  async issueFeed(key: string, v: { batch_id: string; store_id: string; item_id: string; quantity: number; unit_id: string; date: string; consumed_now: boolean; notes?: string }) {
    const { data, error } = await supabase.rpc('issue_feed', {
      p_key: key,
      p_batch: v.batch_id,
      p_store: v.store_id,
      p_item: v.item_id,
      p_quantity: v.quantity,
      p_unit: v.unit_id,
      p_event_date: v.date,
      p_consumed_now: v.consumed_now,
      p_notes: blankToNull(v.notes) ?? undefined,
    })
    if (error) throw error
    return data as { store_balance: number; feed_at_batch: number }
  },

  async recordFeedUse(key: string, v: { batch_id: string; item_id: string; kind: 'consumed' | 'wasted'; quantity: number; unit_id: string; date: string; notes?: string }) {
    const { error } = await supabase.rpc('record_feed_use', {
      p_key: key,
      p_batch: v.batch_id,
      p_item: v.item_id,
      p_kind: v.kind,
      p_quantity: v.quantity,
      p_unit: v.unit_id,
      p_event_date: v.date,
      p_notes: blankToNull(v.notes) ?? undefined,
    })
    if (error) throw error
  },

  async returnFeed(key: string, v: { batch_id: string; store_id: string; item_id: string; quantity: number; unit_id: string; date: string; notes?: string }) {
    const { error } = await supabase.rpc('return_feed', {
      p_key: key,
      p_batch: v.batch_id,
      p_store: v.store_id,
      p_item: v.item_id,
      p_quantity: v.quantity,
      p_unit: v.unit_id,
      p_event_date: v.date,
      p_notes: blankToNull(v.notes) ?? undefined,
    })
    if (error) throw error
  },

  async reverseFeedEvent(key: string, eventId: string, reason: string) {
    const { error } = await supabase.rpc('reverse_feed_event', { p_key: key, p_feed_event: eventId, p_reason: reason })
    if (error) throw error
  },
}

/** Feed held at a batch, per item, from its feed events. */
export function feedOnHand(events: FeedEvent[]): { item_id: string; name: string; unit: string; quantity: number }[] {
  const map = new Map<string, { item_id: string; name: string; unit: string; quantity: number }>()
  for (const e of events) {
    const cur = map.get(e.item_id) ?? { item_id: e.item_id, name: e.item?.name ?? 'Feed', unit: e.item?.unit?.symbol ?? '', quantity: 0 }
    cur.quantity = Math.round((cur.quantity + e.quantity) * 10_000) / 10_000
    map.set(e.item_id, cur)
  }
  return [...map.values()].filter((x) => x.quantity > 0)
}
