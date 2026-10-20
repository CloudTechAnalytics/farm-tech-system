import * as React from 'react'
import { Link } from 'react-router-dom'
import { MoreHorizontal, Receipt } from 'lucide-react'
import { useAuth, useCurrency } from '@/features/auth/context/auth-provider'
import { financeService, PAYMENT_LABEL, type FinanceTransaction } from '@/features/finance/services/finance.service'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Table, TableWrap, Td, Th, Tr } from '@/shared/components/ui/misc'
import { EmptyState } from '@/shared/components/common'
import { ReasonDialog } from '@/shared/components/reason-dialog'
import { useRecord } from '@/shared/hooks/use-record'
import { formatDate, formatMoney } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { AttachmentsButton } from '@/features/attachments/components/attachments'

export function TransactionsTable({ rows, emptyText = 'No transactions' }: { rows: FinanceTransaction[]; emptyText?: string }) {
  const currency = useCurrency()
  const { has } = useAuth()
  const [reversing, setReversing] = React.useState<FinanceTransaction | null>(null)
  const reverse = useRecord((key, v: { id: string; reason: string }) => financeService.reverse(key, v.id, v.reason), { success: 'Transaction reversed' })

  if (!rows.length) return <EmptyState icon={Receipt} title={emptyText} />
  return (
    <>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Description</Th>
              <Th>Category</Th>
              <Th>Site · link</Th>
              <Th>Paid by</Th>
              <Th align="right">Amount</Th>
              <Th className="w-10">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const isReversal = !!t.reverses_id
              return (
                <Tr key={t.id} className={cn((t.status === 'reversed' || isReversal) && 'text-muted-foreground')}>
                  <Td className="whitespace-nowrap">{formatDate(t.txn_date)}</Td>
                  <Td>
                    <span className={cn(t.status === 'reversed' && 'line-through')}>{t.description}</span>
                    <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                      {t.counterparty ? <span>{t.counterparty}</span> : null}
                      {t.reference ? <span>· Ref {t.reference}</span> : null}
                      {t.status === 'reversed' ? <Badge variant="outline">Reversed</Badge> : null}
                      {isReversal ? <Badge variant="outline">Reversal: {t.reversal_reason}</Badge> : null}
                      {t.sale_id ? (
                        <Link to={`/sales/${t.sale_id}`} className="text-brand hover:underline">
                          View sale
                        </Link>
                      ) : null}
                    </div>
                  </Td>
                  <Td>
                    <Badge variant={t.kind === 'income' ? 'success' : 'neutral'}>{t.category?.name}</Badge>
                  </Td>
                  <Td>
                    {t.site?.name ?? 'Organization-wide'}
                    <div className="text-xs text-muted-foreground">{t.batch?.code ?? t.crop_cycle?.code ?? ''}</div>
                  </Td>
                  <Td>{t.payment_method ? PAYMENT_LABEL[t.payment_method] : '—'}</Td>
                  <Td align="right" className={cn('whitespace-nowrap font-medium', t.kind === 'income' && t.amount > 0 && 'text-success')}>
                    {t.kind === 'expense' ? '−' : '+'}
                    {formatMoney(Math.abs(t.amount), currency)}
                    {t.amount < 0 ? <div className="text-xs font-normal">(cancels)</div> : null}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-0.5">
                      {t.site_id ? <AttachmentsButton entityType="finance_transaction" entityId={t.id} siteId={t.site_id} /> : null}
                      {has('finance.reverse') && t.status === 'posted' && !isReversal && !t.sale_id ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Transaction actions">
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem destructive onSelect={() => setReversing(t)}>
                              Reverse transaction
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              )
            })}
          </tbody>
        </Table>
      </TableWrap>
      <ReasonDialog
        open={!!reversing}
        onOpenChange={(o) => !o && setReversing(null)}
        title="Reverse this transaction?"
        description={reversing ? `A reversing entry of ${formatMoney(reversing.amount, currency)} is added today. The original stays in the history.` : ''}
        confirmLabel="Reverse"
        onConfirm={(reason) => reverse.mutateAsync({ id: reversing!.id, reason })}
      />
    </>
  )
}
