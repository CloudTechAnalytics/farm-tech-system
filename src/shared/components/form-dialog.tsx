import * as React from 'react'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { FormError } from '@/shared/components/common'
import { friendlyError } from '@/shared/lib/errors'

/**
 * Standard form dialog: title, scrollable body, sticky footer, server error
 * shown inline (the form keeps its values so the user can fix and retry).
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  onSubmit,
  pending,
  error,
  size = 'md',
  children,
  footerExtra,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  submitLabel: string
  onSubmit: (e: React.FormEvent) => void
  pending?: boolean
  error?: unknown
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
  footerExtra?: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent size={size} onInteractOutside={(e) => pending && e.preventDefault()}>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <DialogBody className="space-y-4">
            {children}
            {error ? <FormError message={friendlyError(error)} /> : null}
          </DialogBody>
          <DialogFooter>
            {footerExtra ? <div className="mr-auto self-center text-sm text-muted-foreground">{footerExtra}</div> : null}
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Two fields side by side from small screens up. */
export function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
}
