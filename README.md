# Blair Lawn Dashboard

Operations dashboard for a small family landscaping company. It runs customers,
properties, recurring schedules, the daily route, estimates and equipment, and
it integrates with QuickBooks Online, which owns all accounting.

**QuickBooks owns the money. This app owns operations.** The app creates
invoices in QBO and reads payment status, AR aging and revenue back from QBO.
No accounting logic is duplicated locally. If a number is financial truth, QBO
is the source of that truth, and the UI says so next to the number along with
the time it was synced.

All branding, the company name included, lives in `src/lib/branding.ts`.

## Stack

- Next.js 16 (App Router), TypeScript
- Supabase: Postgres, Auth, Row Level Security
- Tailwind CSS v4
- QuickBooks Online API via `intuit-oauth` plus REST calls
- Deploys to Vercel

## Getting set up

```bash
npm install
cp .env.example .env.local   # fill it in
npm run dev
```

### Environment

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key. Server only, used by the cron sync |
| `QBO_CLIENT_ID` | Intuit app client id |
| `QBO_CLIENT_SECRET` | Intuit app client secret |
| `QBO_REDIRECT_URI` | Must match the Intuit app exactly, ending in `/api/qbo/callback` |
| `QBO_ENVIRONMENT` | `sandbox` or `production` |
| `QBO_TOKEN_ENCRYPTION_KEY` | 32 bytes, base64. `openssl rand -base64 32` |
| `CRON_SECRET` | Shared secret for `/api/qbo/sync`. You choose the value, Vercel then sends it as a bearer header on each cron run. Required in production |
| `APP_TIME_ZONE` | Operating timezone, decides what "today" means on the route |

Secrets never go in the repo. The QBO access and refresh tokens are stored in
Supabase encrypted with AES-256-GCM under `QBO_TOKEN_ENCRYPTION_KEY`, never in
plaintext and never in env.

### Database

Run the migrations in order against your Supabase project:

```
supabase/migrations/0001_init.sql                 schema, indexes, RLS
supabase/migrations/0002_bootstrap.sql            org bootstrap on first account
supabase/migrations/0003_roles_and_managed_users  admin/manager/staff roles
supabase/seed.sql                                 optional demo data, local only
```

There is no public signup. The first account created becomes the admin and
owns the org; every account after that is created by an admin from the Team
panel in Settings, with a role of admin, manager or staff.

### QuickBooks

1. Create an app at the Intuit developer portal and add the redirect URI.
2. Start with the sandbox company. Production is a config swap, no code change.
3. Sign in as the owner, go to Settings, press Connect QuickBooks.
4. The callback stores the tokens and runs a first sync straight away.

`vercel.json` schedules `/api/qbo/sync` every 30 minutes during business hours.
That endpoint pulls payment status, AR aging and monthly revenue by item, and
tops the schedule back up to two weeks out.

## How it is put together

```
src/lib/branding.ts    name, logo and colors. The only place to rebrand
src/lib/money.ts       integer cents everywhere plus the two QBO conversions
src/lib/qbo.ts         the only module that talks to QuickBooks
src/lib/qbo-sync.ts    the scheduled pull, and how freshness is described
src/lib/invoicing.ts   job completion to QBO invoice
src/lib/recurrence.ts  when a recurring job falls due. Pure calendar math
src/lib/schedule.ts    the idempotent generator that writes jobs rows
src/lib/dashboard.ts   KPI and Needs attention assembly
src/app/actions/       server actions, one file per area
src/components/        UI, with RouteList as the signature component
```

### Money

Every amount is an integer number of cents, stored in a column suffixed
`_cents`, summed and multiplied as integers, and formatted to dollars only at
render. No float touches a dollar amount.

Decimals exist in exactly two functions, `centsToQboAmount` and
`qboAmountToCents` in `src/lib/money.ts`, because the QuickBooks API speaks
decimal dollars. Both build and parse the decimal through string and integer
arithmetic, so a value that comes back from QBO as `85.29999999999999` still
becomes `8530` cents rather than `8529`.

### Fabrication firewall

No financial value is ever invented. When a QuickBooks figure is unavailable the
UI says "Sync unavailable" or "QuickBooks not connected" in words. It never
renders a zero, a dash, or a placeholder styled to look like real data. When a
sync fails, the last good snapshot stays on screen, flagged orange with the time
it was actually taken.

### Roles and accounts

Three roles: **admin**, **manager**, **staff**. Access is still two tier, which
is deliberate. Admin sees everything; manager and staff see operations only.
When the real permission matrix is decided, `public.has_full_access()` in
`0003_roles_and_managed_users.sql` is the single predicate every policy calls,
and `ROLES_WITH_FULL_ACCESS` in `src/lib/types.ts` is its mirror in the app.

| Table | Admin | Manager and staff |
|---|---|---|
| `customers`, `properties`, `equipment` | read and write | read |
| `jobs` | read and write | read their own route, update status only |
| `services`, `recurring_jobs`, `estimates`, `maintenance_log`, `qbo_sync_state` | read and write | no access |

A database trigger also rejects any attempt by a non admin to change
`price_cents`, `qbo_invoice_id` or the assignment on a job, so the invoice
amount can only ever come from the schedule an admin set. They never receive a
job price over the wire either: it is dropped server side in
`src/lib/route-view.ts` rather than hidden with CSS.

**There is no public signup.** The login screen only signs people in. Accounts
are created by an admin in Settings, which sets the password and role in one
step so nothing depends on email delivery. Any admin can move another account
to admin, which is how ownership is handed over. Nobody can change their own
role, so the org always has at least one admin.

Removing the signup form is not what enforces this. The anon key is public, so
`signUp` can be called against the project directly. Turn signups off in the
Supabase dashboard too, under Authentication, Sign In / Providers, Email.

## Checks

```bash
npm run verify      # money path and schedule cadence, 38 assertions
npm run verify:db   # migrations and role rules on a throwaway Postgres, 23 checks
npm run typecheck   # tsc --noEmit
npm run build       # production build
```

`npm run verify` covers the parts that have to be right before anything else
matters: parsing and formatting cents, the QBO conversion round trip, and the
weekly, biweekly and monthly cadence rules including season bounds.

`npm run verify:db` applies every migration in order to a scratch database and
then acts as a real admin, manager and staff account to check what each one can
actually read and write. It needs a Postgres at `$PGURL`, defaulting to
`postgresql://postgres@localhost:55432`. `scripts/test-migrations.sql` stubs the
parts of Supabase's `auth` schema the policies depend on.

## What is in the MVP

1. Auth and org setup, admin / manager / staff roles, accounts created by an admin
2. Customers and properties with the notes the crew needs on site
3. Recurring scheduling, generating jobs two weeks ahead, safe to re-run
4. Today's Route, drag to reorder, status transitions, day totals
5. Job completion creating the QuickBooks invoice
6. Dashboard KPIs
7. Needs Attention: overdue invoices, stale estimates, equipment past service, rain risk
8. QuickBooks connect and scheduled sync with the synced time on every figure

Deliberately not built yet: route optimization, weather API, SMS and email,
customer portal, chemical application logs, photo uploads, multi-crew, and
assisted estimate copy. The schema leaves room for them, but there are no hooks
beyond that.

## Notes

- `npm audit` reports advisories in `postcss` and `sharp`. Both are transitive
  dependencies pinned inside Next itself, and `npm audit fix --force` "resolves"
  them by downgrading Next to version 9. They are left as is.
- Rain risk is a manual toggle in the MVP. Phase 2 replaces it with a weather
  feed.
