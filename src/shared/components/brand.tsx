import { PRODUCT } from '@/shared/config/env'
import { cn } from '@/shared/lib/utils'

/** Brand green tile with a geometric white "H", in the same family as The Counsel's mark. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={cn('h-9 w-9 shrink-0', className)} aria-hidden>
      <rect width="120" height="120" rx="28" fill="#23845a" />
      <path
        fill="#ffffff"
        d="M 36 30 H 52 V 52 H 68 V 30 H 84 V 90 H 68 V 66 H 52 V 90 H 36 Z"
      />
    </svg>
  )
}

/** Mark plus the serif wordmark, e.g. "The Harvest". */
export function BrandLockup({ inverted = false, className }: { inverted?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <BrandMark />
      <span className={cn('font-brand text-[19px] font-semibold leading-none tracking-tight', inverted ? 'text-white' : 'text-foreground')}>
        {PRODUCT.name}
      </span>
    </div>
  )
}
