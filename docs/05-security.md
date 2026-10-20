# Security

## Controls

| Area | Control |
|---|---|
| Tenant isolation | RLS on every tenant table and `security_invoker` views; composite foreign keys make cross-tenant references impossible to store |
| Writes | Ledger tables have no client insert, update or delete grant; changes go through `security definer` RPCs that check permission and site access first |
| Column safety | Updatable tables grant `UPDATE` on named columns only (for example profiles: name and phone; organizations: no plan or status) |
| Privilege escalation | No admin flag on profiles. `platform_admins` has no client write path. No first-user bootstrap |
| Platform staff | No implicit access to farm records; aggregate-only platform function |
| Audit integrity | No client insert path; triggers and RPCs only |
| Invitations | 24-byte random token, stored only as SHA-256; bound to the invited email; expires in 7 days |
| Files | Private bucket; path must start with the user's org and an accessible site; download only through 60-second signed URLs; JPG/PNG/WebP/HEIC/PDF up to 10 MB |
| Secrets | The browser gets only the URL and anon key. CI fails if the bundle mentions a service-role key |
| Inputs | Zod in forms; CHECK constraints and RPC validation in the database (lengths, ranges, dates not in the future, positive amounts) |
| Exports | CSV cells that would run as spreadsheet formulas are neutralised |
| Abuse | Supabase Auth rate limits; at most 3 organizations created per account; plan limits on sites and users |
| Headers | `vercel.json` sets nosniff, frame-deny, referrer and permissions policies; `index.html` sets noindex |
| Dependencies | `npm audit --omit=dev` is clean (React Router upgraded to v7 to clear two advisories) |

## Verified by tests (`tests/db/tenancy.test.ts`)

These run as real signed-in users against the real migrations:

- A farm cannot read another farm's rows in 20 tenant tables or 6 views.
- Another farm's batch, store, category or organization cannot be acted on by supplying its ID.
- A cross-tenant reference is rejected by a foreign key even for the database superuser.
- Another farm's rows cannot be updated.
- Direct insert, update or delete on ledgers is denied.
- Audit history cannot be forged or deleted.
- Users cannot make themselves platform admin, change their login email in the profile, or call platform functions.
- Users cannot change their organization's plan or status.
- Anonymous visitors cannot read any table or call any RPC.
- Site-scoped workers see only their site and cannot act elsewhere.
- Workers cannot see money (the dashboard returns `finance: null`, and financial reports raise a permission error).
- Accountants cannot record mortality.
- Removed members lose access immediately.
- Last-owner protection holds, and non-owners cannot grant ownership.
- Invitations fail for the wrong email, and tokens are stored only as hashes.
- Deleting an organization removes all of its data and nothing else.

A mutation check confirmed these tests catch a regression: deliberately opening insert access on `batch_events` made the suite fail.

## Weaknesses found in The Counsel

These were found during inspection and are **not** present in The Harvest. They should be checked and fixed in The Counsel separately; nothing was changed there.

1. `profile_update_self` permits a user to update `profiles.is_platform_admin` on their own row, which looks like a privilege escalation to platform admin.
2. `log_audit()` is callable by any signed-in user for any organization and with any actor ID.
3. Platform admins bypass every tenant permission check.
4. The first account to sign up on a new environment becomes platform owner.

## Before production

- Turn on email confirmation and set the redirect URL allow-list in the production Supabase project ([deployment](06-deployment.md)).
- Configure custom SMTP; the built-in mailer is rate-limited.
- Consider leaked-password protection and CAPTCHA on sign-up in Supabase Auth settings.
- Enable point-in-time recovery ([backups](07-backup-restore.md)).
