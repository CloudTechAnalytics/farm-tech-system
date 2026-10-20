import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { ArrowLeft, ArrowRightLeft, Egg, Fish, HeartCrack, MoreHorizontal, Pencil, Scale, Undo2, Wheat, XCircle } from 'lucide-react'
import { useAuth, useCurrency } from '@/features/auth/context/auth-provider'
import { batchesService, EVENT_LABEL, PURPOSES, type BatchEvent, type BatchSummary, type LivestockType } from '@/features/batches/services/batches.service'
import { inventoryService, feedOnHand, type FeedEvent } from '@/features/inventory/services/inventory.service'
import { productionService } from '@/features/production/services/production.service'
import { financeService } from '@/features/finance/services/finance.service'
import { useQuickActions } from '@/features/operations/components/quick-actions'
import { CloseBatchDialog, EditBatchDialog, TransferBatchDialog } from '@/features/batches/components/batch-dialogs'
import { ActivityList } from '@/features/activity/components/activity-list'
import { ProductionTable } from '@/features/production/components/production-table'
import { TransactionsTable } from '@/features/finance/components/transactions-table'
import { FinanceDialog } from '@/features/finance/components/finance-dialog'
import { ActivityDialog } from '@/features/operations/components/field-dialogs'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Table,
  TableWrap,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Td,
  Th,
  Tr,
} from '@/shared/components/ui/misc'
import { DefinitionList, EmptyState, ErrorState, LoadingRows, Notice, PageHeader, QueryState, StatCard } from '@/shared/components/common'
import { ReasonDialog } from '@/shared/components/reason-dialog'
import { useRecord } from '@/shared/hooks/use-record'
import { formatDate, formatMoney, formatNumber, formatPercent } from '@/shared/lib/format'
import { feedPerHeadGrams, henDayProduction, operatingSurplus } from '@/shared/lib/calc'
import { cn } from '@/shared/lib/utils'
import { AttachmentsButton } from '@/features/attachments/components/attachments'

export function BatchDetailPage({ type }: { type: LivestockType }) {
  const { id = '' } = useParams()
  const query = useQuery({ queryKey: ['batch', id], queryFn: () => batchesService.get(id), retry: false })
  if (query.isLoading) return <LoadingRows rows={6} />
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (!query.data || query.data.production_type !== type)
    return <EmptyState title="Batch not found" description="It may belong to a site you don't have access to." action={<Button asChild variant="outline"><Link to={`/${type}`}>Back to list</Link></Button>} />
  return <BatchDetail batch={query.data} />
}

function BatchDetail({ batch }: { batch: BatchSummary }) {
  const { has } = useAuth()
  const currency = useCurrency()
  const { open } = useQuickActions()
  const [dialog, setDialog] = React.useState<'transfer' | 'close' | 'edit' | 'expense' | 'activity' | null>(null)
  const isFish = batch.production_type === 'fish'
  const active = batch.status === 'active'
  const days = differenceInCalendarDays(batch.closed_on ? parseISO(batch.closed_on) : new Date(), parseISO(batch.start_date)) + 1

  const events = useQuery({ queryKey: ['batch-events', batch.id], queryFn: () => batchesService.events(batch.id) })
  const feed = useQuery({ queryKey: ['feed-events', batch.id], queryFn: () => inventoryService.feedEvents(batch.id) })
  const production = useQuery({ queryKey: ['production', batch.organization_id, 'batch', batch.id], queryFn: () => productionService.list(batch.organization_id, { batchId: batch.id, includeVoided: true }) })
  const samples = useQuery({ queryKey: ['samples', batch.id], enabled: isFish, queryFn: () => batchesService.samples(batch.id) })
  const money = useQuery({
    queryKey: ['finance', batch.organization_id, 'batch', batch.id],
    enabled: has('finance.view'),
    queryFn: () => financeService.list(batch.organization_id, { batchId: batch.id }),
  })

  const goodEggs = (production.data ?? [])
    .filter((r) => r.status === 'posted' && r.record_kind === 'egg_collection')
    .reduce((s, r) => s + (r.quantity - r.rejected_quantity) * r.unit_to_base, 0)
  const harvestKg = (production.data ?? []).filter((r) => r.status === 'posted' && r.record_kind === 'fish_harvest').reduce((s, r) => s + r.quantity, 0)
  const avgBirds = (batch.total_placed + batch.current_population) / 2
  const income = money.data?.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0) ?? 0
  const expense = money.data?.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0) ?? 0
  const tone = isFish ? 'fish' : 'poultry'

  return (
    <div>
      <Link to={`/${batch.production_type}`} className="no-print mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {isFish ? 'Fish batches' : 'Poultry flocks'}
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {batch.code}
            <Badge variant={active ? 'success' : 'neutral'}>{active ? 'Active' : 'Closed'}</Badge>
            {batch.count_basis === 'estimated' ? <Badge variant="estimate">Estimated count</Badge> : null}
          </span>
        }
        description={`${batch.species}${batch.breed ? ` · ${batch.breed}` : ''} · ${PURPOSES[batch.production_type].find((p) => p.value === batch.purpose)?.label} · ${batch.site_name}${batch.production_unit_name ? ` · ${batch.production_unit_name}` : ''}`}
        actions={
          <>
            {active && has('operations.record') ? (
              <Button variant="outline" onClick={() => open('mortality', { batchId: batch.id })}>
                <HeartCrack /> Mortality
              </Button>
            ) : null}
            {active && has('inventory.record') ? (
              <Button variant="outline" onClick={() => open('feed', { batchId: batch.id })}>
                <Wheat /> Feed
              </Button>
            ) : null}
            {active && has('operations.record') && !isFish ? (
              <Button onClick={() => open('eggs', { batchId: batch.id })}>
                <Egg /> Eggs
              </Button>
            ) : null}
            {active && has('operations.record') && isFish ? (
              <>
                <Button variant="outline" onClick={() => open('fish_sample', { batchId: batch.id })}>
                  <Scale /> Sample
                </Button>
                <Button onClick={() => open('fish_harvest', { batchId: batch.id })}>
                  <Fish /> Harvest
                </Button>
              </>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {active && has('operations.record') ? <DropdownMenuItem onSelect={() => setDialog('activity')}>Add to daily log</DropdownMenuItem> : null}
                {has('finance.record') ? <DropdownMenuItem onSelect={() => setDialog('expense')}>Record expense for this batch</DropdownMenuItem> : null}
                {active && has('batches.manage') ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setDialog('edit')}>
                      <Pencil /> Edit details
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDialog('transfer')}>
                      <ArrowRightLeft /> Transfer to another batch
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => open('mortality', { batchId: batch.id })}>Count correction</DropdownMenuItem>
                    <DropdownMenuItem destructive onSelect={() => setDialog('close')}>
                      <XCircle /> Close batch
                    </DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuItem onSelect={() => window.print()}>Print</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <StatCard
          tone={tone}
          label={isFish ? 'Fish now' : 'Birds now'}
          value={formatNumber(batch.current_population)}
          estimate={batch.count_basis === 'estimated'}
          hint={`of ${formatNumber(batch.total_placed)} placed`}
        />
        <StatCard tone={tone} label="Mortality" value={formatNumber(batch.total_mortality)} hint={`${formatPercent(batch.mortality_pct, 2)} of placed`} />
        <StatCard tone="general" label="Feed eaten" value={`${formatNumber(batch.feed_consumed_kg, 0)} kg`} hint={`${formatNumber(feedPerHeadGrams(batch.feed_consumed_kg / days, avgBirds), 0)} g/head/day avg`} />
        <StatCard tone="general" label="Feed at the batch" value={`${formatNumber(batch.feed_at_batch_kg, 1)} kg`} hint="Issued, not yet recorded as eaten" />
        {isFish ? (
          <>
            <StatCard tone="fish" label="Latest avg weight" value={batch.latest_avg_weight_g ? `${formatNumber(batch.latest_avg_weight_g, 0)} g` : '—'} hint={batch.latest_sample_date ? `Sampled ${formatDate(batch.latest_sample_date)}` : 'No samples yet'} />
            <StatCard tone="fish" label="Harvested" value={`${formatNumber(harvestKg, 0)} kg`} hint={batch.estimated_biomass_kg ? `≈ ${formatNumber(batch.estimated_biomass_kg, 0)} kg still in pond (est.)` : undefined} />
          </>
        ) : (
          <>
            <StatCard tone="poultry" label="Good eggs" value={formatNumber(goodEggs, 0)} hint={`${formatNumber(goodEggs / 30, 0)} crates`} />
            <StatCard tone="poultry" label="Lay rate (hen-day)" value={formatPercent(henDayProduction(goodEggs, avgBirds, days), 1)} hint="Average over the batch so far" />
          </>
        )}
      </div>

      {batch.feed_at_batch_kg > 0 && active ? (
        <Notice className="mt-4">
          Feed issued to this batch but not yet recorded as eaten: {formatNumber(batch.feed_at_batch_kg, 1)} kg. Record it as consumed when the birds or fish eat it; the store is not deducted again.
        </Notice>
      ) : null}

      <Tabs defaultValue="ledger" className="mt-5">
        <TabsList>
          <TabsTrigger value="ledger">Population</TabsTrigger>
          <TabsTrigger value="feed">Feed</TabsTrigger>
          {isFish ? <TabsTrigger value="samples">Samples</TabsTrigger> : null}
          <TabsTrigger value="production">{isFish ? 'Harvests' : 'Eggs'}</TabsTrigger>
          <TabsTrigger value="log">Daily log</TabsTrigger>
          {has('finance.view') ? <TabsTrigger value="money">Money</TabsTrigger> : null}
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          <Card>
            <QueryState query={events}>{(rows) => <PopulationLedger batch={batch} events={rows} />}</QueryState>
          </Card>
        </TabsContent>

        <TabsContent value="feed">
          <Card>
            <QueryState query={feed} empty={<EmptyState icon={Wheat} title="No feed recorded" description="Feed issued from the store and eaten at this batch appears here." />}>
              {(rows) => <FeedLedger batch={batch} events={rows} />}
            </QueryState>
          </Card>
        </TabsContent>

        {isFish ? (
          <TabsContent value="samples">
            <Card>
              <QueryState query={samples} empty={<EmptyState icon={Scale} title="No growth samples yet" />}>
                {(rows) => (
                  <TableWrap>
                    <Table>
                      <thead>
                        <tr>
                          <Th>Date</Th>
                          <Th align="right">Fish sampled</Th>
                          <Th align="right">Total weight</Th>
                          <Th align="right">Average</Th>
                          <Th>Notes</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((s) => (
                          <Tr key={s.id}>
                            <Td>{formatDate(s.sample_date)}</Td>
                            <Td align="right">{formatNumber(s.sample_size)}</Td>
                            <Td align="right">{formatNumber(s.total_weight_g / 1000, 2)} kg</Td>
                            <Td align="right" className="font-medium">
                              {formatNumber(s.avg_weight_g, 1)} g
                            </Td>
                            <Td className="text-muted-foreground">{s.notes ?? ''}</Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                  </TableWrap>
                )}
              </QueryState>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="production">
          <Card>
            <QueryState query={production}>{(rows) => <ProductionTable rows={rows} showSource={false} />}</QueryState>
          </Card>
        </TabsContent>

        <TabsContent value="log">
          <Card>
            <ActivityList filters={{ batchId: batch.id, includeVoided: true }} showSite={false} emptyText="Nothing logged for this batch yet" />
          </Card>
        </TabsContent>

        {has('finance.view') ? (
          <TabsContent value="money" className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard tone="money" label="Income linked" value={formatMoney(income, currency)} />
              <StatCard tone="plain" label="Expenses linked" value={formatMoney(expense, currency)} />
              <StatCard tone="plain" label="Surplus (cash recorded)" value={formatMoney(operatingSurplus(income, expense), currency)} hint="Only entries linked to this batch" />
            </div>
            <Card>
              <QueryState query={money}>{(rows) => <TransactionsTable rows={rows} emptyText="No income or expenses linked to this batch" />}</QueryState>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>Batch details</CardTitle>
              <AttachmentsButton entityType="batch" entityId={batch.id} siteId={batch.site_id} />
            </CardHeader>
            <CardContent>
              <DefinitionList
                items={[
                  { label: 'Started', value: `${formatDate(batch.start_date)} (day ${days})` },
                  { label: 'Starting number', value: formatNumber(batch.initial_quantity) },
                  { label: 'Source', value: batch.source },
                  { label: 'Average weight at start', value: batch.initial_avg_weight_g ? `${formatNumber(batch.initial_avg_weight_g)} g` : null },
                  { label: 'Count basis', value: batch.count_basis === 'estimated' ? 'Estimated' : 'Counted' },
                  { label: 'Daily records expected', value: batch.expects_daily_records ? 'Yes' : 'No' },
                  { label: 'Closed', value: batch.closed_on ? `${formatDate(batch.closed_on)}: ${batch.close_reason ?? ''}` : null },
                  { label: 'Notes', value: batch.notes },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <TransferBatchDialog open={dialog === 'transfer'} onOpenChange={(o) => !o && setDialog(null)} batch={batch} />
      <CloseBatchDialog open={dialog === 'close'} onOpenChange={(o) => !o && setDialog(null)} batch={batch} />
      <EditBatchDialog open={dialog === 'edit'} onOpenChange={(o) => !o && setDialog(null)} batch={batch} />
      <FinanceDialog open={dialog === 'expense'} onOpenChange={(o) => !o && setDialog(null)} kind="expense" batchId={batch.id} siteId={batch.site_id} productionType={batch.production_type} />
      <ActivityDialog open={dialog === 'activity'} onOpenChange={(o) => !o && setDialog(null)} batchId={batch.id} siteId={batch.site_id} productionType={batch.production_type} />
    </div>
  )
}

function PopulationLedger({ batch, events }: { batch: BatchSummary; events: BatchEvent[] }) {
  const { has } = useAuth()
  const [reversing, setReversing] = React.useState<BatchEvent | null>(null)
  const reverse = useRecord((key, v: { id: string; reason: string }) => batchesService.reverseEvent(key, v.id, v.reason), { success: 'Record reversed' })
  const reversed = new Set(events.filter((e) => e.reverses_event_id).map((e) => e.reverses_event_id))
  // Running balance, oldest first.
  const chronological = [...events].reverse()
  let running = 0
  const balanceAfter = new Map<string, number>()
  for (const e of chronological) {
    running += e.quantity
    balanceAfter.set(e.id, running)
  }
  const reversible = (e: BatchEvent) =>
    batch.status === 'active' && has('batches.manage') && !reversed.has(e.id) && !['reversal', 'acquisition', 'opening', 'transfer_in', 'transfer_out', 'sale', 'harvest'].includes(e.kind)

  return (
    <>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Entry</Th>
              <Th>Reason</Th>
              <Th align="right">Change</Th>
              <Th align="right">Balance</Th>
              <Th className="w-10">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <Tr key={e.id} className={cn(reversed.has(e.id) && 'text-muted-foreground')}>
                <Td className="whitespace-nowrap">{formatDate(e.event_date)}</Td>
                <Td>
                  <span className={cn(reversed.has(e.id) && 'line-through')}>{EVENT_LABEL[e.kind]}</span>
                  {e.kind === 'reversal' ? <span className="text-muted-foreground"> of {EVENT_LABEL[e.effective_kind]?.toLowerCase()}</span> : null}
                  {e.is_estimate ? <Badge variant="estimate" className="ml-1.5">est.</Badge> : null}
                  {e.weight_kg ? <div className="text-xs text-muted-foreground">{formatNumber(e.weight_kg, 1)} kg</div> : null}
                </Td>
                <Td className="text-muted-foreground">{e.reason ?? ''}</Td>
                <Td align="right" className={cn('font-medium', e.quantity < 0 ? 'text-foreground' : 'text-success')}>
                  {e.quantity > 0 ? '+' : ''}
                  {formatNumber(e.quantity)}
                </Td>
                <Td align="right">{formatNumber(balanceAfter.get(e.id))}</Td>
                <Td>
                  {reversible(e) ? (
                    <Button variant="ghost" size="icon" aria-label="Reverse entry" title="Reverse entry" onClick={() => setReversing(e)}>
                      <Undo2 />
                    </Button>
                  ) : null}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      <p className="px-5 py-3 text-xs text-muted-foreground">
        The population is the sum of these entries. Mistakes are corrected with a reversal, never by editing or deleting an entry.
      </p>
      <ReasonDialog
        open={!!reversing}
        onOpenChange={(o) => !o && setReversing(null)}
        title="Reverse this entry?"
        description={reversing ? `${EVENT_LABEL[reversing.kind]} of ${formatNumber(Math.abs(reversing.quantity))} on ${formatDate(reversing.event_date)} will be cancelled by a new entry dated today.` : ''}
        confirmLabel="Reverse entry"
        onConfirm={(reason) => reverse.mutateAsync({ id: reversing!.id, reason })}
      />
    </>
  )
}

const FEED_KIND: Record<FeedEvent['kind'], string> = { issued: 'Issued from store', consumed: 'Eaten', wasted: 'Wasted', returned: 'Returned to store', reversal: 'Reversal' }

function FeedLedger({ batch, events }: { batch: BatchSummary; events: FeedEvent[] }) {
  const { has } = useAuth()
  const [reversing, setReversing] = React.useState<FeedEvent | null>(null)
  const reverse = useRecord((key, v: { id: string; reason: string }) => inventoryService.reverseFeedEvent(key, v.id, v.reason), { success: 'Feed record reversed' })
  const reversed = new Set(events.filter((e) => e.reverses_feed_event_id).map((e) => e.reverses_feed_event_id))
  const onHand = feedOnHand(events)
  return (
    <>
      {onHand.length ? (
        <div className="flex flex-wrap gap-2 border-b px-5 py-3 text-sm">
          <span className="text-muted-foreground">At the batch now:</span>
          {onHand.map((f) => (
            <Badge key={f.item_id} variant="primary">
              {f.name}: {formatNumber(f.quantity, 2)} {f.unit}
            </Badge>
          ))}
        </div>
      ) : null}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Feed</Th>
              <Th>Entry</Th>
              <Th align="right">At batch</Th>
              <Th>Notes</Th>
              <Th className="w-10">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <Tr key={e.id} className={cn(reversed.has(e.id) && 'text-muted-foreground')}>
                <Td className="whitespace-nowrap">{formatDate(e.event_date)}</Td>
                <Td>{e.item?.name}</Td>
                <Td className={cn(reversed.has(e.id) && 'line-through')}>{FEED_KIND[e.kind]}</Td>
                <Td align="right">
                  {e.quantity > 0 ? '+' : ''}
                  {formatNumber(e.quantity, 2)} {e.item?.unit?.symbol}
                </Td>
                <Td className="text-muted-foreground">{e.notes ?? ''}</Td>
                <Td>
                  {has('inventory.manage') && batch.status === 'active' && e.kind !== 'reversal' && !reversed.has(e.id) ? (
                    <Button variant="ghost" size="icon" aria-label="Reverse feed record" title="Reverse" onClick={() => setReversing(e)}>
                      <Undo2 />
                    </Button>
                  ) : null}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      <p className="px-5 py-3 text-xs text-muted-foreground">
        Store stock goes down once, when feed is issued. Eating or wasting issued feed only changes what is held at the batch.
      </p>
      <ReasonDialog
        open={!!reversing}
        onOpenChange={(o) => !o && setReversing(null)}
        title="Reverse this feed record?"
        description={reversing?.kind === 'issued' || reversing?.kind === 'returned' ? 'The store balance is corrected too.' : 'Only the feed held at the batch changes; the store is not affected.'}
        confirmLabel="Reverse"
        onConfirm={(reason) => reverse.mutateAsync({ id: reversing!.id, reason })}
      />
    </>
  )
}
