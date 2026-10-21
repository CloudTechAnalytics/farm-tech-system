# Expansion: audit, integration plan and what was built (release 2)

## 1. Audit of the current application (before this expansion)

Live local database, all migrations `20261020000001`–`07` applied:

- **36 tables, all with RLS enabled**, 6 `security_invoker` views, 68 RPC functions, 18 permission keys.
- **Tenancy:** organizations → farm_sites → memberships (all sites or listed sites) → per-org roles and permissions.
- **Ledgers (source of truth):** `batch_events` (population), `inventory_movements` (stock), `feed_events` (feed at batch), `production_records` + `production_disposals` (produce), `sales` + `sale_lines` (sale value), `finance_transactions` (cash in and out). All writes go through idempotent RPCs.
- **Existing sales:** a sale is recorded and fulfilled in one step (`record_sale`). It deducts produce or livestock immediately and records only the money received as income; the rest shows as owed. The customer is free text.
- **Existing tasks:** `planned_activities` (title, due date, status), shown in the daily log and in alerts.
- **Frontend features:** dashboard, daily log, poultry, fish, crops, production, inventory, sales, finance, reports, alerts, sites, administration, account.

## 2. What is extended, not duplicated

| Requirement | Existing structure reused | New structure |
|---|---|---|
| Invoices | `sales` becomes the invoice: adds `customer_id`, `invoice_number`, `due_date`, `sales_order_id` | none |
| Invoice payments, receipts | `record_sale_payment` and `finance_transactions` (income linked to the sale) | none |
| Product deduction | `production_disposals` (produce) and `batch_events` (live animals), written once per fulfilment | none |
| Customers | none | `customers`, `customer_prices` |
| Products | produce from `production_records`, live animals from `batches` | `products` catalog matched to produce or species |
| Sales orders | fulfilment creates a `sales` invoice through the same internal function as a direct sale | `sales_orders`, `sales_order_lines` |
| Goods receiving | `inventory_movements` (`purchase`, with unit cost and reference) | `goods_receipts`, `goods_receipt_lines` |
| Supplier payments | `finance_transactions` (expense linked to the bill and supplier) | `suppliers`, `purchase_requests`(+lines), `purchase_orders`(+lines), `supplier_bills` |
| Tasks | `planned_activities` extended: assignee, priority, in-progress and review states, repeat, link to the activity log | none |
| Workers | `memberships` for people who sign in | `employees` (people with or without accounts), `employee_sites` |
| Treatment stock use | `inventory_movements` (`consumption` linked to a batch or crop cycle) | `health_records` |
| Maintenance expense | `finance_transactions` (expense, category repairs) | `assets`, `maintenance_plans`, `maintenance_records` |

## 3. Source of truth (additions)

| Figure | Calculated from |
|---|---|
| Product available to sell | Produce: sum of `available_quantity` of matching posted production records on the site, converted to the product unit. Live animals: sum of `current_population` of active matching batches. Other products: not stock-tracked. |
| Ordered, fulfilled and remaining on an order line | ordered = line quantity; fulfilled = sum of `sale_lines` on posted (not voided) invoices linked to the line |
| Customer balance | sum of posted invoice totals − sum of income linked to those invoices |
| Received on a PO line | sum of `goods_receipt_lines` |
| Supplier balance | sum of open bill amounts − sum of expense payments linked to those bills (net of reversals) |
| Cashbook | posted `finance_transactions` by date, with a running balance per payment method |

## 4. Integration rules

1. **A sale deducts quantity exactly once, when it is fulfilled.** A sales order reserves nothing. Fulfilment creates one invoice (`sales`) inside one transaction, idempotent on the submission key, with disposals or batch events. Voiding the invoice reverses them.
2. **Income is recognised when money is received** (cash basis), never when an invoice is raised. Unpaid invoices are receivables.
3. **Goods received through a PO enter stock at the PO price** and record **no expense**. The expense is recorded when the supplier bill is paid, so it can never be counted twice.
4. **Payments cannot exceed the balance** of the invoice or bill. Duplicate supplier bill numbers per supplier are rejected.
5. **Credit limits:** an invoice that would take a customer over their credit limit is refused.
6. **Withdrawal periods:** produce or live animals from a batch under an active treatment withdrawal cannot be sold.
7. **Completed tasks can link to the activity record** that did the work. Tasks that need review stay "awaiting review" until a supervisor approves them.
8. **Every new table** is tenant-scoped with composite foreign keys, has RLS, and is written through RPCs or column-limited grants.

## 5. New permissions

`customers.manage`, `products.manage`, `suppliers.manage`, `procurement.request`, `procurement.approve`, `workforce.manage`, `tasks.manage`, `assets.view`, `assets.manage`, `health.view`, `health.record`. Default grants are in [roles](03-roles-permissions.md).

## 6. What was built

Five migrations, applied after the release 1 migrations without editing them:

| Migration | Adds |
|---|---|
| `20261021000001_customers_products_orders` | Document numbering per organization; `customers`, `customer_prices`, `products`, `sales_orders` (+lines); invoice fields on `sales`; `record_sale` rebuilt on `private.create_sale`; `create_sales_order`, `fulfil_sales_order`, `set_sales_order_status`; credit-limit check; views `customer_balances`, `product_availability`, `sales_order_summaries`, extended `sale_summaries` |
| `20261021000002_suppliers_procurement` | `suppliers`, `purchase_requests` (+lines), `purchase_orders` (+lines), `goods_receipts` (+lines), `supplier_bills`, `finance_transactions.supplier_bill_id`; request → approve → order → receive → bill → pay RPCs, void receipt and bill; summaries and balances views |
| `20261021000003_workforce_tasks` | `employees`, `employee_sites`, names-only `employee_names`; `planned_activities` extended with assignee, priority, review states, repeat and log link; `save_task`, `set_task_status`, `save_employee` |
| `20261021000004_finance_integration` | `finance_position` (aged receivables and payables, recorded cash by method), `report_cashbook`, `report_profit_comparison`, views `receivables`, `payables` |
| `20261021000005_assets_health_alerts` | `assets`, `maintenance_plans`, `maintenance_records`, `health_records`; maintenance and health RPCs; withdrawal-period enforcement on sales; `org_alerts` extended (the release 1 checks are kept as `org_alerts_core`) |

Screens added: Customers (+detail), Products, Sales orders (+new, +detail with delivery), Invoices (the former Sales list), Suppliers (+detail), Purchase requests, Purchase orders (+new, +detail with receiving), Supplier bills (+detail), Tasks, Workers, Health & biosecurity, Equipment (+detail), Receivables, Payables, Cashbook, and a Cash vs profit report. The daily log's task tab now shows the shared task list.

The sidebar is grouped Overview, Farm operations, Production, Stock and procurement, Sales and customers, Finance, People and administration. Poultry, Fish and Crops appear only when at least one active site runs that type, and every item still requires its permission.

### Behaviours changed on purpose

- Planned tasks can no longer be inserted or updated directly from the client; `save_task` and `set_task_status` enforce assignment and review. The daily log uses them.
- A sale can no longer be recorded from a batch or crop cycle during an active withdrawal period.
- `reverse_inventory_movement` refuses movements created by a goods received note or a health record, and `reverse_finance_transaction` refuses a maintenance expense; each is corrected from its own record so the linked figures stay consistent.
- Existing sales were numbered `INV-00001` onwards, in the order they were created.
