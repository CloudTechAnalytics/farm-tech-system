import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRightLeft, ClipboardCheck, Download, MinusCircle, MoreHorizontal, Package, PackagePlus, Pencil, Plus, Undo2 } from 'lucide-react'
import { useAuth, useCurrency } from '@/features/auth/context/auth-provider'
import { useSiteScope } from '@/shared/context/site-scope'
import { inventoryService, MOVEMENT_LABEL, type InventoryItem, type StockBalance, type StockMovement } from '@/features/inventory/services/inventory.service'
import { ReceiveStockDialog, StockCountDialog, TransferStockDialog, UseStockDialog } from '@/features/inventory/components/stock-dialogs'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Checkbox, Input, Select, Textarea } from '@/shared/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Table, TableWrap, Tabs, TabsContent, TabsList, TabsTrigger, Td, Th, Tr } from '@/shared/components/ui/misc'
import { EmptyState, Field, PageHeader, QueryState } from '@/shared/components/common'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { ReasonDialog } from '@/shared/components/reason-dialog'
import { CategorySelect, ItemSelect, UnitSelect, useItems } from '@/shared/components/pickers'
import { PeriodFilter, usePeriod } from '@/shared/components/period-filter'
import { useRecord, useSave, invalidateReference } from '@/shared/hooks/use-record'
import { useQueryClient } from '@tanstack/react-query'
import { optionalText, requiredId, requiredText, nonNegativeNumber } from '@/shared/lib/validation'
import { formatDate, formatMoney, formatNumber } from '@/shared/lib/format'
import { isLowStock } from '@/shared/lib/calc'
import { downloadCsv, toCsv } from '@/shared/lib/csv'
import { cn } from '@/shared/lib/utils'
import { AttachmentsButton } from '@/features/attachments/components/attachments'

type Dialog = { kind: 'receive' | 'use' | 'waste' | 'transfer' | 'count'; itemId?: string; storeId?: string } | null

export function InventoryPage() {
  const { has } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'stock'
  const [dialog, setDialog] = React.useState<Dialog>(null)
  const close = (o: boolean) => !o && setDialog(null)
  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Feed, seeds, fertilizer, treatments and supplies. Every balance is the sum of recorded movements."
        actions={
          <>
            {has('inventory.manage') ? (
              <>
                <Button variant="outline" onClick={() => setDialog({ kind: 'count' })}>
                  <ClipboardCheck /> Count stock
                </Button>
                <Button variant="outline" onClick={() => setDialog({ kind: 'transfer' })}>
                  <ArrowRightLeft /> Transfer
                </Button>
              </>
            ) : null}
            {has('inventory.record') ? (
              <Button variant="outline" onClick={() => setDialog({ kind: 'use' })}>
                <MinusCircle /> Use / waste
              </Button>
            ) : null}
            {has('inventory.manage') ? (
              <Button onClick={() => setDialog({ kind: 'receive' })}>
                <PackagePlus /> Receive stock
              </Button>
            ) : null}
          </>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'stock' ? {} : { tab: v })}>
        <TabsList>
          <TabsTrigger value="stock">Stock on hand</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
        </TabsList>
        <TabsContent value="stock">
          <StockTab onAction={setDialog} highlight={params.get('item') ?? undefined} />
        </TabsContent>
        <TabsContent value="movements">
          <MovementsTab />
        </TabsContent>
        <TabsContent value="items">
          <ItemsTab />
        </TabsContent>
      </Tabs>
      <ReceiveStockDialog open={dialog?.kind === 'receive'} onOpenChange={close} itemId={dialog?.itemId} storeId={dialog?.storeId} />
      <UseStockDialog open={dialog?.kind === 'use' || dialog?.kind === 'waste'} onOpenChange={close} itemId={dialog?.itemId} storeId={dialog?.storeId} defaultMode={dialog?.kind === 'waste' ? 'waste' : 'use'} />
      <TransferStockDialog open={dialog?.kind === 'transfer'} onOpenChange={close} itemId={dialog?.itemId} storeId={dialog?.storeId} />
      <StockCountDialog open={dialog?.kind === 'count'} onOpenChange={close} itemId={dialog?.itemId} storeId={dialog?.storeId} />
    </div>
  )
}

function StockTab({ onAction, highlight }: { onAction: (d: Dialog) => void; highlight?: string }) {
  const { activeOrgId, has } = useAuth()
  const { siteId } = useSiteScope()
  const [lowOnly, setLowOnly] = React.useState(false)
  const query = useQuery({ queryKey: ['inventory', activeOrgId, 'balances', siteId], enabled: !!activeOrgId, queryFn: () => inventoryService.balances(activeOrgId!, siteId || undefined) })
  // Reorder levels apply to an item's total on a site, matching the alert rule.
  const siteTotals = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const b of query.data ?? []) m.set(`${b.item_id}:${b.site_id}`, (m.get(`${b.item_id}:${b.site_id}`) ?? 0) + b.quantity)
    return m
  }, [query.data])
  const low = (b: StockBalance) => isLowStock(siteTotals.get(`${b.item_id}:${b.site_id}`) ?? 0, b.reorder_level)
  return (
    <>
      <div className="mb-3">
        <Checkbox label="Only items at or below reorder level" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
      </div>
      <Card>
        <QueryState
          query={query}
          empty={
            <EmptyState
              icon={Package}
              title="No stock recorded yet"
              description="Add items on the Items tab, then receive an opening balance or purchase."
            />
          }
        >
          {(rows) => {
            const shown = lowOnly ? rows.filter(low) : rows
            if (!shown.length) return <EmptyState title="Nothing is below its reorder level" />
            return (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Item</Th>
                      <Th>Store · site</Th>
                      <Th align="right">On hand</Th>
                      <Th align="right">Reorder at</Th>
                      <Th>Last movement</Th>
                      <Th className="w-10">
                        <span className="sr-only">Actions</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((b) => (
                      <Tr key={`${b.item_id}:${b.store_id}`} className={cn(highlight === b.item_id && 'bg-accent-soft')}>
                        <Td>
                          <span className="font-medium">{b.item_name}</span>
                          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                            {b.category_name}
                            {b.is_feed ? <Badge variant="primary">Feed</Badge> : null}
                            {low(b) ? <Badge variant={b.quantity <= 0 ? 'danger' : 'warning'}>Low stock</Badge> : null}
                          </div>
                        </Td>
                        <Td>
                          {b.store_name}
                          <div className="text-xs text-muted-foreground">{b.site_name}</div>
                        </Td>
                        <Td align="right" className="font-medium">
                          {formatNumber(b.quantity, 3)} {b.unit_symbol}
                        </Td>
                        <Td align="right" className="text-muted-foreground">
                          {b.reorder_level !== null ? `${formatNumber(b.reorder_level)} ${b.unit_symbol}` : '—'}
                        </Td>
                        <Td>{formatDate(b.last_movement_date)}</Td>
                        <Td>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Actions for ${b.item_name}`}>
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              {has('inventory.manage') ? <DropdownMenuItem onSelect={() => onAction({ kind: 'receive', itemId: b.item_id, storeId: b.store_id })}>Receive</DropdownMenuItem> : null}
                              {has('inventory.record') && !b.is_feed ? <DropdownMenuItem onSelect={() => onAction({ kind: 'use', itemId: b.item_id, storeId: b.store_id })}>Record use</DropdownMenuItem> : null}
                              {has('inventory.record') ? <DropdownMenuItem onSelect={() => onAction({ kind: 'waste', itemId: b.item_id, storeId: b.store_id })}>Record wastage</DropdownMenuItem> : null}
                              {has('inventory.manage') ? (
                                <>
                                  <DropdownMenuItem onSelect={() => onAction({ kind: 'transfer', itemId: b.item_id, storeId: b.store_id })}>Transfer</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onSelect={() => onAction({ kind: 'count', itemId: b.item_id, storeId: b.store_id })}>Count and reconcile</DropdownMenuItem>
                                </>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )
          }}
        </QueryState>
      </Card>
    </>
  )
}

function MovementsTab() {
  const { activeOrgId, has } = useAuth()
  const currency = useCurrency()
  const { siteId } = useSiteScope()
  const [period, setPeriod] = usePeriod('30d')
  const [itemId, setItemId] = React.useState('')
  const [reversing, setReversing] = React.useState<StockMovement | null>(null)
  const query = useQuery({
    queryKey: ['inventory', activeOrgId, 'movements', siteId, period, itemId],
    enabled: !!activeOrgId,
    queryFn: () => inventoryService.movements(activeOrgId!, { siteId: siteId || undefined, from: period.from, to: period.to, itemId: itemId || undefined, limit: 500 }),
  })
  const reverse = useRecord((key, v: { id: string; reason: string }) => inventoryService.reverseMovement(key, v.id, v.reason), { success: 'Movement reversed' })
  const rows = query.data ?? []
  const reversed = new Set(rows.filter((m) => m.reverses_movement_id).map((m) => m.reverses_movement_id))
  const canReverse = (m: StockMovement) =>
    has('inventory.manage') && !reversed.has(m.id) && ['opening', 'purchase', 'receipt', 'consumption', 'wastage'].includes(m.movement_type) && !m.batch_id

  const exportCsv = () =>
    downloadCsv(
      `stock-movements-${period.from}-to-${period.to}`,
      toCsv(rows, [
        { header: 'Date', value: (m) => m.movement_date },
        { header: 'Item', value: (m) => m.item?.name },
        { header: 'Store', value: (m) => m.store?.name },
        { header: 'Type', value: (m) => MOVEMENT_LABEL[m.movement_type] },
        { header: 'Quantity (base unit)', value: (m) => m.quantity },
        { header: 'Base unit', value: (m) => m.item?.unit?.symbol },
        { header: 'Entered', value: (m) => `${m.entered_quantity} ${m.entered_unit?.symbol ?? ''}` },
        { header: 'Total cost', value: (m) => m.total_cost },
        { header: 'Supplier', value: (m) => m.supplier },
        { header: 'Reason', value: (m) => m.reason },
      ]),
    )

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PeriodFilter value={period} onChange={setPeriod} />
        <div className="w-56">
          <ItemSelect aria-label="Item" className="h-9" placeholder="All items" value={itemId} onChange={setItemId} />
        </div>
        {has('reports.export') ? (
          <Button variant="outline" size="sm" className="ml-auto" onClick={exportCsv} disabled={!rows.length}>
            <Download /> Export CSV
          </Button>
        ) : null}
      </div>
      <Card>
        <QueryState query={query} empty={<EmptyState title="No stock movements in this period" />}>
          {(list) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Item · store</Th>
                    <Th>Movement</Th>
                    <Th align="right">Quantity</Th>
                    <Th align="right">Cost</Th>
                    <Th>Details</Th>
                    <Th className="w-20">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((m) => (
                    <Tr key={m.id} className={cn(reversed.has(m.id) && 'text-muted-foreground')}>
                      <Td className="whitespace-nowrap">{formatDate(m.movement_date)}</Td>
                      <Td>
                        <span className="font-medium">{m.item?.name}</span>
                        <div className="text-xs text-muted-foreground">{m.store?.name}</div>
                      </Td>
                      <Td>
                        <span className={cn(reversed.has(m.id) && 'line-through')}>{MOVEMENT_LABEL[m.movement_type]}</span>
                        {m.batch ? <div className="text-xs text-muted-foreground">to {m.batch.code}</div> : null}
                        {m.crop_cycle ? <div className="text-xs text-muted-foreground">on {m.crop_cycle.code}</div> : null}
                      </Td>
                      <Td align="right" className={cn('whitespace-nowrap font-medium', m.quantity > 0 && 'text-success')}>
                        {m.quantity > 0 ? '+' : ''}
                        {formatNumber(m.quantity, 3)} {m.item?.unit?.symbol}
                        {m.entered_unit && m.conversion_factor !== 1 ? (
                          <div className="text-xs font-normal text-muted-foreground">
                            entered as {formatNumber(m.entered_quantity)} {m.entered_unit.symbol}
                          </div>
                        ) : null}
                      </Td>
                      <Td align="right">{m.total_cost !== null ? formatMoney(m.total_cost, currency) : '—'}</Td>
                      <Td className="max-w-[16rem] text-muted-foreground">
                        {[m.supplier, m.reference ? `Ref ${m.reference}` : null, m.reason].filter(Boolean).join(' · ')}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-0.5">
                          <AttachmentsButton entityType="inventory_movement" entityId={m.id} siteId={m.site_id} />
                          {canReverse(m) ? (
                            <Button variant="ghost" size="icon" aria-label="Reverse movement" title="Reverse" onClick={() => setReversing(m)}>
                              <Undo2 />
                            </Button>
                          ) : null}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </QueryState>
      </Card>
      <ReasonDialog
        open={!!reversing}
        onOpenChange={(o) => !o && setReversing(null)}
        title="Reverse this movement?"
        description={
          reversing?.movement_type === 'purchase'
            ? 'A reversing movement is added today. If the purchase was recorded as an expense, that expense is reversed too.'
            : 'A reversing movement is added today. The original stays in the history.'
        }
        confirmLabel="Reverse"
        onConfirm={(reason) => reverse.mutateAsync({ id: reversing!.id, reason })}
      />
    </>
  )
}

const itemSchema = z.object({
  name: requiredText('A name', 120),
  category_id: requiredId('a category'),
  base_unit_id: requiredId('a unit'),
  sku: optionalText(40),
  production_type: z.string().optional(),
  is_feed: z.boolean(),
  reorder_level: nonNegativeNumber('Reorder level'),
  notes: optionalText(1000),
})

function ItemDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item?: InventoryItem }) {
  const { activeOrgId } = useAuth()
  const qc = useQueryClient()
  const form = useForm<z.input<typeof itemSchema>>({ resolver: zodResolver(itemSchema) })
  React.useEffect(() => {
    if (open)
      form.reset({
        name: item?.name ?? '',
        category_id: item?.category_id ?? '',
        base_unit_id: item?.base_unit_id ?? '',
        sku: item?.sku ?? '',
        production_type: item?.production_type ?? '',
        is_feed: item?.is_feed ?? false,
        reorder_level: item?.reorder_level ?? undefined,
        notes: item?.notes ?? '',
      })
  }, [open, item, form])
  const mutation = useSave(
    async (v: z.output<typeof itemSchema>) => {
      const values = { ...v, production_type: (v.production_type || null) as InventoryItem['production_type'], reorder_level: v.reorder_level ?? null }
      if (item) await inventoryService.updateItem(item.id, values)
      else await inventoryService.createItem(activeOrgId!, values)
      await invalidateReference(qc)
    },
    { success: item ? 'Item saved' : 'Item added', onSuccess: () => onOpenChange(false) },
  )
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={item ? `Edit ${item.name}` : 'Add an inventory item'}
      description="The unit is how the balance is kept. You can still record purchases and use in bags, grams or tonnes."
      submitLabel={item ? 'Save' : 'Add item'}
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof itemSchema>))}
    >
      <Field label="Name" htmlFor="it-name" error={errors.name?.message} required>
        <Input id="it-name" maxLength={120} placeholder="e.g. Layer mash (Top Feeds)" {...form.register('name')} />
      </Field>
      <FieldRow>
        <Field label="Category" htmlFor="it-cat" error={errors.category_id?.message} required>
          <Controller
            control={form.control}
            name="category_id"
            render={({ field }) => <CategorySelect id="it-cat" kind="inventory" value={field.value} onChange={field.onChange} />}
          />
        </Field>
        <Field label="Kept in" htmlFor="it-unit" error={errors.base_unit_id?.message} required hint={item ? 'Fixed once stock has moved' : 'kg for feed and fertilizer'}>
          <Controller control={form.control} name="base_unit_id" render={({ field }) => <UnitSelect id="it-unit" placeholder="Choose a unit" value={field.value} onChange={field.onChange} />} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Reorder level" htmlFor="it-reorder" error={errors.reorder_level?.message} hint="Alert when a site's stock falls to this">
          <Input id="it-reorder" type="number" step="any" min={0} {...form.register('reorder_level')} />
        </Field>
        <Field label="Used mainly for" htmlFor="it-pt">
          <Select id="it-pt" {...form.register('production_type')}>
            <option value="">Any</option>
            <option value="poultry">Poultry</option>
            <option value="fish">Fish</option>
            <option value="crop">Crops</option>
            <option value="general">General</option>
          </Select>
        </Field>
      </FieldRow>
      <Controller
        control={form.control}
        name="is_feed"
        render={({ field }) => (
          <Checkbox checked={field.value} onChange={(e) => field.onChange(e.target.checked)} label="This is feed" description="Feed is issued to batches so consumption per batch can be tracked." />
        )}
      />
      <FieldRow>
        <Field label="Code / SKU" htmlFor="it-sku">
          <Input id="it-sku" maxLength={40} {...form.register('sku')} />
        </Field>
        <Field label="Notes" htmlFor="it-notes">
          <Textarea id="it-notes" rows={1} maxLength={1000} {...form.register('notes')} />
        </Field>
      </FieldRow>
    </FormDialog>
  )
}

function ItemsTab() {
  const { has } = useAuth()
  const query = useItems()
  const [editing, setEditing] = React.useState<InventoryItem | undefined>()
  const [open, setOpen] = React.useState(false)
  const qc = useQueryClient()
  const archive = useSave(
    async (item: InventoryItem) => {
      await inventoryService.updateItem(item.id, { status: 'archived' })
      await invalidateReference(qc)
    },
    { success: 'Item archived' },
  )
  return (
    <>
      {has('inventory.manage') ? (
        <div className="mb-3 flex justify-end">
          <Button
            variant="outline"
            onClick={() => {
              setEditing(undefined)
              setOpen(true)
            }}
          >
            <Plus /> Add item
          </Button>
        </div>
      ) : null}
      <Card>
        <QueryState query={query} empty={<EmptyState icon={Package} title="No items yet" description="Add the feed, seed, fertilizer and supplies you keep in stock." />}>
          {(rows) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Item</Th>
                    <Th>Category</Th>
                    <Th>Kept in</Th>
                    <Th align="right">Reorder at</Th>
                    <Th className="w-10">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => (
                    <Tr key={i.id}>
                      <Td>
                        <span className="font-medium">{i.name}</span>
                        {i.is_feed ? <Badge variant="primary" className="ml-2">Feed</Badge> : null}
                        {i.sku ? <div className="text-xs text-muted-foreground">{i.sku}</div> : null}
                      </Td>
                      <Td>{i.category?.name}</Td>
                      <Td>{i.unit?.name}</Td>
                      <Td align="right">{i.reorder_level !== null ? `${formatNumber(i.reorder_level)} ${i.unit?.symbol}` : '—'}</Td>
                      <Td>
                        {has('inventory.manage') ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Actions for ${i.name}`}>
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem
                                onSelect={() => {
                                  setEditing(i)
                                  setOpen(true)
                                }}
                              >
                                <Pencil /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem destructive onSelect={() => archive.mutate(i)}>
                                Archive
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </QueryState>
      </Card>
      <ItemDialog open={open} onOpenChange={setOpen} item={editing} />
    </>
  )
}
