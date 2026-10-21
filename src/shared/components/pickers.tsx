import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Select } from '@/shared/components/ui/input'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useCategories, useMembers, useSites, useStores, useUnits } from '@/shared/hooks/use-reference-data'
import { batchesService, type LivestockType } from '@/features/batches/services/batches.service'
import { cropsService } from '@/features/crops/services/crops.service'
import { inventoryService } from '@/features/inventory/services/inventory.service'
import { PAYMENT_METHODS } from '@/features/finance/services/finance.service'
import type { CategoryKind, Unit } from '@/features/settings/services/reference.service'
import { memberName } from '@/features/settings/services/reference.service'
import { customersService } from '@/features/customers/services/customers.service'
import { productsService } from '@/features/sales/services/products.service'
import { suppliersService } from '@/features/procurement/services/procurement.service'

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

function Base({ value, onChange, placeholder, children, ...rest }: SelectProps & { children: React.ReactNode }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {children}
    </Select>
  )
}

export function SiteSelect(props: SelectProps) {
  const { data = [] } = useSites()
  return (
    <Base placeholder="Choose a site" {...props}>
      {data.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Base>
  )
}

export function useActiveBatches(siteId?: string, type?: LivestockType) {
  const { activeOrgId } = useAuth()
  return useQuery({
    queryKey: ['batches', activeOrgId, 'active', siteId ?? '', type ?? ''],
    // '__none__' means "no site chosen yet": show nothing rather than query with it.
    enabled: !!activeOrgId && siteId !== '__none__',
    queryFn: () => batchesService.listActive(activeOrgId!, siteId, type),
  })
}

export function BatchSelect({ siteId, type, ...props }: SelectProps & { siteId?: string; type?: LivestockType }) {
  const { data = [], isLoading } = useActiveBatches(siteId, type)
  return (
    <Base placeholder={isLoading ? 'Loading…' : data.length ? 'Choose a batch' : 'No active batches'} {...props}>
      {data.map((b) => (
        <option key={b.id} value={b.id}>
          {b.code} · {b.species} · {b.current_population.toLocaleString()}
          {b.count_basis === 'estimated' ? ' (est.)' : ''}
          {siteId ? '' : ` · ${b.site_name}`}
        </option>
      ))}
    </Base>
  )
}

export function useOpenCropCycles(siteId?: string) {
  const { activeOrgId } = useAuth()
  return useQuery({
    queryKey: ['crops', activeOrgId, 'open', siteId ?? ''],
    enabled: !!activeOrgId && siteId !== '__none__',
    queryFn: () => cropsService.list(activeOrgId!, { siteId, status: 'open' }),
  })
}

export function CropCycleSelect({ siteId, activeOnly, ...props }: SelectProps & { siteId?: string; activeOnly?: boolean }) {
  const { data = [], isLoading } = useOpenCropCycles(siteId)
  const rows = activeOnly ? data.filter((c) => c.status === 'active' || c.status === 'harvested') : data
  return (
    <Base placeholder={isLoading ? 'Loading…' : rows.length ? 'Choose a crop cycle' : 'No open crop cycles'} {...props}>
      {rows.map((c) => (
        <option key={c.id} value={c.id}>
          {c.code} · {c.crop} · {c.production_unit_name}
          {siteId ? '' : ` · ${c.site_name}`}
        </option>
      ))}
    </Base>
  )
}

export function StoreSelect({ siteId, exclude, ...props }: SelectProps & { siteId?: string; exclude?: string }) {
  const { data = [] } = useStores(siteId)
  const { data: sites = [] } = useSites()
  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? ''
  return (
    <Base placeholder="Choose a store" {...props}>
      {data
        .filter((s) => s.id !== exclude)
        .map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {siteId ? '' : ` · ${siteName(s.site_id)}`}
          </option>
        ))}
    </Base>
  )
}

export function useItems() {
  const { activeOrgId } = useAuth()
  return useQuery({ queryKey: ['ref', activeOrgId, 'items'], enabled: !!activeOrgId, staleTime: 60_000, queryFn: () => inventoryService.items(activeOrgId!) })
}

export function ItemSelect({ feedOnly, excludeFeed, ...props }: SelectProps & { feedOnly?: boolean; excludeFeed?: boolean }) {
  const { data = [], isLoading } = useItems()
  const rows = data.filter((i) => (!feedOnly || i.is_feed) && (!excludeFeed || !i.is_feed))
  return (
    <Base placeholder={isLoading ? 'Loading…' : rows.length ? 'Choose an item' : feedOnly ? 'No feed items yet' : 'No items yet'} {...props}>
      {rows.map((i) => (
        <option key={i.id} value={i.id}>
          {i.name} ({i.unit?.symbol})
        </option>
      ))}
    </Base>
  )
}

/** Units, optionally limited to one dimension (only convertible units make sense for an item). */
export function UnitSelect({ dimension, dimensions, ...props }: SelectProps & { dimension?: Unit['dimension']; dimensions?: Unit['dimension'][] }) {
  const { data = [] } = useUnits()
  const rows = data.filter((u) => u.is_active && (!dimension || u.dimension === dimension) && (!dimensions || dimensions.includes(u.dimension)))
  return (
    <Base placeholder="Choose a unit" {...props}>
      {rows.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </Base>
  )
}

export function CategorySelect({
  kind,
  productionType,
  exclude,
  ...props
}: SelectProps & { kind: CategoryKind; productionType?: string; exclude?: Set<string> }) {
  const { data = [] } = useCategories(kind)
  const rows = data.filter(
    (c) =>
      (!productionType || !c.production_type || c.production_type === 'general' || c.production_type === productionType) &&
      (!exclude || !exclude.has(c.code)),
  )
  return (
    <Base placeholder="Choose a category" {...props}>
      {rows.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Base>
  )
}

export function MemberSelect(props: SelectProps) {
  const { data = [] } = useMembers()
  return (
    <Base placeholder="Me" {...props}>
      {data
        .filter((m) => m.status === 'active')
        .map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {memberName(m)}
          </option>
        ))}
    </Base>
  )
}

export function PaymentMethodSelect(props: SelectProps) {
  return (
    <Base placeholder="Choose how it was paid" {...props}>
      {PAYMENT_METHODS.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </Base>
  )
}

/** Look up a unit by system code (e.g. 'each', 'kg'). */
export function useUnitByCode(code: string): Unit | undefined {
  const { data = [] } = useUnits()
  return data.find((u) => u.code === code && u.organization_id === null)
}

export function useCustomerOptions() {
  const { activeOrgId } = useAuth()
  return useQuery({ queryKey: ['customers', activeOrgId, 'options'], enabled: !!activeOrgId, queryFn: () => customersService.options(activeOrgId!) })
}

export function CustomerSelect(props: SelectProps) {
  const { data = [], isLoading } = useCustomerOptions()
  return (
    <Base placeholder={isLoading ? 'Loading…' : data.length ? 'Choose a customer' : 'No customers yet'} {...props}>
      {data.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
          {c.phone ? ` · ${c.phone}` : ''}
        </option>
      ))}
    </Base>
  )
}

export function useProducts(activeOnly = true) {
  const { activeOrgId } = useAuth()
  return useQuery({ queryKey: ['products', activeOrgId, activeOnly], enabled: !!activeOrgId, queryFn: () => productsService.list(activeOrgId!, { activeOnly }) })
}

export function ProductSelect(props: SelectProps) {
  const { data = [], isLoading } = useProducts()
  return (
    <Base placeholder={isLoading ? 'Loading…' : data.length ? 'Choose a product' : 'No products yet'} {...props}>
      {data.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </Base>
  )
}

export function useSupplierOptions() {
  const { activeOrgId } = useAuth()
  return useQuery({ queryKey: ['suppliers', activeOrgId, 'options'], enabled: !!activeOrgId, queryFn: () => suppliersService.options(activeOrgId!) })
}

export function SupplierSelect(props: SelectProps) {
  const { data = [], isLoading } = useSupplierOptions()
  return (
    <Base placeholder={isLoading ? 'Loading…' : data.length ? 'Choose a supplier' : 'No suppliers yet'} {...props}>
      {data.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Base>
  )
}
