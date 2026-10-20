# Phase 1: The Counsel reference inspection

Inspected: `CloudTechAnalytics/thecounsels-testing` (branch `testing`, commit `fbb747e`), cloned read-only into a scratch directory. Nothing in that repository was modified.

## 1. What The Counsel actually is

| Area | Implementation found |
|---|---|
| Frontend | React 19, TypeScript (strict), Vite 6, React Router 6 (`createBrowserRouter`), path alias `@` → `src` |
| Server state | TanStack Query 5. No other global state library. Defaults: `staleTime` 30s, `retry: 1`, mutations never retry |
| Forms | React Hook Form + Zod (`features/<x>/schemas.ts`) |
| UI | Tailwind 3 + shadcn/ui-style primitives (`shared/components/ui`), Radix, lucide-react, sonner toasts, Framer Motion |
| Backend | Supabase only: Postgres, RLS, Auth, Storage, Realtime, Edge Functions, `pg_cron`/`pg_net`. No custom server (the `server/` Express folder is retired) |
| Supabase client | One singleton in `shared/lib/supabase.ts`, PKCE flow, a global fetch wrapper with a 20s timeout so nothing hangs forever |
| Env | `shared/config/env.ts` validates `VITE_*` vars with Zod; only the URL and anon key reach the browser |
| Auth | `AuthProvider` context loads profile, memberships and permission keys, picks the active org (localStorage), and retries the "fresh JWT" race |
| Tenancy | Every tenant table has `organization_id`; RLS through `security definer` helpers `is_org_member`, `has_permission`, `is_org_admin`, `is_platform_admin` |
| Branches | `branches` + `memberships.access_scope` + `member_branches`, checked by `user_has_branch_access(org, branch)` |
| Roles | System roles via a `role_key` enum, permissions catalog, `role_permissions` M:N. Frontend: `usePermissions().has()` and `<RequirePermission>` |
| Storage | Private buckets, first path segment = `organization_id`, policies call `has_permission(foldername[1]::uuid, …)` |
| Audit | `audit_logs` written by a `log_audit()` RPC called from the frontend service layer |
| Feature layout | `features/<name>/{components,hooks,services,pages,types.ts,schemas.ts}`. Services are the only callers of `supabase.from()`; hooks wrap services; pages compose hooks |
| Errors | `errorMessage()` / `friendlyErrorMessage()` because PostgREST errors are not `Error` instances |
| Migrations | 173 numbered SQL files, applied with `supabase db push`. Two separate Supabase projects (Testing, Production) |
| Deploy | Vercel static SPA with a rewrite to `index.html` (a Render blueprint also exists). CI only runs `npm run build` for the frontend |
| Tests | None for the live app (the only suite targets the retired Express backend) |
| Types | `database.types.ts` is hand-written and often drifts |

## 2. Weaknesses found, and what FarmLedger does instead

| # | Weakness in The Counsel | Risk | FarmLedger approach |
|---|---|---|---|
| W1 | `profile_update_self` lets a user update any column of their own `profiles` row, including `is_platform_admin`. I found no trigger or column grant that blocks it. | **Critical.** Any signed-in user may be able to make themselves platform admin with one `update`. This should be verified and fixed in The Counsel separately. | Platform admin status lives in a separate `platform_admins` table with no client write policy. Profiles expose only safe columns for update (column-level `grant update`). |
| W2 | `log_audit()` is `security definer`, granted to `authenticated`, and takes arbitrary `p_org` and `p_actor_id`. | **High.** Any user can write forged audit entries into any organization. | Audit events are written only by database triggers and internal RPCs. Clients have no insert path. |
| W3 | `audit_insert_members` policy lets members insert audit rows directly. | Same as W2. | No insert policy on `audit_events`. |
| W4 | `is_platform_admin()` short-circuits every `has_permission` and `is_org_member` check. | Platform staff can read every firm's records with no grant and no audit trail. | Platform admins get **no** implicit tenant access. Platform metrics come from aggregate-only functions. Audited support access is deferred and documented. |
| W5 | First signup on a fresh database becomes Platform Owner automatically. | A race on any new environment; an attacker who signs up first owns the platform. | Platform admins are granted by SQL with the service role only (documented runbook). |
| W6 | Hand-written `database.types.ts` drifts. | Compile-time types lie. | Types generated with `supabase gen types` from the local database and checked in CI. |
| W7 | Mutations write a row and then log audit in a second round trip; multi-row writes are separate requests. | Partial writes on network failure; duplicates on retry. | Every write that touches stock, population or money goes through one Postgres function that runs in one transaction and takes an idempotency key. |
| W8 | No automated tests for the live app. | Regressions in RLS ship silently. | Vitest unit tests for calculations plus database tests that run real migrations and attack tenant isolation as different users. |
| W9 | Live computation over maintained counters was learned the hard way three times. | (Lesson, not a bug.) | Adopted from day one: balances and populations are views over ledgers, never editable columns. |
| W10 | `org_update_admins` allows admins to update every column of `organizations`, including `status` and `plan`. | A firm admin could move their own plan or status. | Organization updates go through a column-limited grant; plan and status change only through platform functions. |

## 3. What FarmLedger reuses unchanged in spirit

- Thin client over Supabase. No custom backend server.
- The feature-folder convention (`services` → `hooks` → `pages`).
- `security definer` helper functions as the single RLS vocabulary.
- Organization → site scoping, adapted from `branches` / `member_branches` / `access_scope`.
- Granular permission keys attached to roles, mirrored by `usePermissions().has()` in the UI.
- Fetch timeout wrapper, `errorMessage()` helper, Zod-validated env.
- Numbered SQL migrations, Testing then Production via `supabase db push`.
- Vercel SPA hosting with a rewrite rule.

## 4. What FarmLedger deliberately does not reuse

- The Counsel's visual design (ivory, charcoal, brass, Playfair). FarmLedger gets its own agricultural design system.
- Any legal tables, business rules, data, keys or project refs.
- Paystack, Resend, Gemini, pg_cron reminder engines. Payments and email are out of scope for release 1.

## 5. FarmLedger schema and tenant-isolation plan

See [`docs/04-database.md`](04-database.md) for the full schema. The key decisions:

1. **Composite same-tenant foreign keys.** Every parent table has `unique (id, organization_id)`, and children reference `(parent_id, organization_id)`. A row in Farm A physically cannot point at a site, batch or item in Farm B, even if a request supplies a foreign ID.
2. **Two-level scoping.** `organization_id` is the tenant boundary; `site_id` is the within-tenant boundary. Members are `organization`-scoped or limited to listed sites.
3. **Per-organization roles.** Each new organization gets its own copy of the four role templates (owner, manager, worker, accountant). Owners can change permissions for their own organization without touching anyone else's.
4. **Ledgers as the source of truth.** Bird and fish populations come from `batch_events`; stock comes from `inventory_movements`; feed at the house comes from `feed_events`; produce on hand comes from `production_records` minus `production_disposals`; money comes from `finance_transactions`. Ledger rows are never updated. Corrections are reversal rows.
5. **One RPC per business operation.** Locks the parent row, validates the balance, writes all rows, writes the audit event, and records the idempotency key, all in one transaction.
