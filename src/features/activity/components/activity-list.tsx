import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, MoreHorizontal } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { activityService, type ActivityEntry, type ActivityFilters } from '@/features/activity/services/activity.service'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/components/ui/misc'
import { EmptyState, QueryState } from '@/shared/components/common'
import { ReasonDialog } from '@/shared/components/reason-dialog'
import { useSave } from '@/shared/hooks/use-record'
import { formatDate, formatNumber } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

const TYPE_VARIANT = { poultry: 'poultry', fish: 'fish', crop: 'crop', general: 'neutral' } as const

function groupByDay(rows: ActivityEntry[]) {
  const map = new Map<string, ActivityEntry[]>()
  for (const r of rows) map.set(r.occurred_on, [...(map.get(r.occurred_on) ?? []), r])
  return [...map.entries()]
}

export function useActivity(filters: ActivityFilters) {
  const { activeOrgId } = useAuth()
  return useQuery({ queryKey: ['activity', activeOrgId, filters], enabled: !!activeOrgId, queryFn: () => activityService.list(activeOrgId!, filters) })
}

/** Day-grouped history. System entries link to the record that created them. */
export function ActivityList({ filters, emptyText, showSite = true }: { filters: ActivityFilters; emptyText?: string; showSite?: boolean }) {
  const query = useActivity(filters)
  const { userId, has } = useAuth()
  const [voiding, setVoiding] = React.useState<ActivityEntry | null>(null)
  const voidMutation = useSave(({ id, reason }: { id: string; reason: string }) => activityService.void(id, reason), { success: 'Entry voided' })

  return (
    <>
      <QueryState query={query} empty={<EmptyState icon={ClipboardList} title={emptyText ?? 'No records for these filters'} />}>
        {(rows) => (
          <div className="divide-y">
            {groupByDay(rows).map(([day, items]) => (
              <section key={day}>
                <h3 className="sticky top-14 z-[1] bg-muted/70 px-5 py-1.5 font-sans text-xs font-semibold tracking-normal text-muted-foreground backdrop-blur-[1px]">
                  {formatDate(day, 'EEEE d MMMM yyyy')}
                </h3>
                <ul className="divide-y">
                  {items.map((a) => (
                    <li key={a.id} className={cn('flex items-start gap-3 px-5 py-2.5', a.voided_at && 'opacity-60')}>
                      <Badge variant={TYPE_VARIANT[a.production_type]} className="mt-0.5 shrink-0">
                        {a.category?.name}
                      </Badge>
                      <div className="min-w-0 flex-1 text-sm">
                        <p className={cn(a.voided_at && 'line-through')}>{a.summary}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {[
                            a.occurred_at && a.source === 'manual' ? formatDate(a.occurred_at, 'HH:mm') : null,
                            showSite ? a.site?.name : null,
                            a.batch?.code,
                            a.crop_cycle?.code,
                            a.quantity !== null && a.source === 'manual' ? `${formatNumber(a.quantity)} ${a.unit?.symbol ?? ''}` : null,
                            a.responsible ? a.responsible.full_name || a.responsible.email : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {a.notes ? <p className="mt-1 text-xs text-muted-foreground">{a.notes}</p> : null}
                        {a.voided_at ? <p className="mt-1 text-xs text-destructive">Voided: {a.void_reason}</p> : null}
                      </div>
                      {a.source === 'manual' && !a.voided_at && (a.recorded_by === userId || has('batches.manage')) ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Entry actions">
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem destructive onSelect={() => setVoiding(a)}>
                              Void entry
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {rows.length >= (filters.limit ?? 200) ? (
              <p className="px-5 py-3 text-center text-xs text-muted-foreground">Showing the latest {rows.length}. Narrow the dates to see older records.</p>
            ) : null}
          </div>
        )}
      </QueryState>
      <ReasonDialog
        open={!!voiding}
        onOpenChange={(o) => !o && setVoiding(null)}
        title="Void this entry?"
        description="It stays in the history, crossed out, with your reason."
        confirmLabel="Void entry"
        onConfirm={(reason) => voidMutation.mutateAsync({ id: voiding!.id, reason })}
      />
    </>
  )
}
