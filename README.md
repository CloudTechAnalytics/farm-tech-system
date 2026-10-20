# The Harvest by CloudTech Analytics

Farm management and business records for poultry, fish and crop farms: daily operations, mortality, feed, inventory, production and harvests, sales, income and expenses, reports and alerts, for multiple farm sites and teams.

Multi-tenant SaaS on the same foundation as The Counsel (React + Vite + TypeScript, Supabase Postgres with Row Level Security, Vercel), built as a separate product with its own database, auth and deployment.

## What is in this repository

| Path | Contents |
|---|---|
| `src/` | React app. `features/<area>/{services,components,pages}`; `shared/` holds UI primitives, hooks, calculations and the Supabase client |
| `supabase/migrations/` | The whole backend: schema, RLS, business rules (Postgres functions), reports, storage policies |
| `tests/db/` | Database tests run as real signed-in users against a local Supabase (tenant isolation, permissions, ledgers, idempotency, concurrency) |
| `src/**/*.test.ts` | Unit tests for calculations and CSV export |
| `e2e/` | Browser test of the core workflow (Playwright) |
| `scripts/seed-demo.mjs` | Demo farm for local development only (refuses non-local databases) |
| `docs/` | Architecture, database, roles, security, deployment, backups, testing, known limitations |

## Run it locally

Requirements: Node 22+, Docker Desktop running.

```bash
npm install
npx supabase start            # local Postgres, Auth, Storage; applies every migration
cp .env.example .env.local    # then paste the API URL and anon key printed above
npm run dev                   # http://127.0.0.1:5173
```

Create an account on the sign-up page, or load the demo farm:

```bash
node scripts/seed-demo.mjs    # sign in as demo.owner@farmledger.local / Harvest2026
```

Local email (sign-up confirmations, password resets) is captured at http://127.0.0.1:54324.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm run typecheck` | TypeScript only |
| `npm test` | Unit tests |
| `npm run test:db` | Database tests (local Supabase must be running) |
| `npx playwright test` | Browser workflow test (local Supabase must be running) |
| `npm run db:reset` | Rebuild the local database from migrations |
| `npm run db:types` | Regenerate `src/shared/types/database.generated.ts` after a migration |

## Documentation

1. [Reference inspection of The Counsel](docs/01-reference-inspection.md), including weaknesses found and how The Harvest avoids them
2. [Architecture](docs/02-architecture.md)
3. [Roles and permissions](docs/03-roles-permissions.md)
4. [Database and record-keeping rules](docs/04-database.md)
5. [Security](docs/05-security.md)
6. [Deployment](docs/06-deployment.md)
7. [Backup and restoration](docs/07-backup-restore.md)
8. [Testing](docs/08-testing.md)
9. [Known limitations and remaining work](docs/09-known-limitations.md)

The product name is configurable with `VITE_PRODUCT_NAME`.
