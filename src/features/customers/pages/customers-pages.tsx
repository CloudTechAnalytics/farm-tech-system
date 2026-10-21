import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Download, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useAuth, useCurrency } from '@/features/auth/context/auth-provider'
import {
  CUSTOMER_CATEGORIES,
  CUSTOMER_CATEGORY_LABEL,
  customersService,
  type CustomerBalance,
  type CustomerCategory,
} from '@/features/customers/services/customers.service'
import { salesService, paymentStatus } from '@/features/sales/services/sales.service'
import { ordersService, FULFILMENT_LABEL } from '@/features/sales/services/orders.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Checkbox, Input, Select, Textarea } from '@/shared/components/ui/input'
import { Table, TableWrap, Td, Th, Tr, Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/misc'
import { DefinitionList, EmptyState, ErrorState, Field, LoadingRows, Notice, PageHeader, QueryState, SearchInput, StatCard, useDebounced } from '@/shared/components/common'
import { FormDialog, FieldRow } from '@/shared/components/form-dialog'
import { ProductSelect } from '@/shared/components/pickers'
import { useSave } from '@/shared/hooks/use-record'
import { nonNegativeNumber, optionalText, requiredId, requiredText } from '@/shared/lib/validation'
import { formatDate, formatMoney } from '@/shared/lib/format'
import { downloadCsv, toCsv } from '@/shared/lib/csv'
import { cn } from '@/shared/lib/utils'

export function CustomersPage() {
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
    queryKey: ['customers', activeOrgId, debounced, category, status, owing],
    enabled: !!activeOrgId,
    queryFn: () => customersService.list(activeOrgId!, { search: debounced || undefined, category: category || undefined, status: status || undefined, owing }),
  })
  const rows = query.data ?? []
  const owed = rows.reduce((s, c) => s + c.balance_outstanding, 0)
  const overdue = rows.reduce((s, c) => s + c.overdue_amount, 0)

  const exportCsv = () =>
    downloadCsv(
      'customers',
      toCsv(rows, [
        { header: 'Code', value: (c) => c.code },
        { header: 'Name', value: (c) => c.name },
        { header: 'Category', value: (c) => CUSTOMER_CATEGORY_LABEL[c.category] },
        { header: 'Contact', value: (c) => c.contact_person },
        { header: 'Phone', value: (c) => c.phone },
        { header: 'Email', value: (c) => c.email },
        { header: 'City', value: (c) => c.city },
        { header: 'Status', value: (c) => c.status },
        { header: 'Credit limit', value: (c) => c.credit_limit },
        { header: 'Payment terms (days)', value: (c) => c.payment_terms_days },
        { header: 'Invoices', value: (c) => c.invoice_count },
        { header: 'Invoiced', value: (c) => c.total_invoiced },
        { header: 'Received', value: (c) => c.total_received },
        { header: 'Balance owed', value: (c) => c.balance_outstanding },
        { header: 'Overdue', value: (c) => c.overdue_amount },
        { header: 'Last sale', value: (c) => c.last_sale_date },
      ]),
    )

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Who buys from the farm, what they owe, and the prices agreed with them."
        actions={
          <>
            {has('reports.export') ? (
              <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
                <Download /> Export CSV
              </Button>
            ) : null}
            {has('customers.manage') ? (
              <Button onClick={() => setAdding(true)}>
                <Plus /> Add customer
              </Button>
            ) : null}
          </>
        }
      />
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard tone="plain" label="Customers" value={rows.length} hint={status ? `${status === 'active' ? 'Active' : 'Inactive'} only` : 'All'} />
        <StatCard tone="money" label="Owed by customers" value={formatMoney(owed, currency)} hint="Unpaid invoices" />
        <StatCard tone="plain" label="Overdue" value={formatMoney(overdue, currency)} hint="Past the due date" />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, phone, code, city" />
        <div className="w-44">
          <Select aria-label="Category" className="h-9" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {CUSTOMER_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CUSTOMER_CATEGORY_LABEL[c]}
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
        <Checkbox label="Owing money" checked={owing} onChange={(e) => setOwing(e.target.checked)} />
      </div>
      <Card>
        <QueryState
          query={query}
          empty={
            <EmptyState
              icon={Users}
              title={debounced || category || owing ? 'No customers match' : 'No customers yet'}
              description={debounced || category || owing ? 'Try a different search or filter.' : 'Add the people and businesses you sell to, to track what they buy and owe.'}
              action={has('customers.manage') && !debounced ? <Button onClick={() => setAdding(true)}>Add a customer</Button> : undefined}
            />
          }
        >
          {(list) => (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Customer</Th>
                    <Th>Category</Th>
                    <Th>Phone</Th>
                    <Th align="right">Invoiced</Th>
                    <Th align="right">Owed</Th>
                    <Th>Last sale</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => (
                    <Tr key={c.id} className={cn('cursor-pointer', c.status === 'inactive' && 'text-muted-foreground')} onClick={() => navigate(`/customers/${c.id}`)}>
                      <Td>
                        <Link to={`/customers/${c.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {c.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {[c.code, c.city].filter(Boolean).join(' · ') || ' '}
                        </div>
                      </Td>
                      <Td>
                        {CUSTOMER_CATEGORY_LABEL[c.category]}
                        {c.status === 'inactive' ? <Badge className="ml-2">Inactive</Badge> : null}
                      </Td>
                      <Td className="whitespace-nowrap">{c.phone ?? '—'}</Td>
                      <Td align="right">{formatMoney(c.total_invoiced, currency)}</Td>
                      <Td align="right" className="font-medium">
                        {c.balance_outstanding > 0 ? formatMoney(c.balance_outstanding, currency) : '—'}
                        {c.overdue_amount > 0 ? <div className="text-xs font-normal text-destructive">{formatMoney(c.overdue_amount, currency)} overdue</div> : null}
                      </Td>
                      <Td className="whitespace-nowrap">{c.last_sale_date ? formatDate(c.last_sale_date) : '—'}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </QueryState>
      </Card>
      <CustomerDialog open={adding} onOpenChange={setAdding} onCreated={(id) => navigate(`/customers/${id}`)} />
    </div>
  )
}

const customerSchema = z.object({
  name: requiredText('The customer name', 160).refine((v) => v.length >= 2, 'Enter at least 2 characters'),
  code: z.string().trim().regex(/^[A-Za-z0-9-]{0,20}$/, 'Letters, numbers and dashes only, up to 20').optional(),
  category: z.enum(CUSTOMER_CATEGORIES),
  contact_person: optionalText(120),
  phone: optionalText(40),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  address: optionalText(300),
  city: optionalText(80),
  credit_limit: nonNegativeNumber('Credit limit'),
  payment_terms_days: z.preprocess((v) => (v === '' || v === undefined ? 0 : Number(v)), z.number().int('Whole days only').min(0).max(365, 'At most 365 days')),
  notes: optionalText(2000),
})

export function CustomerDialog({ open, onOpenChange, customer, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; customer?: CustomerBalance; onCreated?: (id: string) => void }) {
  const { activeOrgId } = useAuth()
  const form = useForm<z.input<typeof customerSchema>>({ resolver: zodResolver(customerSchema) })
  React.useEffect(() => {
    if (open)
      form.reset({
        name: customer?.name ?? '',
        code: customer?.code ?? '',
        category: customer?.category ?? 'individual',
        contact_person: customer?.contact_person ?? '',
        phone: customer?.phone ?? '',
        email: customer?.email ?? '',
        address: customer?.address ?? '',
        city: customer?.city ?? '',
        credit_limit: customer?.credit_limit ?? undefined,
        payment_terms_days: customer?.payment_terms_days ?? 0,
        notes: customer?.notes ?? '',
      })
  }, [open, customer, form])
  const mutation = useSave(
    async (v: z.output<typeof customerSchema>) => {
      const values = { ...v, category: v.category as CustomerCategory, credit_limit: v.credit_limit ?? null }
      if (customer) {
        await customersService.update(customer.id, values)
        return customer.id
      }
      return customersService.create(activeOrgId!, values)
    },
    {
      success: customer ? 'Customer saved' : 'Customer added',
      onSuccess: (id) => {
        onOpenChange(false)
        if (!customer) onCreated?.(id)
      },
    },
  )
  const { errors } = form.formState
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={customer ? `Edit ${customer.name}` : 'Add a customer'}
      submitLabel={customer ? 'Save' : 'Add customer'}
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as z.output<typeof customerSchema>))}
    >
      <FieldRow>
        <Field label="Name" htmlFor="cu-name" error={errors.name?.message} required>
          <Input id="cu-name" maxLength={160} placeholder="e.g. Mama Nkechi Stores" {...form.register('name')} />
        </Field>
        <Field label="Category" htmlFor="cu-cat">
          <Select id="cu-cat" {...form.register('category')}>
            {CUSTOMER_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CUSTOMER_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Phone" htmlFor="cu-phone" error={errors.phone?.message}>
          <Input id="cu-phone" type="tel" maxLength={40} {...form.register('phone')} />
        </Field>
        <Field label="Email" htmlFor="cu-email" error={errors.email?.message}>
          <Input id="cu-email" type="email" maxLength={160} {...form.register('email')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Contact person" htmlFor="cu-contact" error={errors.contact_person?.message}>
          <Input id="cu-contact" maxLength={120} {...form.register('contact_person')} />
        </Field>
        <Field label="Customer code" htmlFor="cu-code" error={errors.code?.message} hint="Optional, must be unique">
          <Input id="cu-code" maxLength={20} {...form.register('code')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Address" htmlFor="cu-addr" error={errors.address?.message}>
          <Input id="cu-addr" maxLength={300} {...form.register('address')} />
        </Field>
        <Field label="Town or city" htmlFor="cu-city" error={errors.city?.message}>
          <Input id="cu-city" maxLength={80} {...form.register('city')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Credit limit" htmlFor="cu-limit" error={errors.credit_limit?.message} hint="Leave blank for no limit. 0 means cash only.">
          <Input id="cu-limit" type="number" step="0.01" min={0} {...form.register('credit_limit')} />
        </Field>
        <Field label="Payment terms (days)" htmlFor="cu-terms" error={errors.payment_terms_days?.message} hint="Sets the due date on invoices">
          <Input id="cu-terms" type="number" step="1" min={0} max={365} {...form.register('payment_terms_days')} />
        </Field>
      </FieldRow>
      <Field label="Notes" htmlFor="cu-notes">
        <Textarea id="cu-notes" rows={2} maxLength={2000} {...form.register('notes')} />
      </Field>
    </FormDialog>
  )
}

// ---------------------------------------------------------------------------
// Customer detail
// ---------------------------------------------------------------------------
export function CustomerDetailPage() {
  const { id = '' } = useParams()
  const query = useQuery({ queryKey: ['customer', id], queryFn: () => customersService.get(id), retry: false })
  if (query.isLoading) return <LoadingRows rows={5} />
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (!query.data) return <EmptyState title="Customer not found" />
  return <CustomerDetail customer={query.data} />
}

function CustomerDetail({ customer }: { customer: CustomerBalance }) {
  const { activeOrgId, has } = useAuth()
  const currency = useCurrency()
  const navigate = useNavigate()
  const [editing, setEditing] = React.useState(false)
  const invoices = useQuery({ queryKey: ['sales', activeOrgId, 'customer', customer.id], queryFn: () => salesService.list(activeOrgId!, { customerId: customer.id }) })
  const orders = useQuery({ queryKey: ['sales-orders', activeOrgId, 'customer', customer.id], queryFn: () => ordersService.list(activeOrgId!, { customerId: customer.id }) })
  const toggle = useSave(() => customersService.setStatus(customer.id, customer.status === 'active' ? 'inactive' : 'active'), {
    success: customer.status === 'active' ? 'Customer marked inactive' : 'Customer reactivated',
  })
  const headroom = customer.credit_limit === null ? null : customer.credit_limit - customer.balance_outstanding

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Customers
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {customer.name}
            {customer.status === 'inactive' ? <Badge>Inactive</Badge> : null}
          </span>
        }
        description={[CUSTOMER_CATEGORY_LABEL[customer.category], customer.code, customer.city].filter(Boolean).join(' · ')}
        actions={
          <>
            {has('customers.manage') ? (
              <>
                <Button variant="outline" onClick={() => toggle.mutate(undefined)} loading={toggle.isPending}>
                  {customer.status === 'active' ? 'Mark inactive' : 'Reactivate'}
                </Button>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil /> Edit
                </Button>
              </>
            ) : null}
            {has('sales.record') && customer.status === 'active' ? (
              <>
                <Button variant="outline" asChild>
                  <Link to={`/orders/new?customer=${customer.id}`}>New order</Link>
                </Button>
                <Button asChild>
                  <Link to={`/sales/new?customer=${customer.id}`}>
                    <Plus /> New invoice
                  </Link>
                </Button>
              </>
            ) : null}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="money" label="Invoiced" value={formatMoney(customer.total_invoiced, currency)} hint={`${customer.invoice_count} invoice${customer.invoice_count === 1 ? '' : 's'}`} />
        <StatCard tone="money" label="Paid" value={formatMoney(customer.total_received, currency)} />
        <StatCard tone="plain" label="Owed" value={formatMoney(customer.balance_outstanding, currency)} hint={customer.overdue_amount > 0 ? <span className="text-destructive">{formatMoney(customer.overdue_amount, currency)} overdue</span> : 'Nothing overdue'} />
        <StatCard
          tone="plain"
          label="Credit available"
          value={headroom === null ? 'No limit' : formatMoney(Math.max(0, headroom), currency)}
          hint={customer.credit_limit === null ? `Terms: ${customer.payment_terms_days} days` : `Limit ${formatMoney(customer.credit_limit, currency)} · ${customer.payment_terms_days} days`}
        />
      </div>
      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="prices">Prices</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices">
          <Card>
            <QueryState query={invoices} empty={<EmptyState title="No invoices yet" description="Sales to this customer appear here with what has been paid." />}>
              {(list) => (
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Invoice</Th>
                        <Th>Date</Th>
                        <Th>Due</Th>
                        <Th align="right">Total</Th>
                        <Th align="right">Owed</Th>
                        <Th>Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((s) => {
                        const st = paymentStatus(s)
                        return (
                          <Tr key={s.id} className={cn('cursor-pointer', s.status === 'voided' && 'text-muted-foreground')} onClick={() => navigate(`/sales/${s.id}`)}>
                            <Td className="whitespace-nowrap font-medium">{s.invoice_number}</Td>
                            <Td className="whitespace-nowrap">{formatDate(s.sale_date)}</Td>
                            <Td className="whitespace-nowrap">{s.due_date ? formatDate(s.due_date) : '—'}</Td>
                            <Td align="right" className={cn(s.status === 'voided' && 'line-through')}>
                              {formatMoney(s.total_amount, currency)}
                            </Td>
                            <Td align="right">{s.amount_outstanding > 0 ? formatMoney(s.amount_outstanding, currency) : '—'}</Td>
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
        <TabsContent value="orders">
          <Card>
            <QueryState query={orders} empty={<EmptyState title="No orders yet" description="Orders taken now and delivered later appear here." />}>
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
                        <Tr key={o.id} className="cursor-pointer" onClick={() => navigate(`/orders/${o.id}`)}>
                          <Td className="whitespace-nowrap font-medium">{o.order_number}</Td>
                          <Td className="whitespace-nowrap">{formatDate(o.order_date)}</Td>
                          <Td>{o.site_name}</Td>
                          <Td align="right">{formatMoney(o.order_total, currency)}</Td>
                          <Td>
                            <Badge variant={FULFILMENT_LABEL[o.fulfilment_status].variant}>{FULFILMENT_LABEL[o.fulfilment_status].label}</Badge>
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
        <TabsContent value="prices">
          <CustomerPrices customerId={customer.id} />
        </TabsContent>
        <TabsContent value="details">
          <Card>
            <CardContent className="pt-5">
              <DefinitionList
                items={[
                  { label: 'Contact person', value: customer.contact_person },
                  { label: 'Phone', value: customer.phone },
                  { label: 'Email', value: customer.email },
                  { label: 'Address', value: [customer.address, customer.city].filter(Boolean).join(', ') || null },
                  { label: 'Payment terms', value: `${customer.payment_terms_days} days` },
                  { label: 'Credit limit', value: customer.credit_limit === null ? 'No limit' : formatMoney(customer.credit_limit, currency) },
                  { label: 'Customer since', value: formatDate(customer.created_at) },
                  { label: 'Notes', value: customer.notes },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <CustomerDialog open={editing} onOpenChange={setEditing} customer={customer} />
    </div>
  )
}

const priceSchema = z.object({
  product_id: requiredId('a product'),
  unit_price: z.preprocess((v) => (v === '' ? undefined : Number(v)), z.number({ required_error: 'Enter the price', invalid_type_error: 'Enter the price' }).min(0, 'Price cannot be negative').max(1e12)),
})

function CustomerPrices({ customerId }: { customerId: string }) {
  const { activeOrgId, has } = useAuth()
  const currency = useCurrency()
  const [adding, setAdding] = React.useState(false)
  const query = useQuery({ queryKey: ['customer-prices', customerId], queryFn: () => customersService.prices(customerId) })
  const form = useForm<z.input<typeof priceSchema>>({ resolver: zodResolver(priceSchema) })
  React.useEffect(() => {
    if (adding) form.reset({ product_id: '', unit_price: '' as unknown as number })
  }, [adding, form])
  const save = useSave((v: z.output<typeof priceSchema>) => customersService.setPrice(activeOrgId!, customerId, v.product_id, v.unit_price), {
    success: 'Price saved',
    onSuccess: () => setAdding(false),
  })
  const remove = useSave((id: string) => customersService.removePrice(id), { success: 'Price removed' })
  const canEdit = has('customers.manage')
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Agreed prices</CardTitle>
        {canEdit ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus /> Set a price
          </Button>
        ) : null}
      </CardHeader>
      <QueryState query={query} empty={<CardContent><Notice>This customer pays the standard product prices. Set a price here to use it on their orders.</Notice></CardContent>}>
        {(list) => (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th align="right">Price</Th>
                  {canEdit ? <Th className="w-12" /> : null}
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <Tr key={p.id}>
                    <Td>{p.product?.name}</Td>
                    <Td align="right" className="font-medium">
                      {formatMoney(p.unit_price, currency)}
                      {p.product?.unit ? <span className="font-normal text-muted-foreground"> / {p.product.unit.symbol}</span> : null}
                    </Td>
                    {canEdit ? (
                      <Td align="right">
                        <Button variant="ghost" size="icon" aria-label={`Remove price for ${p.product?.name}`} onClick={() => remove.mutate(p.id)} disabled={remove.isPending}>
                          <Trash2 />
                        </Button>
                      </Td>
                    ) : null}
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </QueryState>
      <FormDialog
        open={adding}
        onOpenChange={setAdding}
        title="Set a customer price"
        description="Replaces the product's standard price on this customer's new orders."
        submitLabel="Save price"
        size="sm"
        pending={save.isPending}
        error={save.error}
        onSubmit={form.handleSubmit((v) => save.mutate(v as z.output<typeof priceSchema>))}
      >
        <Field label="Product" htmlFor="cp-product" error={form.formState.errors.product_id?.message} required>
          <Controller control={form.control} name="product_id" render={({ field }) => <ProductSelect id="cp-product" value={field.value} onChange={field.onChange} />} />
        </Field>
        <Field label={`Price per unit (${currency})`} htmlFor="cp-price" error={form.formState.errors.unit_price?.message} required>
          <Input id="cp-price" type="number" step="0.01" min={0} {...form.register('unit_price')} />
        </Field>
      </FormDialog>
    </Card>
  )
}
