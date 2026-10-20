# Database and record-keeping rules

Migrations (applied in order): `supabase/migrations/2026102000000{1..7}_*.sql`.

| Migration | Contents |
|---|---|
| 0001 foundation | profiles, platform_admins, organizations, plans/subscriptions, permissions, role templates, per-org roles, farm_sites, memberships, member_sites, invitations, audit_events, idempotency, RLS helpers |
| 0002 org setup | units, categories, production_units, alert_settings; organization, site, invitation, member and role RPCs |
| 0003 operations schema | batches, batch_events, fish_samples, crop_cycles, stores, inventory_items, inventory_movements, stock_counts, feed_events, production_records, production_disposals, sales, sale_lines, finance_transactions, activity_logs, planned_activities; RLS and grants |
| 0004 operations RPCs | every operational write (see below) |
| 0005 reporting | summary views, reports, dashboard_summary, org_alerts |
| 0006 attachments | private storage bucket, attachments table, storage policies |
| 0007 detail edits | descriptive edits to batches and crop cycles |

## Tenant integrity by construction

- Every tenant table has `organization_id`. Parent tables declare `unique (id, organization_id)` or `unique (id, site_id)`, and children use **composite foreign keys**. A feed issue cannot reference a store on another site, and a sale cannot reference produce from another farm, even with forged IDs and even with the database owner's rights.
- Site-scoped rows carry `site_id`, which RLS checks with `can(org, site, permission)`.
- A NULL site means "organization-wide", which only all-sites members can see.

## Source of truth for every quantity

No balance is stored as an editable number. Each is the sum of a ledger, exposed through `security_invoker` views so RLS still applies.

| Quantity | Calculated from | View |
|---|---|---|
| Birds or fish in a batch | `sum(batch_events.quantity)` | `batch_summaries` |
| Stock in a store | `sum(inventory_movements.quantity)` (base unit) | `inventory_balances` |
| Feed held at a batch | `sum(feed_events.quantity)` | `batch_summaries.feed_at_batch_kg` |
| Produce still available | `quantity − rejected − sum(posted disposals)` | `production_record_balances` |
| Sale total, received, owed | `sum(sale_lines)`, `sum(income linked to sale)` | `sale_summaries` |
| Income and expenses | `sum(finance_transactions.amount)` by kind | reports |

**Corrections never edit or delete history.** A correction is a new row with the opposite sign that points at the original (`reverses_*`). Voided production records and sales keep their rows with a status, reason and timestamp. Reports fold reversals back into the kind they reverse, so "mortality" totals are net of corrections.

## Feed: deducted from the store exactly once

| Event | Store | Feed at batch |
|---|---|---|
| Issued (store → house or pond) | −q | +q |
| Consumed (eaten) | none | −q |
| Wasted at the batch | none | −q |
| Returned to the store | +q | −q |
| "Fed from store" (one step) | −q | issued +q, consumed −q |

Consumption cannot exceed what was issued and not yet used. A batch cannot close while issued feed is still at the house. Feed items cannot be "used" from a store directly, only issued to a batch.

## Fish counts are estimates

Fish batches default to `count_basis = 'estimated'`, and every UI figure is labelled as an estimate. If a harvest count exceeds the estimate, the difference is written as an explicit `adjustment` ("Harvest count exceeded the estimated population"), never silently absorbed. A final harvest writes off whatever the estimate still holds. Biomass is the estimated count × the latest sampled average weight.

## Units

System units (count, kg, litre, m² bases; bags, crates, tonnes, hectares, Nigerian plots) plus organization-defined units with an explicit factor. Every movement stores the quantity as entered, the unit and the factor used, alongside the base quantity, so conversions are auditable. Conversion between dimensions is refused. An item's base unit is fixed once stock has moved.

## Money

`numeric(14,2)`, one currency per organization (fixed once money is recorded). Income and expense categories must match the transaction kind. A sale's payment is split across its income categories in proportion to line value, with the last category absorbing rounding. A sale is linked to a batch or crop cycle only when a single one is involved.

"Operating surplus" means recorded income minus recorded expenses. Every screen states that it is not accounting profit.

## Idempotency and concurrency

- `private.idempotent_operations (organization_id, idempotency_key)` is the primary key. Operations take `pg_advisory_xact_lock` on the key, so concurrent duplicates wait and then receive the first result.
- Parent rows (batch, inventory item, production record, sale) are locked `FOR UPDATE` before balances are checked. Transfers lock in a stable order to avoid deadlocks.
- After-insert constraint triggers re-check that population, stock and feed at the batch never go negative.

## Alerts

`org_alerts()` computes alerts live from records, so there is no stored alert state to go stale:

- low stock, per item per site, only when a reorder level is set;
- daily mortality above the threshold, as a share of the population at the start of that day;
- production rejection above the threshold;
- missing daily records, only for batches that expect them and only after a full day has passed;
- overdue and upcoming planned tasks, and expected crop harvests.

## Audit

`audit_events` is written only by triggers (configuration tables, memberships, roles and permissions, invitations, batches, crop cycles, items, stores) and by RPCs (financial entries, reversals, voids). Clients can read it with `audit.view` but cannot insert, update or delete.
