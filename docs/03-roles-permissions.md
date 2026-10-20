# Roles and permissions

Two independent questions decide what a user can do:

- **Role → what they can do.** Each role holds a set of permission keys.
- **Access scope → where.** Either *all sites*, which includes organization-wide records such as costs not tied to a site, or *only listed sites*.

Both are enforced in Postgres on every request. The UI hides what a role can't do, but hiding is never the protection.

## Default roles

Each organization gets its own copy of these roles when it is created. An owner can change permissions for their own organization (Administration → Roles) or add custom roles, without affecting any other farm.

| Permission | Owner | Manager | Accountant | Worker |
|---|:-:|:-:|:-:|:-:|
| Manage organization, alert settings (`org.manage`) | ✓ | | | |
| Invite users, change access, remove users (`members.manage`) | ✓ | | | |
| Create, edit, archive sites (`sites.manage`) | ✓ | | | |
| Edit lists, units, production units (`settings.manage`) | ✓ | ✓ | | |
| View audit history (`audit.view`) | ✓ | | | |
| View operations (`operations.view`) | ✓ | ✓ | ✓ | ✓ |
| Record daily work (`operations.record`) | ✓ | ✓ | | ✓ |
| Start, transfer, close batches and cycles; corrections (`batches.manage`) | ✓ | ✓ | | |
| View inventory (`inventory.view`) | ✓ | ✓ | ✓ | ✓ |
| Issue feed and inputs (`inventory.record`) | ✓ | ✓ | | ✓ |
| Receive, transfer, adjust, count stock (`inventory.manage`) | ✓ | ✓ | | |
| Record sales (`sales.record`) | ✓ | ✓ | ✓ | |
| View finance (`finance.view`) | ✓ | | ✓ | |
| Record income and expenses (`finance.record`) | ✓ | | ✓ | |
| Reverse transactions, void sales (`finance.reverse`) | ✓ | | ✓ | |
| Operational reports (`reports.view`) | ✓ | ✓ | ✓ | |
| Financial reports (`reports.financial`) | ✓ | | ✓ | |
| Export CSV (`reports.export`) | ✓ | ✓ | ✓ | |

A manager sees money only if an owner grants `finance.view`, as the brief requires. A manager with `sales.record` but without `finance.view` can record and look up sales, but cannot see the income and expense ledger.

## Rules that cannot be changed

- The owner role always has every permission and always has access to all sites.
- An organization always keeps at least one active owner. The last owner cannot be removed, suspended or demoted, and nobody can remove or suspend themselves.
- Only an owner can grant the owner role or change another owner's access, even if another user has `members.manage`.
- Removing or suspending a user takes effect on their next request, because every RLS check reads the live membership.

## Inviting users

1. Administration → Users → Invite user, then choose the email, role and sites.
2. The Harvest shows a one-time link. Share it by WhatsApp, SMS or email. The link works only for that address and expires after 7 days. Only a SHA-256 hash of the token is stored.
3. The person signs up or signs in with that email and opens the link.

Plan limits on sites and users are checked when inviting and when adding sites.

## Platform administrators (CloudTech staff)

Platform administrators get **no access** to farm records. The platform console shows aggregate counts only (`platform_overview()`). Admin status is held in `platform_admins`, which has no client write path. Grant or revoke it with the SQL editor or service role only:

```sql
insert into public.platform_admins (user_id, note)
select id, 'Granted by <name> on <date>, ticket <ref>' from auth.users where email = 'staff@cloudtechanalytics.example';
-- revoke
delete from public.platform_admins where user_id = (select id from auth.users where email = '...');
```

Audited, customer-approved support access to a farm's records is not built yet (see [known limitations](09-known-limitations.md)).
