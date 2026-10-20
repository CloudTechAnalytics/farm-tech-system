import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bird, Fish, Plus } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useSiteScope } from '@/shared/context/site-scope'
import { batchesService, PURPOSES, type LivestockType } from '@/features/batches/services/batches.service'
import { CreateBatchDialog } from '@/features/batches/components/batch-dialogs'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Select } from '@/shared/components/ui/input'
import { Table, TableWrap, Td, Th, Tr } from '@/shared/components/ui/misc'
import { EmptyState, PageHeader, QueryState } from '@/shared/components/common'
import { formatDate, formatNumber, formatPercent } from '@/shared/lib/format'
import { differenceInCalendarDays, parseISO } from 'date-fns'

export function BatchesPage({ type }: { type: LivestockType }) {
  const { activeOrgId, has } = useAuth()
  const { siteId } = useSiteScope()
  const [status, setStatus] = React.useState<'active' | 'closed' | 'all'>('active')
  const [creating, setCreating] = React.useState(false)
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: ['batches', activeOrgId, type, siteId, status],
    enabled: !!activeOrgId,
    queryFn: () => batchesService.list(activeOrgId!, { type, siteId: siteId || undefined, status }),
  })
  const isFish = type === 'fish'
  const Icon = isFish ? Fish : Bird
  const purposeLabel = Object.fromEntries(PURPOSES[type].map((p) => [p.value, p.label]))

  return (
    <div>
      <PageHeader
        title={isFish ? 'Fish batches' : 'Poultry flocks'}
        description={isFish ? 'Stocking, mortality, sampling and harvests. Counts are estimates unless marked counted.' : 'Bird numbers, mortality, feed and eggs for each flock.'}
        actions={
          has('batches.manage') ? (
            <Button onClick={() => setCreating(true)}>
              <Plus /> {isFish ? 'Start fish batch' : 'Start flock'}
            </Button>
          ) : null
        }
      />
      <div className="mb-3 flex items-center gap-2">
        <label htmlFor="batch-status" className="text-sm text-muted-foreground">
          Show
        </label>
        <div className="w-36">
          <Select id="batch-status" className="h-9" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
            <option value="all">All</option>
          </Select>
        </div>
      </div>
      <Card>
        <QueryState
          query={query}
          empty={
            <EmptyState
              icon={Icon}
              title={status === 'active' ? `No active ${isFish ? 'fish batches' : 'flocks'}` : 'Nothing to show'}
              description={has('batches.manage') ? 'Start one to begin recording mortality, feed and production.' : 'Ask a manager to start a batch.'}
              action={has('batches.manage') ? <Button onClick={() => setCreating(true)}>{isFish ? 'Start fish batch' : 'Start flock'}</Button> : undefined}
            />
          }
        >
          {(rows) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Batch</Th>
                    <Th>Site · unit</Th>
                    <Th>Started</Th>
                    <Th align="right">{isFish ? 'Fish (est.)' : 'Birds'}</Th>
                    <Th align="right">Mortality</Th>
                    <Th align="right">Feed eaten</Th>
                    {isFish ? <Th align="right">Avg weight</Th> : null}
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <Tr key={b.id} className="cursor-pointer" onClick={() => navigate(`/${type}/${b.id}`)}>
                      <Td>
                        <Link to={`/${type}/${b.id}`} className="font-medium text-foreground hover:underline" onClick={(e) => e.stopPropagation()}>
                          {b.code}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {b.species}
                          {b.breed ? ` · ${b.breed}` : ''} · {purposeLabel[b.purpose]}
                        </div>
                      </Td>
                      <Td>
                        {b.site_name}
                        <div className="text-xs text-muted-foreground">{b.production_unit_name ?? 'No unit'}</div>
                      </Td>
                      <Td>
                        {formatDate(b.start_date)}
                        <div className="text-xs text-muted-foreground">
                          {b.status === 'active' ? `Day ${differenceInCalendarDays(new Date(), parseISO(b.start_date)) + 1}` : `Closed ${formatDate(b.closed_on)}`}
                        </div>
                      </Td>
                      <Td align="right" className="font-medium">
                        {formatNumber(b.current_population)}
                        <div className="text-xs font-normal text-muted-foreground">of {formatNumber(b.total_placed)} placed</div>
                      </Td>
                      <Td align="right">
                        {formatNumber(b.total_mortality)}
                        <div className="text-xs text-muted-foreground">{formatPercent(b.mortality_pct, 2)}</div>
                      </Td>
                      <Td align="right">{formatNumber(b.feed_consumed_kg, 0)} kg</Td>
                      {isFish ? <Td align="right">{b.latest_avg_weight_g ? `${formatNumber(b.latest_avg_weight_g, 0)} g` : '—'}</Td> : null}
                      <Td>
                        <Badge variant={b.status === 'active' ? 'success' : 'neutral'}>{b.status === 'active' ? 'Active' : 'Closed'}</Badge>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </QueryState>
      </Card>
      <CreateBatchDialog open={creating} onOpenChange={setCreating} type={type} />
    </div>
  )
}
