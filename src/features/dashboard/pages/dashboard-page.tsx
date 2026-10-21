import * as React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Bird, ClipboardList, Fish, Info, Package, Sprout, Users, Wheat } from 'lucide-react'
import { useAuth, useCurrency } from '@/features/auth/context/auth-provider'
import { useSiteScope } from '@/shared/context/site-scope'
import { reportsService } from '@/features/reports/services/reports.service'
import { alertsService, ALERT_KIND_LABEL } from '@/features/alerts/services/alerts.service'
import { activityService } from '@/features/activity/services/activity.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Select } from '@/shared/components/ui/input'
import { EmptyState, ErrorState, LoadingRows, StatCard } from '@/shared/components/common'
import { BarChart } from '@/shared/components/bar-chart'
import { PeriodFilter, usePeriod } from '@/shared/components/period-filter'
import { formatDate, formatMoney, formatNumber, formatPercent } from '@/shared/lib/format'
import { mortalityRate } from '@/shared/lib/calc'
import { useQuickActions } from '@/features/operations/components/quick-actions'
import { cn } from '@/shared/lib/utils'

const TYPE_BADGE = { poultry: 'poultry', fish: 'fish', crop: 'crop', general: 'neutral' } as const

export function DashboardPage() {
  const { activeOrgId, organization, profile, has } = useAuth()
  const currency = useCurrency()
  const { siteId, sites } = useSiteScope()
  const [period, setPeriod] = usePeriod('30d')
  const [ptype, setPtype] = React.useState('')
  const { open } = useQuickActions()
  const p = { from: period.from, to: period.to, siteId: siteId || undefined, productionType: ptype || undefined }

  const summary = useQuery({
    queryKey: ['dashboard', activeOrgId, p],
    enabled: !!activeOrgId,
    queryFn: () => reportsService.dashboard(activeOrgId!, p),
  })
  const monthly = useQuery({
    queryKey: ['reports', activeOrgId, 'finance-monthly-dash', p],
    enabled: !!activeOrgId && has('finance.view'),
    queryFn: () => reportsService.financeMonthly(activeOrgId!, p),
  })
  const alerts = useQuery({
    queryKey: ['alerts', activeOrgId, siteId],
    enabled: !!activeOrgId,
    queryFn: () => alertsService.list(activeOrgId!, siteId || undefined),
  })
  const recent = useQuery({
    queryKey: ['activity', activeOrgId, 'recent', siteId],
    enabled: !!activeOrgId && has('operations.view'),
    queryFn: () => activityService.list(activeOrgId!, { siteId: siteId || undefined, limit: 8 }),
  })

  const d = summary.data
  const firstName = profile?.full_name?.split(' ')[0]
  const noSites = sites.length === 0
  const nothingYet = d && d.active.poultry_batches + d.active.fish_batches + d.active.crop_cycles === 0 && (recent.data?.length ?? 0) === 0

  const eggs = d?.production.filter((x) => x.kind === 'egg_collection').reduce((s, x) => s + x.quantity, 0) ?? 0
  const fishKg = d?.production.filter((x) => x.kind === 'fish_harvest').reduce((s, x) => s + x.quantity, 0) ?? 0
  const crops = d?.production.filter((x) => x.kind === 'crop_harvest') ?? []
  const showPoultry = !ptype || ptype === 'poultry'
  const showFish = !ptype || ptype === 'fish'
  const showCrop = !ptype || ptype === 'crop'

  return (
    <div className="space-y-5">
      <section>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{formatDate(new Date(), 'EEEE d MMMM')}</p>
            <h1 className="mt-0.5 text-2xl font-semibold">{firstName ? `Good to see you, ${firstName}` : organization?.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {siteId ? sites.find((s) => s.id === siteId)?.name : `${organization?.name} · ${sites.length} site${sites.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="no-print flex flex-wrap items-center gap-2">
            <PeriodFilter value={period} onChange={setPeriod} />
            <div className="w-36">
              <label htmlFor="dash-type" className="sr-only">
                Production type
              </label>
              <Select id="dash-type" className="h-9" value={ptype} onChange={(e) => setPtype(e.target.value)}>
                <option value="">All production</option>
                <option value="poultry">Poultry</option>
                <option value="fish">Fish</option>
                <option value="crop">Crops</option>
              </Select>
            </div>
          </div>
        </div>
      </section>

      {noSites ? (
        <Card>
          <EmptyState
            icon={Sprout}
            title="Add your first farm site"
            description="Sites are where your batches, ponds, fields and stores live."
            action={
              <Button asChild>
                <Link to="/sites">Add a site</Link>
              </Button>
            }
          />
        </Card>
      ) : null}

      {nothingYet && !noSites ? <GettingStarted onRecord={() => open('activity')} /> : null}

      {summary.isLoading ? (
        <Card>
          <LoadingRows rows={3} />
        </Card>
      ) : summary.error ? (
        <Card>
          <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
        </Card>
      ) : d ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {showPoultry ? (
              <StatCard
                tone="poultry"
                icon={Bird}
                label="Birds on farm"
                value={formatNumber(d.population.birds)}
                hint={`${d.active.poultry_batches} active flock${d.active.poultry_batches === 1 ? '' : 's'}`}
              />
            ) : null}
            {showPoultry ? (
              <StatCard
                tone="poultry"
                label="Poultry mortality"
                value={formatNumber(d.mortality.poultry)}
                hint={d.mortality.poultry_at_risk ? `${formatPercent(mortalityRate(d.mortality.poultry, d.mortality.poultry_at_risk), 2)} of birds in period` : 'No birds in period'}
              />
            ) : null}
            {showFish ? (
              <StatCard
                tone="fish"
                icon={Fish}
                label="Fish in ponds"
                value={formatNumber(d.population.fish_estimated)}
                estimate
                hint={d.population.fish_biomass_kg_estimated ? `≈ ${formatNumber(d.population.fish_biomass_kg_estimated, 0)} kg` : `${d.active.fish_batches} batch${d.active.fish_batches === 1 ? '' : 'es'}`}
              />
            ) : null}
            {showFish ? (
              <StatCard
                tone="fish"
                label="Fish mortality"
                value={formatNumber(d.mortality.fish)}
                hint={d.mortality.fish_at_risk ? `${formatPercent(mortalityRate(d.mortality.fish, d.mortality.fish_at_risk), 2)} of estimated stock` : 'No fish in period'}
              />
            ) : null}
            {showCrop ? <StatCard tone="crop" icon={Sprout} label="Crop cycles growing" value={formatNumber(d.active.crop_cycles)} hint="Active or harvesting" /> : null}
            <StatCard tone="general" label="Feed consumed" value={`${formatNumber(d.feed_consumed_kg, 0)} kg`} hint="Recorded as eaten in period" />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {showPoultry ? <StatCard tone="poultry" icon={Wheat} label="Eggs collected" value={formatNumber(eggs, 0)} hint={`≈ ${formatNumber(eggs / 30, 0)} crates, after rejects`} /> : null}
            {showFish ? <StatCard tone="fish" label="Fish harvested" value={`${formatNumber(fishKg, 0)} kg`} /> : null}
            {showCrop ? (
              <StatCard
                tone="crop"
                label="Crops harvested"
                value={crops.length ? crops.map((c) => `${formatNumber(c.quantity, 0)} ${c.unit}`).slice(0, 1).join(', ') : '0'}
                hint={crops.length ? crops.map((c) => c.product).join(', ') : 'No harvests in period'}
              />
            ) : null}
            <StatCard tone="plain" icon={Package} label="Low stock items" value={formatNumber(d.low_stock_items)} hint={d.low_stock_items ? <Link to="/inventory" className="text-brand hover:underline">Review stock</Link> : 'All above reorder level'} />
            {d.finance ? (
              <>
                <StatCard tone="money" label="Income recorded" value={formatMoney(d.finance.income, currency, { compact: true })} hint={formatMoney(d.finance.income, currency)} />
                <StatCard tone="plain" label="Expenses recorded" value={formatMoney(d.finance.expense, currency, { compact: true })} hint={formatMoney(d.finance.expense, currency)} />
              </>
            ) : null}
          </div>

          {d.finance ? (
            <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[13px] font-medium text-muted-foreground">Operating surplus (cash recorded)</p>
                <p className={cn('mt-1 text-2xl font-semibold tabular', d.finance.operating_surplus < 0 && 'text-destructive')}>
                  {formatMoney(d.finance.operating_surplus, currency)}
                </p>
              </div>
              <p className="flex max-w-xl gap-2 text-[13px] text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                Income minus expenses recorded in this period. It is not accounting profit: unpaid bills, stock on hand, depreciation and anything not entered here are not included.
                {d.sales && d.sales.outstanding > 0 ? ` Customers still owe ${formatMoney(d.sales.outstanding, currency)} on sales in this period.` : ''}
              </p>
            </Card>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-2">
            {showPoultry || showFish ? (
              <Card>
                <CardHeader>
                  <CardTitle>Daily mortality</CardTitle>
                  <span className="text-xs text-muted-foreground">Birds and fish recorded dead</span>
                </CardHeader>
                <CardContent>
                  {d.daily.some((x) => x.mortality > 0) ? (
                    <BarChart
                      ariaLabel="Daily mortality"
                      series={[{ key: 'm', label: 'Deaths', color: 'hsl(var(--soil))' }]}
                      data={d.daily.map((x) => ({ label: formatDate(x.day, 'd MMM'), title: formatDate(x.day, 'EEE d MMM yyyy'), values: { m: x.mortality } }))}
                    />
                  ) : (
                    <EmptyState title="No mortality recorded in this period" className="py-8" />
                  )}
                </CardContent>
              </Card>
            ) : null}
            {showPoultry ? (
              <Card>
                <CardHeader>
                  <CardTitle>Eggs collected per day</CardTitle>
                  <span className="text-xs text-muted-foreground">Good eggs, in pieces</span>
                </CardHeader>
                <CardContent>
                  {d.daily.some((x) => x.eggs > 0) ? (
                    <BarChart
                      ariaLabel="Eggs collected per day"
                      series={[{ key: 'e', label: 'Eggs', color: 'hsl(var(--poultry))' }]}
                      data={d.daily.map((x) => ({ label: formatDate(x.day, 'd MMM'), title: formatDate(x.day, 'EEE d MMM yyyy'), values: { e: x.eggs } }))}
                    />
                  ) : (
                    <EmptyState title="No egg collections in this period" className="py-8" />
                  )}
                </CardContent>
              </Card>
            ) : null}
            {has('finance.view') ? (
              <Card className={cn(!showPoultry && !showFish && 'lg:col-span-2')}>
                <CardHeader>
                  <CardTitle>Money in and out by month</CardTitle>
                  <Link to="/reports?tab=finance" className="text-xs text-brand hover:underline">
                    Finance report
                  </Link>
                </CardHeader>
                <CardContent>
                  {monthly.data && monthly.data.length ? (
                    <BarChart
                      ariaLabel="Income and expenses by month"
                      format={(v) => formatMoney(v, currency, { compact: true })}
                      series={[
                        { key: 'income', label: 'Income', color: 'hsl(var(--money-in))' },
                        { key: 'expense', label: 'Expenses', color: 'hsl(var(--money-out))' },
                      ]}
                      data={monthly.data.map((m) => ({ label: formatDate(m.month, 'MMM'), title: formatDate(m.month, 'MMMM yyyy'), values: { income: m.income, expense: m.expense } }))}
                    />
                  ) : (
                    <EmptyState title="No income or expenses in this period" className="py-8" />
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <Link to="/alerts" className="text-xs text-brand hover:underline">
              All alerts
            </Link>
          </CardHeader>
          {alerts.isLoading ? (
            <LoadingRows rows={3} />
          ) : alerts.data && alerts.data.length ? (
            <ul className="divide-y border-t">
              {alerts.data.slice(0, 6).map((a) => (
                <li key={a.alert_key} className="flex items-start gap-3 px-5 py-2.5">
                  <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', a.severity === 'critical' ? 'text-destructive' : a.severity === 'warning' ? 'text-warning' : 'text-info')} />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{a.title}</p>
                    <p className="text-muted-foreground">
                      {ALERT_KIND_LABEL[a.kind]} · {a.site_name ?? 'Organization-wide'} · {a.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing needs attention" description="Alerts appear here for low stock, high mortality, overdue tasks and missing daily records." className="py-8" />
          )}
        </Card>

        {has('operations.view') ? (
          <Card>
            <CardHeader>
              <CardTitle>Latest records</CardTitle>
              <Link to="/log" className="text-xs text-brand hover:underline">
                Daily log
              </Link>
            </CardHeader>
            {recent.isLoading ? (
              <LoadingRows rows={4} />
            ) : recent.data && recent.data.length ? (
              <ul className="divide-y border-t">
                {recent.data.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                    <Badge variant={TYPE_BADGE[a.production_type]} className="mt-0.5 shrink-0">
                      {a.category?.name}
                    </Badge>
                    <div className="min-w-0">
                      <p className="truncate">{a.summary}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(a.occurred_on)} · {a.site?.name}
                        {a.responsible ? ` · ${a.responsible.full_name || a.responsible.email}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={ClipboardList} title="No records yet" description="Daily work recorded by your team will appear here." className="py-8" />
            )}
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function GettingStarted({ onRecord }: { onRecord: () => void }) {
  const { has } = useAuth()
  const steps = [
    has('settings.manage') && { to: '/sites', label: 'Add houses, ponds or fields to your site', icon: Sprout },
    has('batches.manage') && { to: '/poultry', label: 'Start a flock, fish batch or crop cycle', icon: Bird },
    has('inventory.manage') && { to: '/inventory', label: 'Add feed and inputs with opening stock', icon: Package },
    has('members.manage') && { to: '/admin?tab=users', label: 'Invite your manager, workers and accountant', icon: Users },
  ].filter(Boolean) as { to: string; label: string; icon: React.ComponentType<{ className?: string }> }[]
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">Get your farm set up</h2>
      <p className="mt-1 text-sm text-muted-foreground">Figures on this page come only from what your team records. Start with these:</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.to}>
            <Link to={s.to} className="flex items-center gap-3 rounded-md border bg-surface px-3 py-2.5 text-sm hover:bg-muted/40">
              <s.icon className="h-4 w-4 text-brand" />
              <span className="flex-1">{s.label}</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
      {has('operations.record') ? (
        <Button variant="link" className="mt-3" onClick={onRecord}>
          Or add a first entry to the daily log
        </Button>
      ) : null}
    </Card>
  )
}
