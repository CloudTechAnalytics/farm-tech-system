import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Paperclip, Trash2, Upload } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { toast } from '@/shared/components/ui/misc'
import { FormError, LoadingRows } from '@/shared/components/common'
import { friendlyError } from '@/shared/lib/errors'
import { formatDateTime } from '@/shared/lib/format'

export type AttachmentEntity = 'activity_log' | 'finance_transaction' | 'inventory_movement' | 'production_record' | 'sale' | 'batch' | 'crop_cycle'

interface AttachmentRow {
  id: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  created_at: string
  uploaded_by: string | null
}

const BUCKET = 'attachments'
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']

const attachmentsService = {
  async list(entityType: AttachmentEntity, entityId: string): Promise<AttachmentRow[]> {
    const { data, error } = await supabase
      .from('attachments')
      .select('id, storage_path, file_name, mime_type, size_bytes, created_at, uploaded_by')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at')
    if (error) throw error
    return (data ?? []) as AttachmentRow[]
  },

  async upload(orgId: string, siteId: string, entityType: AttachmentEntity, entityId: string, file: File) {
    if (!ALLOWED.includes(file.type)) throw new Error('Attach a photo (JPG, PNG, WebP, HEIC) or a PDF.')
    if (file.size > MAX_BYTES) throw new Error('Files must be 10 MB or smaller.')
    const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-100)
    const path = `${orgId}/${siteId}/${crypto.randomUUID()}-${safeName}`
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
    if (up.error) throw up.error
    const { error } = await supabase.from('attachments').insert({
      organization_id: orgId,
      site_id: siteId,
      entity_type: entityType,
      entity_id: entityId,
      storage_path: path,
      file_name: file.name.slice(0, 200),
      mime_type: file.type,
      size_bytes: file.size,
    })
    if (error) {
      // Do not leave an orphaned file if the record could not be saved.
      await supabase.storage.from(BUCKET).remove([path])
      throw error
    }
  },

  async open(path: string) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60)
    if (error) throw error
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  },

  async remove(row: AttachmentRow) {
    const { error } = await supabase.from('attachments').delete().eq('id', row.id)
    if (error) throw error
    await supabase.storage.from(BUCKET).remove([row.storage_path])
  },
}

export function AttachmentsButton({ entityType, entityId, siteId }: { entityType: AttachmentEntity; entityId: string; siteId: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Attachments" onClick={() => setOpen(true)}>
        <Paperclip />
      </Button>
      {open ? <AttachmentsDialog open={open} onOpenChange={setOpen} entityType={entityType} entityId={entityId} siteId={siteId} /> : null}
    </>
  )
}

export function AttachmentsDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  siteId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  entityType: AttachmentEntity
  entityId: string
  siteId: string
}) {
  const { activeOrgId, userId, has } = useAuth()
  const qc = useQueryClient()
  const key = ['attachments', entityType, entityId]
  const query = useQuery({ queryKey: key, enabled: open, queryFn: () => attachmentsService.list(entityType, entityId) })
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setError(null)
    try {
      for (const f of Array.from(files)) await attachmentsService.upload(activeOrgId!, siteId, entityType, entityId, f)
      toast.success(files.length === 1 ? 'File attached' : `${files.length} files attached`)
      await qc.invalidateQueries({ queryKey: key })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Attachments</DialogTitle>
          <DialogDescription>Receipts, invoices and photos. Files are private to people who can see this record.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {query.isLoading ? <LoadingRows rows={2} /> : null}
          {query.data?.length === 0 ? <p className="text-sm text-muted-foreground">No files attached yet.</p> : null}
          <ul className="divide-y rounded-md border">
            {query.data?.map((a) => (
              <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <button type="button" className="min-w-0 flex-1 truncate text-left text-brand hover:underline" onClick={() => attachmentsService.open(a.storage_path).catch((e) => setError(friendlyError(e)))}>
                  {a.file_name}
                </button>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(a.created_at)}</span>
                {a.uploaded_by === userId || has('settings.manage') ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${a.file_name}`}
                    onClick={async () => {
                      try {
                        await attachmentsService.remove(a)
                        await qc.invalidateQueries({ queryKey: key })
                      } catch (e) {
                        setError(friendlyError(e))
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          <FormError message={error} />
          <input ref={input} type="file" accept={ALLOWED.join(',')} multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} />
          <Button variant="outline" className="w-full" onClick={() => input.current?.click()} loading={busy}>
            <Upload /> Attach photo or PDF
          </Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
