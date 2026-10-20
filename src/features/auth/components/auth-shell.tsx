import * as React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PRODUCT } from '@/shared/config/env'

/**
 * A single centred card on the grey page background: sign-in, sign-up,
 * password reset and invitations. The arrow beside the title goes back to
 * the landing page.
 */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-background px-4 py-10">
      <div className="flex w-full flex-1 items-center justify-center py-10">
        <div className="w-full max-w-[420px] rounded-xl border bg-surface p-6 shadow-card sm:p-8">
          <div className="flex items-center gap-2">
            <Link
              to="/"
              aria-label="Back to home"
              className="-ml-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-semibold">{title}</h1>
          </div>
          {subtitle ? <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {PRODUCT.name} is a product of {PRODUCT.company}.
      </p>
    </div>
  )
}
