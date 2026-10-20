# Backup and restoration

## What needs protecting

| Data | Where | How it is protected |
|---|---|---|
| All farm records | Supabase Postgres | Daily backups and point-in-time recovery |
| Attachments (receipts, photos) | Supabase Storage bucket `attachments` | Not covered by database backups; copy separately |
| Schema and business rules | `supabase/migrations/` in Git | Version control |
| Configuration | Supabase dashboard, Vercel | This document and [deployment](06-deployment.md) |

## Production settings

- Use a plan with daily backups, and enable **point-in-time recovery** on the production project. A farm's records are append-only ledgers, so restoring to just before an incident loses at most the minutes after it.
- Weekly, export a logical dump to storage outside Supabase:

  ```bash
  npx supabase db dump --linked -f backups/farmledger-$(date +%F).sql          # schema
  npx supabase db dump --linked --data-only -f backups/farmledger-data-$(date +%F).sql
  ```

  Keep these encrypted (they contain customer data) and keep at least 8 weeks.
- Weekly, mirror the `attachments` bucket with an S3-compatible client to separate storage.

## Restoration test (monthly, and before major releases)

1. Create a scratch Supabase project or local stack.
2. Restore the latest dump: `psql "$SCRATCH_DB_URL" -f schema.sql`, then `-f data.sql`.
3. Run the reconciliation checks below. Each must return zero rows.
4. Record the date, dump used, time taken and result in the operations log.

```sql
-- No negative populations, stock or feed at a batch
select batch_id from batch_events group by batch_id having sum(quantity) < 0;
select item_id, store_id from inventory_movements group by 1, 2 having sum(quantity) < 0;
select batch_id, item_id from feed_events group by 1, 2 having sum(quantity) < 0;
-- No produce sold or used beyond what was recorded
select id from production_record_balances where available_quantity < 0;
-- Every feed issue has its stock movement, and every reversal points at a real row
select id from feed_events where kind in ('issued', 'returned') and inventory_movement_id is null;
select id from finance_transactions t where reverses_id is not null and not exists (select 1 from finance_transactions o where o.id = t.reverses_id);
```

## Recovering from a bad migration

1. Stop: do not push further migrations.
2. If data was damaged, restore the database with point-in-time recovery to just before the push.
3. Fix forward with a new migration tested on Testing, never by editing the pushed one.

## Recovering a single farm's mistake

Most mistakes need no restore. Users correct them with reversals and voids, which keep history. Restore only for platform-level incidents.
