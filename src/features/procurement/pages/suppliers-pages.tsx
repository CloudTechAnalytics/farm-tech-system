import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Download, Pencil, Plus, Truck } from 'lucide-react'
import { useAuth, useCurrency } from '@/features/auth/context/auth-provider'
import {
  RECEIPT_STATUS,
  SUPPLIER_CATEGORIES,
  SUPPLIER_CATEGORY_LABEL,
  billStatus,
  procurementService,
  suppliersService,
  type SupplierBalance,
} from '@/features/procurement/services/procurement.service'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Checkbox, Input, Select, Textarea } from '@/shared/components/ui/input'
import { Table, TableWrap, Td, Th, Tr, Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/misc'
import { DefinitionList, EmptyState, ErrorState, Field, LoadingRows, PageHeader, QueryState, SearchInput, StatCard, useDebounced } from '@/shared/components/common'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { useSave } from '@/shared/hooks/use-record'
import { optionalText, requiredText } from '@/shared/lib/validation'
import { formatDate, formatMoney } from '@/shared/lib/format'
import { downloadCsv, toCsv } from '@/shared/lib/csv'
import { cn } from '@/shared/lib/utils'

export function SuppliersPage() {
  const { activeOrgId, has } = useAuth()
  const currency = useCurrency()
  const navigate = useNavigate()
  const [search, setSearch] = React.useState('')
  const [category, setCategory] = React.useState('')
  const [status, setStatus] = React.useState('active')
  const [owing, setOwing] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  const debounced = useDebounced(search)
  const query = useQuery({
    queryKey: ['suppliers', activeOrgId, debounced, category, status, owing],
    enabled: !!activeOrgId,
    queryFn: () => suppliersService.list(activeOrgId!, { search: debounced || undefined, category: category || undefined, status: status || undefined, owing }),
  })
  const rows = query.data ?? []
  const owed = rows.reduce((s, x) => s + x.balance_outstanding, 0)
  const overdue = rows.reduce((s, x) => s + x.overdue_amount, 0)
  const exportCsv = () =>
    downloadCsv(
      'suppliers',
      toCsv(rows, [
        { header: 'Code', value: (s) => s.code },
        { header: 'Name', value: (s) => s.name },
        { header: 'Category', value: (s) => SUPPLIER_CATEGORY_LABEL[s.category] },
        { header: 'Contact', value: (s) => s.contact_person },
        { header: 'Phone', value: (s) => s.phone },
        { header: 'Email', value: (s) => s.email },
        { header: 'City', value: (s) => s.city },
        { header: 'Payment terms (days)', value: (s) => s.payment_terms_days },
        { header: 'Status', value: (s) => s.status },
        { header: 'Open orders', value: (s) => s.open_orders },
        { header: 'Billed', value: (s) => s.total_billed },
        { header: 'Paid', value: (s) => s.total_paid },
        { header: 'We owe', value: (s) => s.balance_outstanding },
        { header: 'Overdue', value: (s) => s.overdue_amount },
      ]),
    )
  const filtered = debounced || category || owing
  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Who the farm buys from, open orders with them and what is still owed."
        actions={
          <>
            {has('reports.export') ? (
              <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
                <Download /> Export CSV
              </Button>
            ) : null}
            {has('suppliers.manage') ? (
              <Button onClick={() => setAdding(true)}>
                <Plus /> Add supplier
              </Button>
            ) : null}
          </>
        }
      />
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard tone="plain" label="Suppliers" value={rows.length} />
        <StatCard tone="money" label="We owe suppliers" value={formatMoney(owed, currency)} hint="Unpaid bills" />
        <StatCard tone="plain" label="Overdue" value={formatMoney(overdue, currency)} hint="Past the due date" />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, phone, code, city" />
        <div className="w-52">
          <Select aria-label="Category" className="h-9" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {SUPPLIER_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {SUPPLIER_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-32">
          <Select aria-label="Status" className="h-9" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="">All</option>
          </Select>
        </div>
        <Checkbox label="We owe them" checked={owing} onChange={(e) => setOwing(e.target.checked)} />
      </div>
      <Card>
        <QueryState
          query={query}
          empty={
            <EmptyState
              icon={Truck}
              title={filtered ? 'No suppliers match' : 'No suppliers yet'}
              description={filtered ? 'Try a different search or filter.' : 'Add feed mills, hatcheries, agro-dealers and service providers to raise orders and track bills.'}
              action={has('suppliers.manage') && !filtered ? <Button onClick={() => setAdding(true)}>Add a supplier</Button> : undefined}
            />
          }
        >
          {(list) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Supplier</Th>
                    <Th>Category</Th>
                    <Th>Phone</Th>
                    <Th align="right">Open orders</Th>
                    <Th align="right">We owe</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((s) => (
                    <Tr key={s.id} className={cn('cursor-pointer', s.status === 'inactive' && 'text-muted-foreground')} onClick={() => navigate(`/suppliers/${s.id}`)}>
                      <Td>
                        <Link to={`/suppliers/${s.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {s.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{[s.code, s.city].filter(Boolean).join(' · ') || ' '}</div>
                      </Td>
                      <Td>
                        {SUPPLIER_CATEGORY_LABEL[s.category]}
                        {s.status === 'inactive' ? <Badge className="ml-2">Inactive</Badge> : null}
                      </Td>
                      <Td className="whitespace-nowrap">{s.phone ?? '—'}</Td>
                      <Td align="right">{s.open_orders || '—'}</Td>
                      <Td align="right" className="font-medium">
                        {s.balance_outstanding > 0 ? formatMoney(s.balance_outstanding, currency) : '—'}
                        {s.overdue_amount > 0 ? <div className="text-xs font-normal text-destructive">{formatMoney(s.overdue_amount, currency)} overdue</div> : null}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </QueryState>
      </Card>
      <SupplierDialog open={adding} onOpenChange={setAdding} onCreated={(id) => navigate(`/suppliers/${id}`)} />
    </div>
  )
}

const supplierSchema = z.object({
  name: requiredText('The supplier name', 160).refine((v) => v.length >= 2, 'Enter at least 2 characters'),
  code: z.string().trim().regex(/^[A-Za-z0-9-]{0,20}$/, 'Letters, numbers and dashes only, up to 20').optional(),
  category: z.enum(SUPPLIER_CATEGORIES),
  contact_person: optionalText(120),
  phone: optionalText(40),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  address: optionalText(300),
  city: optionalText(80),
  bank_name: optionalText(80),
  bank_account: optionalText(40),
  payment_terms_days: z.preprocess((v) => (v === '' || v === undefined ? 0 : Number(v)), z.number().int('Whole days only').min(0).max(365, 'At most 365 days')),
  notes: optionalText(2000),
})

function SupplierDialog({ open, onOpenChange, supplier, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; supplier?: SupplierBalance; onCreated?: (id: string) => void }) {
  const { activeOrgId } = useAuth()
  const form = useForm<z.input<typeof supplierSchema>>({ resolver: zodResolver(supplierSchema) })
  React.useEffect(() => {
    if (open)
      form.reset({
        name: supplier?.name ?? '',
        code: supplier?.code ?? '',
        category: supplier?.category ?? 'feed',
        contact_person: supplier?.contact_person ?? '',
        phone: supplier?.phone ?? '',
        email: supplier?.email ?? '',
        address: supplier?.address ?? '',
        city: supplier?.city ?? '',
        bank_name: supplier?.bank_name ?? '',
        bank_account: supplier?.bank_account ?? '',
        payment_terms_days: supplier?.payment_terms_days ?? 0,
        notes: supplier?.notes ?? '',
      })
  }, [open, supplier, form])
  const mutation = useSave(
    async (v: z.output<typeof supplierSchema>) => {
      if (supplier) {
        await suppliersService.update(supplier.id, v)
        return supplier.id
      }
      return suppliersService.create(activeOrgId!, v)
    },
    {
      success: supplier ? 'Supplier saved' : 'Supplier added',
      onSuccess: (id) => {
        onOpenChange(false)
        if (!supplier) onCreated?.(id)
      },
    },
  )
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={supplier ? `Edit ${supplier.name}` : 'Add a supplier'}
      submitLabel={supplier ? 'Save' : 'Add supplier'}
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof supplierSchema>))}
    >
      <FieldRow>
        <Field label="Name" htmlFor="su-name" error={errors.name?.message} required>
          <Input id="su-name" maxLength={160} placeholder="e.g. Top Feeds Ltd" {...form.register('name')} />
        </Field>
        <Field label="Supplies" htmlFor="su-cat">
          <Select id="su-cat" {...form.register('category')}>
            {SUPPLIER_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {SUPPLIER_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Phone" htmlFor="su-phone" error={errors.phone?.message}>
          <Input id="su-phone" type="tel" maxLength={40} {...form.register('phone')} />
        </Field>
        <Field label="Email" htmlFor="su-email" error={errors.email?.message}>
          <Input id="su-email" type="email" maxLength={160} {...form.register('email')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Contact person" htmlFor="su-contact" error={errors.contact_person?.message}>
          <Input id="su-contact" maxLength={120} {...form.register('contact_person')} />
        </Field>
        <Field label="Supplier code" htmlFor="su-code" error={errors.code?.message} hint="Optional, must be unique">
          <Input id="su-code" maxLength={20} {...form.register('code')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Address" htmlFor="su-addr" error={errors.address?.message}>
          <Input id="su-addr" maxLength={300} {...form.register('address')} />
        </Field>
        <Field label="Town or city" htmlFor="su-city" error={errors.city?.message}>
          <Input id="su-city" maxLength={80} {...form.register('city')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Bank" htmlFor="su-bank" error={errors.bank_name?.message}>
          <Input id="su-bank" maxLength={80} {...form.register('bank_name')} />
        </Field>
        <Field label="Account number" htmlFor="su-acct" error={errors.bank_account?.message}>
          <Input id="su-acct" maxLength={40} inputMode="numeric" {...form.register('bank_account')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Payment terms (days)" htmlFor="su-terms" error={errors.payment_terms_days?.message} hint="Sets the due date on their bills">
          <Input id="su-terms" type="number" step="1" min={0} max={365} {...form.register('payment_terms_days')} />
        </Field>
        <Field label="Notes" htmlFor="su-notes">
          <Textarea id="su-notes" rows={1} maxLength={2000} {...form.register('notes')} />
        </Field>
      </FieldRow>
    </FormDialog>
  )
}

export function SupplierDetailPage() {
  const { id = '' } = useParams()
  const query = useQuery({ queryKey: ['supplier', id], queryFn: () => suppliersService.get(id), retry: false })
  if (query.isLoading) return <LoadingRows rows={5} />
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (!query.data) return <EmptyState title="Supplier not found" />
  return <SupplierDetail supplier={query.data} />
}

function SupplierDetail({ supplier }: { supplier: SupplierBalance }) {
  const { activeOrgId, has } = useAuth()
  const currency = useCurrency()
  const navigate = useNavigate()
  const [editing, setEditing] = React.useState(false)
  const orders = useQuery({ queryKey: ['purchase-orders', activeOrgId, 'supplier', supplier.id], queryFn: () => procurementService.orders(activeOrgId!, { supplierId: supplier.id }) })
  const bills = useQuery({ queryKey: ['supplier-bills', activeOrgId, 'supplier', supplier.id], queryFn: () => procurementService.bills(activeOrgId!, { supplierId: supplier.id }) })
  const toggle = useSave(() => suppliersService.setStatus(supplier.id, supplier.status === 'active' ? 'inactive' : 'active'), {
    success: supplier.status === 'active' ? 'Supplier marked inactive' : 'Supplier reactivated',
  })
  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/suppliers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Suppliers
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {supplier.name}
            {supplier.status === 'inactive' ? <Badge>Inactive</Badge> : null}
          </span>
        }
        description={[SUPPLIER_CATEGORY_LABEL[supplier.category], supplier.code, supplier.city].filter(Boolean).join(' · ')}
        actions={
          <>
            {has('suppliers.manage') ? (
              <>
                <Button variant="outline" onClick={() => toggle.mutate(undefined)} loading={toggle.isPending}>
                  {supplier.status === 'active' ? 'Mark inactive' : 'Reactivate'}
                </Button>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil /> Edit
                </Button>
              </>
            ) : null}
            {has('finance.record') ? (
              <Button variant="outline" asChild>
                <Link to={`/bills?new=1&supplier=${supplier.id}`}>Record bill</Link>
              </Button>
            ) : null}
            {has('procurement.approve') && supplier.status === 'active' ? (
              <Button asChild>
                <Link to={`/purchase-orders/new?supplier=${supplier.id}`}>
                  <Plus /> New purchase order
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="plain" label="Open orders" value={supplier.open_orders} />
        <StatCard tone="money" label="Billed" value={formatMoney(supplier.total_billed, currency)} hint={`${supplier.bill_count} bill${supplier.bill_count === 1 ? '' : 's'}`} />
        <StatCard tone="money" label="Paid" value={formatMoney(supplier.total_paid, currency)} />
        <StatCard
          tone="plain"
          label="We owe"
          value={formatMoney(supplier.balance_outstanding, currency)}
          hint={supplier.overdue_amount > 0 ? <span className="text-destructive">{formatMoney(supplier.overdue_amount, currency)} overdue</span> : `Terms: ${supplier.payment_terms_days} days`}
        />
      </div>
      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Purchase orders</TabsTrigger>
          <TabsTrigger value="bills">Bills</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="orders">
          <Card>
            <QueryState query={orders} empty={<EmptyState title="No purchase orders yet" />}>
              {(list) => (
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Order</Th>
                        <Th>Date</Th>
                        <Th>Site</Th>
                        <Th align="right">Value</Th>
                        <Th>Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((o) => (
                        <Tr key={o.id} className="cursor-pointer" onClick={() => navigate(`/purchase-orders/${o.id}`)}>
                          <Td className="whitespace-nowrap font-medium">{o.po_number}</Td>
                          <Td className="whitespace-nowrap">{formatDate(o.order_date)}</Td>
                          <Td>{o.site_name}</Td>
                          <Td align="right">{formatMoney(o.order_total, currency)}</Td>
                          <Td>
                            <Badge variant={RECEIPT_STATUS[o.receipt_status].variant}>{RECEIPT_STATUS[o.receipt_status].label}</Badge>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </QueryState>
          </Card>
        </TabsContent>
        <TabsContent value="bills">
          <Card>
            <QueryState query={bills} empty={<EmptyState title="No bills yet" description="Supplier invoices appear here with what has been paid." />}>
              {(list) => (
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Bill</Th>
                        <Th>Date</Th>
                        <Th>Due</Th>
                        <Th align="right">Amount</Th>
                        <Th align="right">Owed</Th>
                        <Th>Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((b) => {
                        const st = billStatus(b)
                        return (
                          <Tr key={b.id} className={cn('cursor-pointer', b.status === 'voided' && 'text-muted-foreground')} onClick={() => navigate(`/bills/${b.id}`)}>
                            <Td className="whitespace-nowrap font-medium">{b.bill_number}</Td>
                            <Td className="whitespace-nowrap">{formatDate(b.bill_date)}</Td>
                            <Td className="whitespace-nowrap">{b.due_date ? formatDate(b.due_date) : '—'}</Td>
                            <Td align="right" className={cn(b.status === 'voided' && 'line-through')}>{formatMoney(b.amount, currency)}</Td>
                            <Td align="right">{b.amount_outstanding > 0 ? formatMoney(b.amount_outstanding, currency) : '—'}</Td>
                            <Td>
                              <Badge variant={st.variant}>{st.label}</Badge>
                            </Td>
                          </Tr>
                        )
                      })}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </QueryState>
          </Card>
        </TabsContent>
        <TabsContent value="details">
          <Card>
            <CardContent className="pt-5">
              <DefinitionList
                items={[
                  { label: 'Contact person', value: supplier.contact_person },
                  { label: 'Phone', value: supplier.phone },
                  { label: 'Email', value: supplier.email },
                  { label: 'Address', value: [supplier.address, supplier.city].filter(Boolean).join(', ') || null },
                  { label: 'Bank', value: [supplier.bank_name, supplier.bank_account].filter(Boolean).join(' · ') || null },
                  { label: 'Payment terms', value: `${supplier.payment_terms_days} days` },
                  { label: 'Supplier since', value: formatDate(supplier.created_at) },
                  { label: 'Notes', value: supplier.notes },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <SupplierDialog open={editing} onOpenChange={setEditing} supplier={supplier} />
    </div>
  )
}
