import * as React from 'react'
import { AlertTriangle, Loader2, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Card } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/misc'
import { Badge } from '@/shared/components/ui/badge'
import { Input } from '@/shared/components/ui/input'
import { cn } from '@/shared/lib/utils'
import { friendlyError } from '@/shared/lib/errors'

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  eyebrow?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-sm text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="no-print flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {Icon ? (
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      <AlertTriangle className="mb-2 h-6 w-6 text-destructive" />
      <p className="font-medium">This could not be loaded</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{friendlyError(error)}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      ) : null}
    </div>
  )
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  )
}

export function FullPageLoader({ label = 'Loading your farm…' }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-brand" /> {label}
      </div>
    </div>
  )
}

/** Renders loading / error / empty / content for a query in one place. */
export function QueryState<T>({
  query,
  empty,
  isEmpty,
  children,
  loadingRows,
}: {
  query: { data: T | undefined; isLoading: boolean; error: unknown; refetch: () => unknown }
  empty?: React.ReactNode
  isEmpty?: (data: T) => boolean
  children: (data: T) => React.ReactNode
  loadingRows?: number
}) {
  if (query.isLoading) return <LoadingRows rows={loadingRows} />
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (query.data === undefined) return null
  const emptyCheck = isEmpty ?? ((d: T) => Array.isArray(d) && d.length === 0)
  if (empty && emptyCheck(query.data)) return <>{empty}</>
  return <>{children(query.data)}</>
}

type Tone = 'poultry' | 'fish' | 'crop' | 'general' | 'money' | 'plain'

// Cards stay plain white; the production type shows only in the icon colour.
const toneIcon: Record<Tone, string> = {
  poultry: 'bg-poultry-soft text-poultry-ink',
  fish: 'bg-fish-soft text-fish-ink',
  crop: 'bg-crop-soft text-crop-ink',
  general: 'bg-muted text-muted-foreground',
  money: 'bg-brand-soft text-brand',
  plain: 'bg-muted text-muted-foreground',
}

/**
 * A single figure with its label. The background tint encodes the
 * production type the figure belongs to, matching badges and charts.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = 'plain',
  icon: Icon,
  estimate,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: Tone
  icon?: React.ComponentType<{ className?: string }>
  estimate?: boolean
  className?: string
}) {
  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span className={cn('grid h-7 w-7 place-items-center rounded-md', toneIcon[tone])}>
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular tracking-tight">{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {estimate ? <Badge variant="estimate">Estimate</Badge> : null}
        {hint}
      </div>
    </Card>
  )
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: React.ReactNode
  htmlFor?: string
  error?: string
  hint?: React.ReactNode
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  const hintId = htmlFor ? `${htmlFor}-hint` : undefined
  const errorId = htmlFor ? `${htmlFor}-error` : undefined
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
        {required ? <span className="ml-0.5 text-destructive" aria-hidden>*</span> : null}
      </label>
      {children}
      {error ? (
        <p id={errorId} className="text-[13px] text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[13px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <div role="alert" className="flex gap-2 rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

export function Notice({
  tone = 'info',
  children,
  className,
}: {
  tone?: 'info' | 'warning' | 'success'
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-sm',
        tone === 'info' && 'border-info/25 bg-info-soft text-info',
        tone === 'warning' && 'border-warning/25 bg-warning-soft text-warning',
        tone === 'success' && 'border-success/25 bg-success-soft text-success',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function DefinitionList({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2', className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5 break-words font-medium">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Search box for list toolbars. */
export function SearchInput({ value, onChange, placeholder = 'Search', className }: { value: string; onChange: (value: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative w-full sm:w-60', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input type="search" aria-label={placeholder} placeholder={placeholder} className="h-9 pl-9" value={value} onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

/** Value that settles after the user stops typing. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value)
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
