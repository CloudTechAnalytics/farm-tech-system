# Testing

| Suite | Command | Needs | What it proves |
|---|---|---|---|
| Unit | `npm test` | nothing | Conversions, mortality and lay rates, feed per head, biomass, yield, money rounding and allocation, low-stock rule, CSV escaping and formula injection |
| Database | `npm run test:db` | `npx supabase start` | Tenant isolation, permissions, site scoping, ledger reconciliation, idempotency, concurrency, sales, finance, reports, alerts, organization deletion |
| Browser | `npx playwright test e2e/core-workflow.spec.ts` | local Supabase | Sign-up through dashboard in a real browser, desktop and phone width |
| Build | `npm run build` | nothing | Typecheck and production bundle |

CI (`.github/workflows/ci.yml`) runs all of them. The database job starts with an empty database, so it also proves the migrations apply cleanly, and it checks that the generated types match the schema.

## Last local run (20 Oct 2026)

- Unit: 14 passed.
- Database: 46 passed across `tenancy`, `livestock-inventory` and `production-finance`, after `supabase db reset` from the migrations.
- Browser: core workflow passed (desktop, plus phone-width checks).
- Build: passed. `npm audit --omit=dev`: 0 vulnerabilities.
- CI itself has **not run yet**: the repository has not been pushed to GitHub.

## Acceptance criteria coverage

| # | Criterion | Evidence |
|---|---|---|
| 1 | Owner signs up, creates organization and site | e2e |
| 2 | Owner invites a user and assigns a role | db `addMember` (invitation flow) in tenancy tests |
| 3 | Users see only their organization and sites | db tenancy, site scoping |
| 4 | Poultry population changes only through valid transactions | db livestock |
| 5 | Fish stocking, mortality and harvest reconcile | db production-finance |
| 6 | Crop cycles and harvests recorded and reported | db production-finance |
| 7 | Purchases, issues, consumption, returns and adjustments give correct balances | db livestock-inventory |
| 8 | Duplicates cannot double-deduct | db (same key, sequential and 5 concurrent; duplicate sale) |
| 9 | Income and expenses update reports | db production-finance |
| 10 | Production appears in dashboards and exports | db dashboard, e2e dashboard; CSV unit tests |
| 11 | Unauthorized direct requests fail | db tenancy |
| 12 | Cannot reach other farms via record IDs | db tenancy |
| 13 | Archived and corrected records handled consistently | reversals and voids in db tests |
| 14 | Mobile, tablet, desktop | e2e at 1366 and 390 px; tablet not separately tested |
| 15 | Migrations apply to a clean environment | `supabase db reset` and the CI database job |
| 16 | Production build | `npm run build` |
| 17 | Critical workflows have automated tests | above |
| 18 | No hardcoded demonstration metrics | every figure comes from RPCs or views; empty-org test asserts real zeros |

## Writing database tests

`tests/db/helpers.ts` creates users directly in the local `auth.users` and runs SQL as role `authenticated` with JWT claims, exactly as PostgREST does. It refuses to connect to anything that is not localhost.
