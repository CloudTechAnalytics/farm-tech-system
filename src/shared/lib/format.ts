import { format, parseISO } from 'date-fns'

const moneyFormatters = new Map<string, Intl.NumberFormat>()

/** Format an amount in the organization's currency, e.g. ₦12,500.00. */
export function formatMoney(amount: number | null | undefined, currency = 'NGN', opts: { compact?: boolean } = {}): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—'
  const key = `${currency}:${opts.compact ? 'c' : 'f'}`
  let f = moneyFormatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat(currency === 'NGN' ? 'en-NG' : 'en', {
      style: 'currency',
      currency,
      notation: opts.compact ? 'compact' : 'standard',
      minimumFractionDigits: opts.compact ? 0 : 2,
      maximumFractionDigits: opts.compact ? 1 : 2,
    })
    moneyFormatters.set(key, f)
  }
  return f.format(amount)
}

export function formatNumber(value: number | null | undefined, maxDecimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en', { maximumFractionDigits: maxDecimals }).format(value)
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${Number(value).toFixed(decimals)}%`
}

export function formatDate(value: string | Date | null | undefined, pattern = 'd MMM yyyy'): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? parseISO(value) : value
  return Number.isNaN(d.getTime()) ? '—' : format(d, pattern)
}

export function formatDateTime(value: string | null | undefined): string {
  return formatDate(value, 'd MMM yyyy, HH:mm')
}

/** yyyy-MM-dd for <input type="date"> and Postgres date columns. */
export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
