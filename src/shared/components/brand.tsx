import { PRODUCT } from '@/shared/config/env'
import { cn } from '@/shared/lib/utils'

/** Sprout over two ledger lines: growth that is written down. Black and white. */
export function BrandMark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  const bg = inverted ? '#ffffff' : '#111111'
  const fg = inverted ? '#111111' : '#ffffff'
  return (
    <svg viewBox="0 0 64 64" className={cn('h-8 w-8', className)} aria-hidden>
      <rect width="64" height="64" rx="14" fill={bg} />
      <path d="M14 46h36" stroke={fg} strokeWidth="3" strokeLinecap="round" />
      <path d="M14 52h36" stroke={fg} strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 40V22" stroke={fg} strokeWidth="3" strokeLinecap="round" />
      <path d="M32 28c0-7 5-12 13-12 0 8-5 12-13 12Z" fill={fg} />
      <path d="M32 33c0-6-4-10-11-10 0 7 4 10 11 10Z" fill={fg} fillOpacity="0.7" />
    </svg>
  )
}

export function BrandLockup({ inverted = false, className }: { inverted?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <BrandMark inverted={inverted} />
      <div className="leading-tight">
        <div className={cn('text-[16px] font-semibold tracking-tight', inverted ? 'text-white' : 'text-foreground')}>{PRODUCT.name}</div>
        <div className={cn('text-[11px]', inverted ? 'text-white/60' : 'text-muted-foreground')}>by {PRODUCT.company}</div>
      </div>
    </div>
  )
}
