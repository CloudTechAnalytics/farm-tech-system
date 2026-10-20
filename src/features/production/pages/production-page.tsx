import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Egg, Fish, Wheat } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useSiteScope } from '@/shared/context/site-scope'
import { productionService } from '@/features/production/services/production.service'
import { ProductionTable } from '@/features/production/components/production-table'
import { useQuickActions } from '@/features/operations/components/quick-actions'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Checkbox, Select } from '@/shared/components/ui/input'
import { PageHeader, QueryState } from '@/shared/components/common'
import { PeriodFilter, usePeriod } from '@/shared/components/period-filter'
import { downloadCsv, toCsv } from '@/shared/lib/csv'

export function ProductionPage() {
  const { activeOrgId, has } = useAuth()
  const { siteId } = useSiteScope()
  const { open } = useQuickActions()
  const [period, setPeriod] = usePeriod('30d')
  const [type, setType] = React.useState('')
  const [availableOnly, setAvailableOnly] = React.useState(false)
  const query = useQuery({
    queryKey: ['production', activeOrgId, siteId, period, type, availableOnly],
    enabled: !!activeOrgId,
    queryFn: () => productionService.list(activeOrgId!, { siteId: siteId || undefined, from: period.from, to: period.to, type: type || undefined, availableOnly }),
  })
  const exportCsv = () =>
    downloadCsv(
      `production-${period.from}-to-${period.to}`,
      toCsv(query.data ?? [], [
        { header: 'Date', value: (r) => r.record_date },
        { header: 'Type', value: (r) => r.record_kind },
        { header: 'Product', value: (r) => r.product },
        { header: 'From', value: (r) => r.source_code },
        { header: 'Site', value: (r) => r.site_name },
        { header: 'Quantity', value: (r) => r.quantity },
        { header: 'Rejected', value: (r) => r.rejected_quantity },
        { header: 'Sold', value: (r) => r.sold_quantity },
        { header: 'Used or lost', value: (r) => r.disposed_quantity - r.sold_quantity },
        { header: 'Available', value: (r) => r.available_quantity },
        { header: 'Unit', value: (r) => r.unit_symbol },
        { header: 'Grade', value: (r) => r.grade },
        { header: 'Estimate', value: (r) => (r.is_estimate ? 'yes' : 'no') },
      ]),
    )
  return (
    <div>
      <PageHeader
        title="Produce and harvest"
        description="Eggs collected and harvests, with what has been sold, used or lost and what is still available to sell."
        actions={
          <>
            {has('reports.export') ? (
              <Button variant="outline" onClick={exportCsv} disabled={!query.data?.length}>
                <Download /> Export CSV
              </Button>
            ) : null}
            {has('operations.record') ? (
              <>
                <Button variant="outline" onClick={() => open('eggs')}>
                  <Egg /> Eggs
                </Button>
                <Button variant="outline" onClick={() => open('fish_harvest')}>
                  <Fish /> Fish harvest
                </Button>
                <Button onClick={() => open('crop_harvest')}>
                  <Wheat /> Crop harvest
                </Button>
              </>
            ) : null}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <PeriodFilter value={period} onChange={setPeriod} />
        <div className="w-36">
          <Select aria-label="Production type" className="h-9" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All produce</option>
            <option value="poultry">Poultry</option>
            <option value="fish">Fish</option>
            <option value="crop">Crops</option>
          </Select>
        </div>
        <Checkbox label="Only produce still available" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} />
      </div>
      <Card>
        <QueryState query={query} isEmpty={() => false}>
          {(rows) => <ProductionTable rows={rows} />}
        </QueryState>
      </Card>
    </div>
  )
}
