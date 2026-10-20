import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MoreHorizontal, Wheat } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { productionService, RECORD_KIND_LABEL, DISPOSAL_LABEL, type ProductionRecord } from '@/features/production/services/production.service'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input, Select } from '@/shared/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Table, TableWrap, Td, Th, Tr } from '@/shared/components/ui/misc'
import { EmptyState, Field } from '@/shared/components/common'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { ReasonDialog } from '@/shared/components/reason-dialog'
import { useRecord, useSave } from '@/shared/hooks/use-record'
import { dateField, optionalText, positiveNumber } from '@/shared/lib/validation'
import { formatDate, formatNumber, todayISO } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { AttachmentsButton } from '@/features/attachments/components/attachments'

const TYPE_VARIANT = { poultry: 'poultry', fish: 'fish', crop: 'crop' } as const

const disposalSchema = z.object({
  kind: z.enum(['internal_use', 'given_away', 'spoiled', 'other']),
  quantity: positiveNumber('Quantity'),
  date: dateField(),
  notes: optionalText(500),
})

function DisposalDialog({ record, open, onOpenChange }: { record: ProductionRecord; open: boolean; onOpenChange: (o: boolean) => void }) {
  const form = useForm<z.input<typeof disposalSchema>>({ resolver: zodResolver(disposalSchema) })
  React.useEffect(() => {
    if (open) form.reset({ kind: 'internal_use', date: todayISO(), notes: '', quantity: undefined })
  }, [open, form])
  const mutation = useRecord((key, v: z.output<typeof disposalSchema>) => productionService.recordDisposal(key, { record_id: record.id, ...v }), {
    success: 'Saved',
    onSuccess: () => onOpenChange(false),
  })
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record produce used or lost"
      description={`${formatNumber(record.available_quantity, 2)} ${record.unit_symbol} of ${record.product} from ${formatDate(record.record_date)} is still available. Use Sales for anything sold.`}
      submitLabel="Save"
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof disposalSchema>))}
    >
      <FieldRow>
        <Field label="What happened" htmlFor="dp-kind">
          <Select id="dp-kind" {...form.register('kind')}>
            <option value="internal_use">Used on farm / household</option>
            <option value="given_away">Given away</option>
            <option value="spoiled">Spoiled or broken in storage</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label={`Quantity (${record.unit_symbol})`} htmlFor="dp-qty" error={errors.quantity?.message} required>
          <Input id="dp-qty" type="number" step="any" min={0} max={record.available_quantity} {...form.register('quantity')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Date" htmlFor="dp-date" error={errors.date?.message} required>
          <Input id="dp-date" type="date" max={todayISO()} {...form.register('date')} />
        </Field>
        <Field label="Notes" htmlFor="dp-notes">
          <Input id="dp-notes" maxLength={500} {...form.register('notes')} />
        </Field>
      </FieldRow>
    </FormDialog>
  )
}

export function ProductionTable({ rows, showSource = true }: { rows: ProductionRecord[]; showSource?: boolean }) {
  const { has } = useAuth()
  const [disposing, setDisposing] = React.useState<ProductionRecord | null>(null)
  const [voiding, setVoiding] = React.useState<ProductionRecord | null>(null)
  const voidMutation = useSave((v: { id: string; reason: string }) => productionService.void(v.id, v.reason), { success: 'Record voided' })
  if (!rows.length) return <EmptyState icon={Wheat} title="No production recorded" description="Egg collections and harvests appear here." />
  return (
    <>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Produce</Th>
              {showSource ? <Th>From</Th> : null}
              <Th align="right">Collected / harvested</Th>
              <Th align="right">Rejected</Th>
              <Th align="right">Sold</Th>
              <Th align="right">Still available</Th>
              <Th className="w-10">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const voided = r.status === 'voided'
              return (
                <Tr key={r.id} className={cn(voided && 'text-muted-foreground')}>
                  <Td className="whitespace-nowrap">{formatDate(r.record_date)}</Td>
                  <Td>
                    <span className={cn('font-medium', voided && 'line-through')}>{r.product}</span>
                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      <Badge variant={TYPE_VARIANT[r.production_type]}>{RECORD_KIND_LABEL[r.record_kind]}</Badge>
                      {r.grade ? <span>Grade {r.grade}</span> : null}
                      {r.head_count ? (
                        <span>
                          {formatNumber(r.head_count)} fish{r.is_estimate ? ' (est.)' : ''}
                        </span>
                      ) : null}
                      {voided ? <Badge variant="outline">Voided: {r.void_reason}</Badge> : null}
                    </div>
                  </Td>
                  {showSource ? (
                    <Td>
                      {r.source_code}
                      <div className="text-xs text-muted-foreground">{r.site_name}</div>
                    </Td>
                  ) : null}
                  <Td align="right">
                    {formatNumber(r.quantity, 2)} {r.unit_symbol}
                  </Td>
                  <Td align="right">{r.rejected_quantity ? `${formatNumber(r.rejected_quantity, 2)} ${r.unit_symbol}` : '—'}</Td>
                  <Td align="right">{r.sold_quantity ? `${formatNumber(r.sold_quantity, 2)} ${r.unit_symbol}` : '—'}</Td>
                  <Td align="right" className="font-medium">
                    {voided ? '—' : `${formatNumber(r.available_quantity, 2)} ${r.unit_symbol}`}
                    {!voided && r.disposed_quantity - r.sold_quantity > 0 ? (
                      <div className="text-xs font-normal text-muted-foreground">
                        {formatNumber(r.disposed_quantity - r.sold_quantity, 2)} used or lost
                      </div>
                    ) : null}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-0.5">
                      <AttachmentsButton entityType="production_record" entityId={r.id} siteId={r.site_id} />
                      {!voided && (has('operations.record') || has('batches.manage')) ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Record actions">
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {has('operations.record') && r.available_quantity > 0 ? (
                              <DropdownMenuItem onSelect={() => setDisposing(r)}>Record used / spoiled</DropdownMenuItem>
                            ) : null}
                            {has('batches.manage') ? (
                              <DropdownMenuItem destructive disabled={r.disposed_quantity > 0} onSelect={() => setVoiding(r)}>
                                {r.disposed_quantity > 0 ? 'Void (remove sales and uses first)' : 'Void record'}
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              )
            })}
          </tbody>
        </Table>
      </TableWrap>
      {disposing ? <DisposalDialog record={disposing} open={!!disposing} onOpenChange={(o) => !o && setDisposing(null)} /> : null}
      <ReasonDialog
        open={!!voiding}
        onOpenChange={(o) => !o && setVoiding(null)}
        title="Void this production record?"
        description={voiding?.record_kind === 'fish_harvest' ? 'The fish are returned to the batch count. The record stays in the history, marked void.' : 'The record stays in the history, marked void, and no longer counts in totals.'}
        confirmLabel="Void record"
        onConfirm={(reason) => voidMutation.mutateAsync({ id: voiding!.id, reason })}
      />
    </>
  )
}

export { DISPOSAL_LABEL }
