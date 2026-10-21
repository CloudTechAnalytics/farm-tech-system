# Known limitations and remaining work

## Not done yet

| Item | Notes |
|---|---|
| Hosted deployment | No Supabase or Vercel project has been created. See [deployment](06-deployment.md) |
| CI on GitHub | The workflow exists but has not run; the repository has not been pushed |
| Invitation email | Invites produce a one-time link that the owner shares. Sending it by email needs an Edge Function plus an email provider |
| Audited support access for CloudTech staff | Platform admins currently cannot see farm data at all. A customer-approved, time-limited, audited access grant is the next step if support needs it |
| Subscription billing | Plans and limits are enforced; payment collection is excluded from release 1 by the brief |
| Stock valuation | Stock is tracked in quantities. Purchase costs are recorded, but there is no average-cost valuation of stock on hand or of inputs used per cycle |
| Feed conversion ratio | The calculation exists in `calc.ts`; it is not shown because weight gain per batch is not yet recorded for poultry |
| Multi-currency | One currency per organization |
| Offline entry | Forms need a connection. Idempotency keys make retries safe, but there is no offline queue |
| Bundle size | The core chunk is about 170 kB gzipped; record dialogs could be lazy-loaded too |
| Tablet layout | Responsive breakpoints cover it, but it was only checked at desktop and phone widths |
| Pagination | Lists show the latest 200 to 500 rows with date filters. Very large farms will need cursor pagination |
| Stock valuation in profit | The Cash vs profit report is an operating estimate: it does not value stock on hand or depreciate equipment |
| Partial bill matching | A supplier bill can link to one purchase order; three-way matching per line (order, receipt, bill) is not done |
| Customer statements | Customer balances and invoices are on screen and in CSV; there is no printable statement or emailed invoice yet |
| Payroll | Workers are records for assignment only; wages are recorded as labour expenses, as before |
| Water-quality limits | Safe ranges are fixed for warm-water fish (catfish, tilapia); they are not yet configurable per species |
| Accessibility audit | Labels, focus rings, keyboard dialogs and colour checks are in place; no full screen-reader audit yet |

## Deliberate behaviours to know about

- Corrections create reversal rows dated the day of the correction. The original stays on its own date.
- A batch cannot close while feed issued to it is unaccounted for, or while birds or fish remain recorded, unless they are explicitly written off with a reason.
- Organization-wide income and expenses (no site) are not attributed to any site in the site comparison report.
- A sale links to a batch or cycle in finance only when a single one is involved. Mixed sales count in totals but not in per-batch money.
- Missing-record alerts start after one full day with nothing logged for a batch that expects daily records (configurable).
