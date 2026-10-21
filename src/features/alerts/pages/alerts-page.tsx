import * as React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertOctagon, AlertTriangle, BellRing, Info, Settings } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useSiteScope } from '@/shared/context/site-scope'
import { alertsService, alertLink, ALERT_KIND_LABEL, type Alert } from '@/features/alerts/services/alerts.service'
import { batchesService } from '@/features/batches/services/batches.service'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { EmptyState, PageHeader, QueryState } from '@/shared/components/common'
import { formatDate } from '@/shared/lib/format'

const SEVERITY = {
  critical: { label: 'Critical', icon: AlertOctagon, variant: 'danger', color: 'text-destructive' },
  warning: { label: 'Warning', icon: AlertTriangle, variant: 'warning', color: 'text-warning' },
  info: { label: 'For information', icon: Info, variant: 'info', color: 'text-info' },
} as const

export function AlertsPage() {
  const { activeOrgId, has } = useAuth()
  const { siteId } = useSiteScope()
  const query = useQuery({ queryKey: ['alerts', activeOrgId, siteId], enabled: !!activeOrgId, queryFn: () => alertsService.list(activeOrgId!, siteId || undefined) })
  const batches = useQuery({ queryKey: ['batches', activeOrgId, 'active', siteId ?? '', ''], enabled: !!activeOrgId && has('operations.view'), queryFn: () => batchesService.listActive(activeOrgId!, siteId || undefined) })
  const types = React.useMemo(() => new Map((batches.data ?? []).map((b) => [b.id, b.production_type])), [batches.data])
  return (
    <div>
      <PageHeader
        title="Alerts"
        description="Worked out from your records each time you open this page, so they clear as soon as the cause is recorded."
        actions={
          has('org.manage') ? (
            <Button asChild variant="outline">
              <Link to="/admin?tab=alerts">
                <Settings /> Alert settings
              </Link>
            </Button>
          ) : null
        }
      />
      <Card>
        <QueryState
          query={query}
          empty={<EmptyState icon={BellRing} title="No alerts" description="Low stock, unusual mortality or losses, overdue tasks, upcoming harvests and missing daily records show here." />}
        >
          {(rows) => (
            <ul className="divide-y">
              {rows.map((a: Alert) => {
                const s = SEVERITY[a.severity]
                const href = alertLink(a, types)
                return (
                  <li key={a.alert_key} className="flex items-start gap-3 px-5 py-3">
                    <s.icon className={`mt-0.5 h-5 w-5 shrink-0 ${s.color}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{a.title}</p>
                        <Badge variant={s.variant}>{s.label}</Badge>
                        <Badge variant="outline">{ALERT_KIND_LABEL[a.kind]}</Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {a.detail} · {a.site_name ?? 'Organization-wide'} · {formatDate(a.alert_date)}
                      </p>
                    </div>
                    {href ? (
                      <Button asChild variant="ghost" size="sm">
                        <Link to={href}>Open</Link>
                      </Button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </QueryState>
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">
        Missing-record alerts only appear for batches set to expect daily records, and only after the batch has existed long enough to owe one.
      </p>
    </div>
  )
}
