# Deployment

The same pattern as The Counsel: separate Testing and Production environments, each with its own Supabase project and Vercel project. Every migration goes to Testing first.

**Nothing has been deployed yet.** All verification so far ran against a local Supabase stack.

## 1. Supabase projects (once per environment)

1. Create a new Supabase project (for example `farmledger-testing`, then `farmledger-production`). Do not reuse The Counsel's projects.
2. Authentication → URL configuration: set the site URL to the app's domain, and add `https://<domain>/**` to redirect URLs.
3. Authentication → Providers → Email: enable **Confirm email**. Minimum password length is 8.
4. Authentication → SMTP: configure a real sender (Resend, SES or similar).
5. Apply migrations from a local checkout:

   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```

6. Grant platform admin to CloudTech staff if needed ([roles](03-roles-permissions.md#platform-administrators-cloudtech-staff)).
7. Do **not** run `scripts/seed-demo.mjs`. It refuses non-local databases by design.

## 2. Vercel projects

- Framework: Vite. Build command: `npm run build`. Output directory: `dist`.
- Environment variables:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the project's anon (public) key |
| `VITE_APP_ENV` | `staging` or `production` (non-production builds show a badge in the sidebar) |
| `VITE_PRODUCT_NAME` | optional, defaults to FarmLedger |

- Set the production branch to the branch for that environment. The Counsel was once served stale builds because this pointed at a deleted branch.
- `vercel.json` already contains the SPA rewrite and security headers.

## 3. Release routine

1. Merge to the Testing branch. CI applies all migrations to an empty database and runs every test.
2. `db push` to Testing, then smoke-test sign-up, a record, a sale and a report.
3. Fast-forward Production, then `db push` to Production.
4. Migration numbers are timestamps and must be unique. Never edit a migration after it has been pushed to a hosted project; add a new one.

> Before the first hosted deploy, migrations were corrected in place while the schema was still local only. From the first `db push` onward they are immutable.

## 4. Environment parity checklist

Secrets and settings are per project and easy to miss (a lesson from The Counsel):

- Auth email confirmation, SMTP and redirect URLs are set on both projects.
- Storage bucket `attachments` exists and is private (created by migration 0006).
- Vercel environment variables point each app at its own Supabase project.
