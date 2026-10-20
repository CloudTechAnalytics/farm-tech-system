import * as React from 'react'
import { startOfMonth, startOfYear, subDays, subMonths, endOfMonth } from 'date-fns'
import { Input, Select } from '@/shared/components/ui/input'
import { toISODate } from '@/shared/lib/format'

export type PeriodPreset = '7d' | '30d' | 'this_month' | 'last_month' | '90d' | 'this_year' | 'custom'

export interface PeriodValue {
  preset: PeriodPreset
  from: string
  to: string
}

export function periodFromPreset(preset: PeriodPreset, now = new Date()): { from: string; to: string } {
  switch (preset) {
    case '7d':
      return { from: toISODate(subDays(now, 6)), to: toISODate(now) }
    case '30d':
      return { from: toISODate(subDays(now, 29)), to: toISODate(now) }
    case 'this_month':
      return { from: toISODate(startOfMonth(now)), to: toISODate(now) }
    case 'last_month': {
      const m = subMonths(now, 1)
      return { from: toISODate(startOfMonth(m)), to: toISODate(endOfMonth(m)) }
    }
    case '90d':
      return { from: toISODate(subDays(now, 89)), to: toISODate(now) }
    case 'this_year':
      return { from: toISODate(startOfYear(now)), to: toISODate(now) }
    default:
      return { from: toISODate(subDays(now, 29)), to: toISODate(now) }
  }
}

export function usePeriod(initial: PeriodPreset = '30d') {
  const [value, setValue] = React.useState<PeriodValue>(() => ({ preset: initial, ...periodFromPreset(initial) }))
  return [value, setValue] as const
}

const LABELS: Record<PeriodPreset, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  this_month: 'This month',
  last_month: 'Last month',
  '90d': 'Last 90 days',
  this_year: 'This year',
  custom: 'Custom dates',
}

export function PeriodFilter({ value, onChange }: { value: PeriodValue; onChange: (v: PeriodValue) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="period-preset" className="sr-only">
        Period
      </label>
      <div className="w-40">
        <Select
          id="period-preset"
          className="h-9"
          value={value.preset}
          onChange={(e) => {
            const preset = e.target.value as PeriodPreset
            onChange(preset === 'custom' ? { ...value, preset } : { preset, ...periodFromPreset(preset) })
          }}
        >
          {Object.entries(LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
      </div>
      {value.preset === 'custom' ? (
        <>
          <Input aria-label="From" type="date" className="h-9 w-[9.5rem]" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
          <span className="text-sm text-muted-foreground">to</span>
          <Input aria-label="To" type="date" className="h-9 w-[9.5rem]" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} />
        </>
      ) : null}
    </div>
  )
}
