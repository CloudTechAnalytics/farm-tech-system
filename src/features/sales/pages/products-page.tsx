import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Download, PackageSearch, Pencil, Plus } from 'lucide-react'
import { useAuth, useCurrency } from '@/features/auth/context/auth-provider'
import { useSiteScope } from '@/shared/context/site-scope'
import { PRODUCT_SOURCE_LABEL, productsService, type Product, type ProductSource } from '@/features/sales/services/products.service'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Checkbox, Input, Select, Textarea } from '@/shared/components/ui/input'
import { Table, TableWrap, Td, Th, Tr } from '@/shared/components/ui/misc'
import { EmptyState, Field, Notice, PageHeader, QueryState, SearchInput } from '@/shared/components/common'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { UnitSelect, useProducts, useUnitByCode } from '@/shared/components/pickers'
import { useSave } from '@/shared/hooks/use-record'
import { useUnits } from '@/shared/hooks/use-reference-data'
import { optionalText, requiredId, requiredText } from '@/shared/lib/validation'
import { formatMoney, formatNumber } from '@/shared/lib/format'
import { downloadCsv, toCsv } from '@/shared/lib/csv'
import { PRODUCTION_TYPE_LABEL } from '@/shared/lib/permissions'
import { cn } from '@/shared/lib/utils'

export function ProductsPage() {
  const { activeOrgId, has } = useAuth()
  const currency = useCurrency()
  const { siteId } = useSiteScope()
  const [search, setSearch] = React.useState('')
  const [source, setSource] = React.useState('')
  const [showInactive, setShowInactive] = React.useState(false)
  const [editing, setEditing] = React.useState<Product | 'new' | null>(null)
  const products = useProducts(false)
  const availability = useQuery({
    queryKey: ['product-availability', activeOrgId, siteId],
    enabled: !!activeOrgId,
    queryFn: () => productsService.availability(activeOrgId!, siteId || undefined),
  })
  const s = search.trim().toLowerCase()
  const filtered = {
    ...products,
    data: products.data?.filter(
      (p) => (showInactive || p.is_active) && (!source || p.source_kind === source) && (!s || p.name.toLowerCase().includes(s) || p.sku?.toLowerCase().includes(s)),
    ),
  }

  const exportCsv = () =>
    downloadCsv(
      'products',
      toCsv(filtered.data ?? [], [
        { header: 'Name', value: (p) => p.name },
        { header: 'SKU', value: (p) => p.sku },
        { header: 'Area', value: (p) => PRODUCTION_TYPE_LABEL[p.production_type] },
        { header: 'Stock source', value: (p) => PRODUCT_SOURCE_LABEL[p.source_kind] },
        { header: 'Matches', value: (p) => p.match_name },
        { header: 'Unit', value: (p) => p.unit?.symbol },
        { header: 'Standard price', value: (p) => p.default_price },
        { header: 'Available', value: (p) => availability.data?.get(p.id) ?? '' },
        { header: 'Active', value: (p) => p.is_active },
      ]),
    )

  return (
    <div>
      <PageHeader
        title="Products"
        description="What the farm sells, in which unit, at what standard price. Available quantities come from recorded produce and live batches."
        actions={
          <>
            {has('reports.export') ? (
              <Button variant="outline" onClick={exportCsv} disabled={!filtered.data?.length}>
                <Download /> Export CSV
              </Button>
            ) : null}
            {has('products.manage') ? (
              <Button onClick={() => setEditing('new')}>
                <Plus /> Add product
              </Button>
            ) : null}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search products" />
        <div className="w-52">
          <Select aria-label="Stock source" className="h-9" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All products</option>
            {(Object.keys(PRODUCT_SOURCE_LABEL) as ProductSource[]).map((k) => (
              <option key={k} value={k}>
                {PRODUCT_SOURCE_LABEL[k]}
              </option>
            ))}
          </Select>
        </div>
        <Checkbox label="Show inactive" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
      </div>
      <Card>
        <QueryState
          query={filtered}
          empty={
            <EmptyState
              icon={PackageSearch}
              title={products.data?.length ? 'No products match' : 'No products yet'}
              description={products.data?.length ? 'Try a different search or filter.' : 'Add products such as "Eggs (crate)", "Live broilers" or "Smoked catfish" to take orders and set customer prices.'}
              action={has('products.manage') && !products.data?.length ? <Button onClick={() => setEditing('new')}>Add a product</Button> : undefined}
            />
          }
        >
          {(list) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Product</Th>
                    <Th>Stock from</Th>
                    <Th align="right">Standard price</Th>
                    <Th align="right">Available{siteId ? '' : ' (all sites)'}</Th>
                    {has('products.manage') ? <Th className="w-12" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => {
                    const avail = availability.data?.get(p.id)
                    return (
                      <Tr key={p.id} className={cn(!p.is_active && 'text-muted-foreground')}>
                        <Td>
                          <span className="font-medium">{p.name}</span>
                          {!p.is_active ? <Badge className="ml-2">Inactive</Badge> : null}
                          <div className="text-xs text-muted-foreground">
                            {PRODUCTION_TYPE_LABEL[p.production_type]}
                            {p.sku ? ` · ${p.sku}` : ''}
                          </div>
                        </Td>
                        <Td>
                          {p.source_kind === 'other' ? 'Not stock-tracked' : `${p.source_kind === 'livestock' ? 'Batches of' : 'Produce named'} “${p.match_name}”`}
                        </Td>
                        <Td align="right">
                          {formatMoney(p.default_price, currency)}
                          <span className="text-muted-foreground"> / {p.unit?.symbol}</span>
                        </Td>
                        <Td align="right" className="font-medium">
                          {p.source_kind === 'other' ? '—' : availability.isLoading ? '…' : `${formatNumber(avail ?? 0, 2)} ${p.unit?.symbol ?? ''}`}
                        </Td>
                        {has('products.manage') ? (
                          <Td align="right">
                            <Button variant="ghost" size="icon" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}>
                              <Pencil />
                            </Button>
                          </Td>
                        ) : null}
                      </Tr>
                    )
                  })}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </QueryState>
      </Card>
      <ProductDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} product={editing === 'new' ? undefined : editing ?? undefined} />
    </div>
  )
}

const productSchema = z
  .object({
    name: requiredText('The product name', 120).refine((v) => v.length >= 2, 'Enter at least 2 characters'),
    sku: optionalText(40),
    production_type: z.enum(['poultry', 'fish', 'crop', 'general']),
    source_kind: z.enum(['produce', 'livestock', 'other']),
    match_name: optionalText(80),
    unit_id: requiredId('a unit'),
    default_price: z.preprocess((v) => (v === '' ? undefined : Number(v)), z.number({ required_error: 'Enter the price', invalid_type_error: 'Enter the price' }).min(0, 'Price cannot be negative').max(1e12)),
    description: optionalText(1000),
    is_active: z.boolean(),
  })
  .refine((v) => v.source_kind === 'other' || (v.match_name ?? '').trim().length > 0, { path: ['match_name'], message: 'Choose what this product is drawn from' })

function ProductDialog({ open, onOpenChange, product }: { open: boolean; onOpenChange: (o: boolean) => void; product?: Product }) {
  const { activeOrgId } = useAuth()
  const { data: units = [] } = useUnits()
  const each = useUnitByCode('each')
  const suggestions = useQuery({ queryKey: ['product-match', activeOrgId], enabled: open && !!activeOrgId, queryFn: () => productsService.matchSuggestions(activeOrgId!) })
  const form = useForm<z.input<typeof productSchema>>({ resolver: zodResolver(productSchema) })
  React.useEffect(() => {
    if (open)
      form.reset({
        name: product?.name ?? '',
        sku: product?.sku ?? '',
        production_type: product?.production_type ?? 'poultry',
        source_kind: product?.source_kind ?? 'produce',
        match_name: product?.match_name ?? '',
        unit_id: product?.unit_id ?? '',
        default_price: product?.default_price ?? ('' as unknown as number),
        description: product?.description ?? '',
        is_active: product?.is_active ?? true,
      })
  }, [open, product, form])
  const source = form.watch('source_kind')
  React.useEffect(() => {
    if (source === 'livestock' && each) form.setValue('unit_id', each.id)
  }, [source, each, form])
  const mutation = useSave(
    async (v: z.output<typeof productSchema>) => {
      if (product) await productsService.update(product.id, { ...v, source_kind: product.source_kind })
      else await productsService.create(activeOrgId!, v)
    },
    { success: product ? 'Product saved' : 'Product added', onSuccess: () => onOpenChange(false) },
  )
  const { errors } = form.formState
  const options = source === 'livestock' ? suggestions.data?.species : suggestions.data?.produce
  const unit = units.find((u) => u.id === product?.unit_id)
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={product ? `Edit ${product.name}` : 'Add a product'}
      submitLabel={product ? 'Save' : 'Add product'}
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof productSchema>))}
    >
      <FieldRow>
        <Field label="Name" htmlFor="pr-name" error={errors.name?.message} required>
          <Input id="pr-name" maxLength={120} placeholder="e.g. Eggs (crate)" {...form.register('name')} />
        </Field>
        <Field label="Farm area" htmlFor="pr-type">
          <Select id="pr-type" {...form.register('production_type')}>
            <option value="poultry">Poultry</option>
            <option value="fish">Fish</option>
            <option value="crop">Crops</option>
            <option value="general">General</option>
          </Select>
        </Field>
      </FieldRow>
      <Field label="Stock comes from" htmlFor="pr-source" hint={product ? 'Fixed once the product is created' : undefined}>
        {product ? (
          <Input id="pr-source" value={PRODUCT_SOURCE_LABEL[product.source_kind]} disabled />
        ) : (
          <Select id="pr-source" {...form.register('source_kind')}>
            {(Object.keys(PRODUCT_SOURCE_LABEL) as ProductSource[]).map((k) => (
              <option key={k} value={k}>
                {PRODUCT_SOURCE_LABEL[k]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {source !== 'other' ? (
        <Field
          label={source === 'livestock' ? 'Species' : 'Produce name'}
          htmlFor="pr-match"
          error={errors.match_name?.message}
          required
          hint={source === 'livestock' ? 'Orders are filled from active batches of this species' : 'Orders are filled from recorded produce with this name, oldest first'}
        >
          <Input id="pr-match" list="pr-match-options" maxLength={80} placeholder={source === 'livestock' ? 'e.g. Chicken' : 'e.g. Eggs'} {...form.register('match_name')} />
          <datalist id="pr-match-options">
            {options?.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </Field>
      ) : (
        <Notice>Products not drawn from stock (manure, services, hire) are invoiced without any quantity being deducted.</Notice>
      )}
      <FieldRow>
        <Field label="Sold in" htmlFor="pr-unit" error={errors.unit_id?.message} required hint={source === 'livestock' ? 'Live animals are sold per head' : undefined}>
          <Controller
            control={form.control}
            name="unit_id"
            render={({ field }) => <UnitSelect id="pr-unit" placeholder="Choose a unit" disabled={source === 'livestock'} dimension={product ? (unit?.dimension as never) : undefined} value={field.value} onChange={field.onChange} />}
          />
        </Field>
        <Field label="Standard price" htmlFor="pr-price" error={errors.default_price?.message} required>
          <Input id="pr-price" type="number" step="0.01" min={0} {...form.register('default_price')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="SKU / code" htmlFor="pr-sku">
          <Input id="pr-sku" maxLength={40} {...form.register('sku')} />
        </Field>
        <Field label="Description" htmlFor="pr-desc">
          <Textarea id="pr-desc" rows={1} maxLength={1000} {...form.register('description')} />
        </Field>
      </FieldRow>
      {product ? (
        <Controller control={form.control} name="is_active" render={({ field }) => <Checkbox label="Active" description="Inactive products cannot be added to new orders." checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />} />
      ) : null}
    </FormDialog>
  )
}
