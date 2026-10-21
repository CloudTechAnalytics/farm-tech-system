-- ============================================================================
-- Release 2 · 0004 Finance integration: receivables, payables, cashbook and
-- cash surplus versus accounting profit.
--
-- Read-only over the existing ledgers. `finance_transactions` stays the only
-- record of money moving; invoices (`sales`) and `supplier_bills` add what is
-- owed. Nothing here writes, so no figure can be counted twice.
-- ============================================================================

-- What customers owe and what the farm owes, aged by days past due.
create or replace function public.finance_position(p_org uuid, p_site uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_today date := public.org_today(p_org);
  v jsonb;
begin
  if not public.has_permission(p_org, 'finance.view') then
    raise exception 'You do not have permission to view financial reports.' using errcode = '42501';
  end if;
  with
  ar as (
    select s.amount_outstanding as amt, v_today - coalesce(s.due_date, s.sale_date) as late
    from public.sale_summaries s
    where s.organization_id = p_org and s.status = 'posted' and s.amount_outstanding > 0 and (p_site is null or s.site_id = p_site)
  ),
  ap as (
    select b.amount_outstanding as amt, v_today - coalesce(b.due_date, b.bill_date) as late
    from public.supplier_bill_summaries b
    where b.organization_id = p_org and b.status = 'posted' and b.amount_outstanding > 0 and (p_site is null or b.site_id = p_site)
  ),
  cash as (
    select coalesce(t.payment_method, 'other') as method,
      sum(case when t.kind = 'income' then t.amount else -t.amount end) as balance
    from public.finance_transactions t
    where t.organization_id = p_org and (p_site is null or t.site_id = p_site)
    group by 1
  )
  select jsonb_build_object(
    'receivables', (select jsonb_build_object(
        'total', coalesce(sum(amt), 0),
        'count', count(*),
        'current', coalesce(sum(amt) filter (where late <= 0), 0),
        'd1_30', coalesce(sum(amt) filter (where late between 1 and 30), 0),
        'd31_60', coalesce(sum(amt) filter (where late between 31 and 60), 0),
        'd61_90', coalesce(sum(amt) filter (where late between 61 and 90), 0),
        'd90_plus', coalesce(sum(amt) filter (where late > 90), 0)) from ar),
    'payables', (select jsonb_build_object(
        'total', coalesce(sum(amt), 0),
        'count', count(*),
        'current', coalesce(sum(amt) filter (where late <= 0), 0),
        'd1_30', coalesce(sum(amt) filter (where late between 1 and 30), 0),
        'd31_60', coalesce(sum(amt) filter (where late between 31 and 60), 0),
        'd61_90', coalesce(sum(amt) filter (where late between 61 and 90), 0),
        'd90_plus', coalesce(sum(amt) filter (where late > 90), 0)) from ap),
    'cash_by_method', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'balance', balance) order by method) from cash), '[]'::jsonb),
    'net_recorded_cash', coalesce((select sum(balance) from cash), 0)
  ) into v;
  return v;
end;
$$;

-- Money in and out by date with a running balance. Opening is everything before p_from.
create or replace function public.report_cashbook(
  p_org uuid, p_from date, p_to date, p_site uuid default null, p_method text default null
)
returns table (
  id uuid, txn_date date, kind text, description text, counterparty text, reference text, payment_method text,
  category_name text, money_in numeric, money_out numeric, balance numeric, sale_id uuid, supplier_bill_id uuid,
  is_reversal boolean, is_opening boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_open numeric;
begin
  if not public.has_permission(p_org, 'finance.view') then
    raise exception 'You do not have permission to view financial reports.' using errcode = '42501';
  end if;
  if p_from > p_to then raise exception 'The start date must be on or before the end date.' using errcode = '22023'; end if;
  select coalesce(sum(case when t.kind = 'income' then t.amount else -t.amount end), 0) into v_open
  from public.finance_transactions t
  where t.organization_id = p_org and t.txn_date < p_from
    and (p_site is null or t.site_id = p_site) and (p_method is null or t.payment_method = p_method);

  return query
  select x.id, x.txn_date, x.kind, x.description, x.counterparty, x.reference, x.payment_method, x.category_name,
    x.money_in, x.money_out, x.balance, x.sale_id, x.supplier_bill_id, x.is_reversal, x.is_opening
  from (
    select null::uuid as id, p_from as txn_date, 'opening'::text as kind, 'Opening balance'::text as description,
      null::text as counterparty, null::text as reference, p_method as payment_method, null::text as category_name,
      null::numeric as money_in, null::numeric as money_out, v_open as balance, null::uuid as sale_id, null::uuid as supplier_bill_id,
      false as is_reversal, true as is_opening, 0::bigint as seq
    union all
    select t.id, t.txn_date, t.kind, t.description, t.counterparty, t.reference, t.payment_method, c.name,
      case when t.kind = 'income' then t.amount end,
      case when t.kind = 'expense' then t.amount end,
      v_open + sum(case when t.kind = 'income' then t.amount else -t.amount end) over (order by t.txn_date, t.created_at, t.id),
      t.sale_id, t.supplier_bill_id, t.reverses_id is not null, false,
      row_number() over (order by t.txn_date, t.created_at, t.id)
    from public.finance_transactions t
    join public.categories c on c.id = t.category_id
    where t.organization_id = p_org and t.txn_date between p_from and p_to
      and (p_site is null or t.site_id = p_site) and (p_method is null or t.payment_method = p_method)
  ) x
  order by x.seq;
end;
$$;

-- Cash operating surplus (money actually received minus money actually paid)
-- next to an accrual-basis operating profit (sales invoiced minus costs billed
-- or incurred in the period). The two differ by what is still owed either way.
create or replace function public.report_profit_comparison(p_org uuid, p_from date, p_to date, p_site uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.has_permission(p_org, 'finance.view') then
    raise exception 'You do not have permission to view financial reports.' using errcode = '42501';
  end if;
  if p_from > p_to then raise exception 'The start date must be on or before the end date.' using errcode = '22023'; end if;
  with
  t as (
    select * from public.finance_transactions
    where organization_id = p_org and txn_date between p_from and p_to and (p_site is null or site_id = p_site)
  ),
  cash as (
    select
      coalesce(sum(amount) filter (where kind = 'income'), 0) as received,
      coalesce(sum(amount) filter (where kind = 'income' and sale_id is not null), 0) as received_for_sales,
      coalesce(sum(amount) filter (where kind = 'expense'), 0) as paid,
      coalesce(sum(amount) filter (where kind = 'expense' and supplier_bill_id is not null), 0) as paid_on_bills
    from t
  ),
  invoiced as (
    select coalesce(sum(total_amount), 0) as amount from public.sale_summaries
    where organization_id = p_org and status = 'posted' and sale_date between p_from and p_to and (p_site is null or site_id = p_site)
  ),
  billed as (
    select coalesce(sum(amount), 0) as amount from public.supplier_bills
    where organization_id = p_org and status = 'posted' and bill_date between p_from and p_to and (p_site is null or site_id = p_site)
  ),
  other as (
    select
      coalesce(sum(amount) filter (where kind = 'income' and sale_id is null), 0) as other_income,
      coalesce(sum(amount) filter (where kind = 'expense' and supplier_bill_id is null), 0) as direct_expenses
    from t
  )
  select jsonb_build_object(
    'cash', jsonb_build_object(
      'money_in', cash.received, 'money_in_for_sales', cash.received_for_sales,
      'money_out', cash.paid, 'money_out_on_bills', cash.paid_on_bills,
      'surplus', cash.received - cash.paid),
    'accrual', jsonb_build_object(
      'sales_invoiced', invoiced.amount, 'other_income', other.other_income,
      'supplier_bills', billed.amount, 'direct_expenses', other.direct_expenses,
      'profit', invoiced.amount + other.other_income - billed.amount - other.direct_expenses),
    'difference', jsonb_build_object(
      'sales_not_yet_received', invoiced.amount - cash.received_for_sales,
      'bills_not_yet_paid', billed.amount - cash.paid_on_bills)
  ) into v
  from cash, invoiced, billed, other;
  return v;
end;
$$;

-- Receivables by customer, oldest debt first, for the receivables page.
create view public.receivables with (security_invoker = true) as
select
  s.id as sale_id, s.organization_id, s.site_id, s.site_name, s.invoice_number, s.sale_date, s.due_date,
  s.customer_id, s.customer_display_name, s.customer_phone, s.total_amount, s.amount_received, s.amount_outstanding, s.is_overdue,
  greatest(public.org_today(s.organization_id) - coalesce(s.due_date, s.sale_date), 0) as days_overdue
from public.sale_summaries s
where s.status = 'posted' and s.amount_outstanding > 0;

create view public.payables with (security_invoker = true) as
select
  b.id as supplier_bill_id, b.organization_id, b.site_id, b.supplier_id, b.supplier_name, b.bill_number, b.bill_date, b.due_date,
  b.po_number, b.description, b.amount, b.amount_paid, b.amount_outstanding, b.is_overdue,
  greatest(public.org_today(b.organization_id) - coalesce(b.due_date, b.bill_date), 0) as days_overdue
from public.supplier_bill_summaries b
where b.status = 'posted' and b.amount_outstanding > 0;

grant select on public.receivables, public.payables to authenticated;
revoke all on public.receivables, public.payables from anon;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.finance_position(uuid, uuid),
  public.report_cashbook(uuid, date, date, uuid, text),
  public.report_profit_comparison(uuid, date, date, uuid)
  to authenticated;
