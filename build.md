# CLAUDE.md — TrueCut Lawn & Landscape Dashboard

## What this is

A business management dashboard for a small family landscaping company (owner-operator couple, one crew, one truck to start). It runs the operational side of the business — customers, properties, recurring schedules, daily routes, estimates, crew, equipment — and integrates with QuickBooks Online, which owns all accounting.

**Architecture principle: QuickBooks owns the money. This app owns operations.** The app creates invoices in QBO and reads payment status, AR aging, and revenue back from QBO. Never duplicate accounting logic locally. If a number is financial truth, QBO is the source of that truth.

The working name "TrueCut" is a placeholder — keep all branding (name, logo, colors) in a single config so it can be swapped in one place.

## Tech stack

- Next.js (App Router), TypeScript
- Supabase (Postgres + Auth + Row Level Security)
- Vercel deployment
- Tailwind CSS
- QuickBooks Online API (OAuth 2.0) via `intuit-oauth` + REST calls
- Anthropic API — later phase only (estimate drafting assistance); not in MVP

## Engineering conventions (non-negotiable)

- Complete file replacements over surgical patches
- One batch commit per session
- **Integer arithmetic for all money.** Store and compute in cents (integer). Format to dollars only at render. No floats touch a dollar amount anywhere, including values sent to or parsed from QBO.
- Deterministic code handles all calculations; LLM handles language only (and only in later phases)
- Fabrication firewall: no invented financial values. If QBO data is unavailable, show an explicit "sync unavailable" state — never a placeholder number styled as real data.
- Seeded RNG if any randomization is ever needed (demo data seeding)
- Ship-first-then-iterate: MVP scope below ships before any Phase 2 work begins

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
QBO_CLIENT_ID=
QBO_CLIENT_SECRET=
QBO_REDIRECT_URI=
QBO_ENVIRONMENT=sandbox   # sandbox | production
```

Never commit secrets. QBO tokens (access + refresh) are stored encrypted in Supabase, not in env.

## Data model (Supabase / Postgres)

All money columns are `integer` cents and suffixed `_cents`. All tables get `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at`. RLS on everything; single-tenant for now but scope every table by `org_id` from day one so multi-tenant is possible later.

```
orgs            — id, name, branding jsonb, qbo_realm_id, qbo_connected_at
users           — Supabase auth; profile: org_id, name, role ('owner'|'crew')
customers       — org_id, name, email, phone, status ('lead'|'estimate'|'active'|'paused'|'churned'),
                  qbo_customer_id, notes
properties      — org_id, customer_id fk, label, address, city, lat, lng,
                  lot_sqft int, gate_code, notes (pets, sprinkler heads, access),
                  photos jsonb
services        — org_id, name, default_price_cents, pricing_unit ('flat'|'per_visit'|'per_sqft'),
                  qbo_item_id
recurring_jobs  — org_id, property_id fk, service_id fk, frequency ('weekly'|'biweekly'|'monthly'),
                  day_of_week int, price_cents, active bool, season_start date, season_end date
jobs            — org_id, property_id fk, recurring_job_id fk nullable, service_id fk,
                  scheduled_date date, route_order int, status
                  ('scheduled'|'en_route'|'in_progress'|'complete'|'skipped'|'rain_delay'),
                  price_cents, assigned_crew uuid[], started_at, completed_at,
                  completion_notes, photos jsonb, qbo_invoice_id
estimates       — org_id, customer_id fk, property_id fk, status
                  ('draft'|'sent'|'viewed'|'accepted'|'declined'),
                  line_items jsonb [{service_id, description, qty, price_cents}],
                  total_cents, sent_at, viewed_at, decided_at, qbo_estimate_id
equipment       — org_id, name, category ('mower'|'trimmer'|'blower'|'truck'|'trailer'|'other'),
                  engine_hours numeric, last_service_at, service_interval_hours int, notes
maintenance_log — org_id, equipment_id fk, performed_at, description, cost_cents
activity_log    — org_id, actor, event_type, payload jsonb, created_at
qbo_sync_state  — org_id, last_sync_at, last_sync_status, cursor jsonb
```

Derived values (route mileage, day revenue, week totals) are computed, never stored, except where a QBO snapshot is cached with an explicit `synced_at`.

## QuickBooks integration

**Direction of data flow:**

| Data | Direction | Notes |
|---|---|---|
| Customers | App → QBO (create), QBO ↔ App (link by `qbo_customer_id`) | App is source of truth for operational fields; QBO for billing fields |
| Invoices | App → QBO on job completion | One invoice per completed job, or batched monthly per customer (org setting) |
| Payments / paid status | QBO → App | Read-only. Poll on sync + webhook if configured |
| AR aging | QBO → App | Read-only, cached with `synced_at` timestamp shown in UI |
| Revenue by service (P&L detail) | QBO → App | Read-only, monthly rollup |
| Estimates | App → QBO (optional mirror) | App owns estimate lifecycle; mirror accepted estimates to QBO |

**Implementation notes:**
- OAuth 2.0 flow at `/api/qbo/connect` and `/api/qbo/callback`. Store realm ID on org. Refresh tokens proactively (QBO refresh tokens rotate — always persist the newest one immediately).
- All QBO calls go through one server-side client module (`lib/qbo.ts`) with retry + rate-limit handling. No QBO calls from the browser.
- Sync job at `/api/qbo/sync` (Vercel cron, every 30 min during business hours): pull payment status for open invoices, AR aging buckets, and monthly revenue-by-item.
- Every QBO-sourced figure in the UI displays its `synced_at` ("from QuickBooks · synced 7:42 AM"). If sync fails, show the last-good timestamp and a warning state — never silently stale.
- Amounts: QBO uses decimal dollars. Convert at the boundary only: `cents_to_qbo_amount()` / `qbo_amount_to_cents()` in `lib/money.ts`. These two functions are the only place decimals exist.
- Build against QBO **sandbox** first; production keys are a config swap.

## MVP scope (Phase 1 — ship this first)

1. **Auth + org setup** — Supabase auth, single org, owner + crew roles
2. **Customers & properties** — CRUD, property notes (gate codes, pets, sprinklers), status pipeline
3. **Recurring scheduling** — recurring_jobs generate `jobs` rows 2 weeks ahead (idempotent generator, safe to re-run)
4. **Today's Route** (dashboard hero) — ordered stop list, drag to reorder (`route_order`), status transitions, per-stop property notes, day totals
5. **Job completion → QBO invoice** — completing a job creates the QBO invoice and stores `qbo_invoice_id`
6. **Dashboard KPIs** — week revenue vs target, outstanding invoices (QBO), jobs done/scheduled, pending estimates
7. **Needs Attention panel** — overdue invoices (QBO aging), stale viewed estimates (>48h), equipment past service interval, rain-risk flag (manual toggle in MVP)
8. **QBO connect + sync** — OAuth, cron sync, synced_at surfacing

**Explicitly out of MVP:** route optimization (manual drag-order only), weather API, SMS/email notifications, customer portal, chemical application logs, photo uploads, multi-crew, Anthropic-assisted estimate copy. These are Phase 2+; do not build hooks for them beyond the schema above.

## Phase 2 (after MVP ships)

- Weather API (Open-Meteo) → automatic rain-risk flags + reschedule suggestions
- "On our way" / "job complete" SMS (Twilio) — org-level toggle
- Estimate builder with send/view tracking (signed public link, `viewed_at` on open)
- Crew mobile view: today's route only, big touch targets, clock start/stop per job
- Photo uploads (Supabase Storage) on job completion
- Route optimization (nearest-neighbor ordering as v1; no paid API)

## Design system (match the approved mockup)

The approved mockup is `lawn-dashboard-mockup.html` — replicate its look. Tokens:

```
--hedge:  #1C2E22   /* deep green — header, nav */
--stripe: #24382B   /* header lawn-stripe alternate band */
--cut:    #4C9A46   /* fresh-cut green — primary accent, progress */
--canvas: #F1F3EE   /* page background */
--card:   #FFFFFF
--ink:    #22271F
--muted:  #6B7266
--line:   #E1E5DC
--orange: #E4762B   /* equipment orange — alerts/overdue ONLY */
```

- Type: Barlow Condensed (600/700, uppercase, tracked) for headings/labels/KPI numbers; Barlow for body; IBM Plex Mono for times and money.
- Header uses the repeating diagonal "mowing stripe" gradient (hedge/stripe, 56px bands, 105deg).
- Route list is the signature component: vertical route line, nodes (hollow = scheduled, filled green = done, orange ring = in progress), dashed row dividers, mono timestamps.
- Orange is reserved for things that need action. Never decorative.
- Responsive: KPI grid 4→2→1; route usable on a phone in the truck.

## UI copy rules

- Sentence case, plain verbs, active voice ("Send reminder," not "Submit")
- Buttons say what happens; the same action keeps the same name everywhere
- Empty states tell the user what to do next, not just that nothing is here
- Every QBO figure labeled with source and sync time
- No em dashes in any copy

## Definition of done (MVP)

- Deployed on Vercel, connected to QBO sandbox
- Owner can: add a customer + property, set a weekly mow, see it appear on Today's Route, mark it complete, and see the invoice appear in QBO sandbox with the correct amount
- Overdue QBO invoice appears in Needs Attention within one sync cycle
- All money paths verified integer-cents end to end
- RLS verified: crew role cannot see financial screens
