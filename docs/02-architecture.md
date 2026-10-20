# Architecture

## Shape

```
Browser (React SPA on Vercel)
   │  anon key + user JWT, HTTPS
   ▼
Supabase
   ├─ Auth (email + password)
   ├─ PostgREST  ── tables and views (read)  ── RLS on every row
   │             └─ RPC functions (write)     ── permission + site checks inside
   ├─ Postgres   ── ledgers, views, reports, alerts, audit triggers
   └─ Storage    ── private "attachments" bucket, path = org/site/file
```

There is no custom API server. As in The Counsel, the database is the backend. Unlike The Counsel, every write that changes a population, a stock balance, produce on hand or money goes through one Postgres function. The function runs in one transaction, locks the record it changes, checks the balance, writes every affected row, writes the daily-log entry and audit event, and records an idempotency key.

## Frontend layout

```
src/
  app/                 router (lazy-loaded pages), layout, navigation
  features/
    auth/              session, permissions, route guards, sign-in pages
    onboarding/        create organization + first site
    dashboard/         period summary, charts, alerts, latest records
    activity/          daily log, planned tasks
    batches/           poultry flocks and fish batches (one implementation)
    crops/             crop cycles
    production/        egg collections, harvests, disposals
    inventory/         stock on hand, movements, items, stock dialogs
    operations/        quick-record dialogs (mortality, feed, eggs, harvests…)
    sales/             sales, payments, voids
    finance/           income and expenses
    reports/           report tables, CSV export, print
    alerts/            live alerts
    sites/             farm sites, production units, stores
    admin/             organization, users, roles, lists, alert settings, audit
    attachments/       private files on records
  shared/
    components/ui/     design-system primitives
    components/        composites (FormDialog, StatCard, BarChart, pickers…)
    lib/               supabase client, calc.ts, format, csv, validation, errors
    hooks/             useRecord (idempotent writes), reference data
    types/             database.generated.ts (generated, checked in CI)
```

Conventions follow The Counsel: services are the only code that calls Supabase, hooks wrap services in TanStack Query, and pages compose hooks and components. Forms use React Hook Form with Zod.

## Write path for an operational record

1. A form opens, and `useSubmissionKey()` creates a UUID for this submission.
2. On save, `useRecord()` calls the service with that key. On a network failure, the same key is sent again when the user retries.
3. The RPC takes an advisory lock on `(organization, key)`. If the key was already used, it returns the first result marked `replayed`, and the UI says "Already saved".
4. The RPC checks permission and site access, locks the batch or item row, validates (for example, a population cannot go negative, feed can't be eaten unless it was issued, produce can't be oversold), and writes.
5. Constraint triggers re-check the balance after insert as a backstop.
6. On success, every record-derived query is refetched. Reference lists keep their cache.

## Design system

Agricultural palette defined once in `src/app/globals.css`:

| Token | Use |
|---|---|
| Canopy green (sidebar gradient) | Navigation, light through leaves down to shade |
| Horizon gradient | Page header bands and sign-in: sky fading to a field |
| Primary green | Actions |
| Harvest gold | Accent, active navigation marker |
| Soil brown | Mortality series, earth tones |
| Poultry amber, fish blue, crop green | Production type: badges, card tints and chart series |
| Money in green, money out purple | Finance charts |

Chart colours were checked with the dataviz palette validator for colour-blind separation and contrast. Fonts are Fraunces for headings and Public Sans for body and figures, with tabular numbers in tables. Forms open as bottom sheets on phones, and a bottom bar with a Record button gives one-tap entry in the field.
