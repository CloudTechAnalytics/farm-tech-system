import * as React from 'react'
import { cn } from '@/shared/lib/utils'

export interface BarSeries {
  key: string
  label: string
  /** CSS color, e.g. 'hsl(var(--poultry))'. Identity only; text never uses it. */
  color: string
}

export interface BarDatum {
  label: string
  /** Full label for the tooltip, e.g. a full date. */
  title?: string
  values: Record<string, number>
}

function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

/**
 * Grouped vertical bars on one axis. Thin marks with rounded data-ends on the
 * baseline, a 2px gap between neighbours, recessive grid, hover tooltip per
 * group, and a screen-reader table with the same numbers.
 */
export function BarChart({
  data,
  series,
  height = 180,
  format = (v) => v.toLocaleString(),
  className,
  ariaLabel,
  labelEvery,
}: {
  data: BarDatum[]
  series: BarSeries[]
  height?: number
  format?: (v: number) => string
  className?: string
  ariaLabel: string
  labelEvery?: number
}) {
  const [hover, setHover] = React.useState<number | null>(null)
  const ref = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState(0)
  React.useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver((e) => setWidth(Math.max(200, Math.floor(e[0].contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])

  const padL = 44
  const padB = 22
  const padT = 8
  const plotW = width - padL - 4
  const plotH = height - padB - padT
  const max = niceMax(Math.max(0, ...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0))))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)
  const slot = data.length ? plotW / data.length : plotW
  const gap = 2
  const groupW = Math.min(slot * 0.72, series.length * 22)
  const barW = Math.max(2, (groupW - gap * (series.length - 1)) / series.length)
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(plotW / 56))))
  const y = (v: number) => padT + plotH - (v / max) * plotH

  return (
    <div className={cn('relative w-full min-w-0', className)} ref={ref}>
      {series.length > 1 ? (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}
      {width > 0 ? (
      <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block max-w-full" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - 4} y1={y(t)} y2={y(t)} stroke="hsl(var(--border))" strokeDasharray={t === 0 ? undefined : '2 4'} />
            <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular">
              {format(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x0 = padL + i * slot + (slot - groupW) / 2
          return (
            <g key={i}>
              {hover === i ? <rect x={padL + i * slot} y={padT} width={slot} height={plotH} fill="hsl(var(--muted))" opacity={0.6} /> : null}
              {series.map((s, j) => {
                const v = d.values[s.key] ?? 0
                if (v <= 0) return null
                const h = Math.max(1, (v / max) * plotH)
                const x = x0 + j * (barW + gap)
                const r = Math.min(4, barW / 2, h)
                // Rounded top only; the bar sits flat on the baseline.
                const path = `M${x},${padT + plotH} V${padT + plotH - h + r} Q${x},${padT + plotH - h} ${x + r},${padT + plotH - h} H${x + barW - r} Q${x + barW},${padT + plotH - h} ${x + barW},${padT + plotH - h + r} V${padT + plotH} Z`
                return <path key={s.key} d={path} fill={s.color} />
              })}
              {i % every === 0 ? (
                <text x={padL + i * slot + slot / 2} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                  {d.label}
                </text>
              ) : null}
              {/* Hit target: the whole column, larger than the mark. */}
              <rect x={padL + i * slot} y={padT} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} />
            </g>
          )
        })}
      </svg>
      ) : (
        <div style={{ height }} aria-hidden />
      )}
      {hover !== null && data[hover] ? (
        <div
          className="pointer-events-none absolute z-10 min-w-[8rem] rounded-md border bg-surface px-3 py-2 text-xs shadow-raised"
          style={{
            left: Math.min(width - 150, Math.max(0, padL + hover * slot + slot / 2 - 60)),
            top: series.length > 1 ? 28 : 4,
          }}
        >
          <div className="mb-1 font-medium">{data[hover].title ?? data[hover].label}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-medium tabular text-foreground">{format(data[hover].values[s.key] ?? 0)}</span>
            </div>
          ))}
        </div>
      ) : null}
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th>Period</th>
            {series.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <td>{d.title ?? d.label}</td>
              {series.map((s) => (
                <td key={s.key}>{format(d.values[s.key] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
