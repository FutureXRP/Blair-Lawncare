import { createService } from "@/app/actions/customers";
import { updateOrgSettings } from "@/app/actions/settings";
import { createTeamMember } from "@/app/actions/team";
import { ActionForm } from "@/components/ActionForm";
import { AppShell } from "@/components/AppShell";
import { QboActions } from "@/components/QboPanel";
import { SyncBadge } from "@/components/SyncBadge";
import { TeamMemberRow } from "@/components/TeamMemberRow";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Field,
  FormError,
  FormNotice,
  Input,
  PageHeading,
  Select,
} from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { branding } from "@/lib/branding";
import { centsToInputValue, formatCents } from "@/lib/money";
import { isConnected, readQboConfig } from "@/lib/qbo";
import { readFreshness } from "@/lib/qbo-sync";
import { createClient } from "@/lib/supabase/server";
import {
  USER_ROLES,
  USER_ROLE_DESCRIPTIONS,
  USER_ROLE_LABELS,
  type PricingUnit,
  type QboSyncState,
  type UserRole,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const PRICING_UNIT_LABELS: Record<PricingUnit, string> = {
  flat: "Flat price",
  per_visit: "Per visit",
  per_sqft: "Per square foot",
};

const QBO_MESSAGES: Record<string, { tone: "notice" | "error"; text: string }> = {
  connected: { tone: "notice", text: "QuickBooks is connected and the first sync has run" },
  denied: { tone: "error", text: "The QuickBooks authorization was declined" },
  state_mismatch: {
    tone: "error",
    text: "That connection attempt did not match this browser. Start again.",
  },
  no_realm: { tone: "error", text: "QuickBooks did not return a company id" },
  token_exchange_failed: {
    tone: "error",
    text: "QuickBooks would not issue tokens. Check the client id, secret and redirect URI.",
  },
  not_configured: {
    tone: "error",
    text: "Set QBO_CLIENT_ID, QBO_CLIENT_SECRET and QBO_REDIRECT_URI first",
  },
  no_encryption_key: {
    tone: "error",
    text: "Set QBO_TOKEN_ENCRYPTION_KEY so the tokens can be stored encrypted",
  },
  admin_only: { tone: "error", text: "Only an admin can connect QuickBooks" },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ qbo?: string }>;
}) {
  const session = await requireAdmin();
  const supabase = await createClient();
  const { qbo: qboMessageKey } = await searchParams;

  const [servicesResult, teamResult, syncResult] = await Promise.all([
    supabase.from("services").select("*").eq("org_id", session.org.id).order("name"),
    supabase.from("profiles").select("*").eq("org_id", session.org.id).order("name"),
    supabase.from("qbo_sync_state").select("*").eq("org_id", session.org.id).maybeSingle(),
  ]);

  const services = servicesResult.data ?? [];
  const team = teamResult.data ?? [];

  // Emails live in auth.users. Reading them needs the service role key, so the
  // panel degrades to names only rather than failing when it is not set.
  const emailByUserId = new Map<string, string>();
  try {
    const { data } = await createAdminClient().auth.admin.listUsers({ perPage: 200 });
    for (const user of data?.users ?? []) {
      if (user.email) emailByUserId.set(user.id, user.email);
    }
  } catch {
    // No service role key configured.
  }
  const syncState = (syncResult.data ?? null) as QboSyncState | null;
  const freshness = readFreshness(syncState);

  const qboConfigured = Boolean(readQboConfig());
  const qboConnected = isConnected(session.org);
  const message = qboMessageKey ? QBO_MESSAGES[qboMessageKey] : undefined;

  return (
    <AppShell session={session}>
      <PageHeading
        title="Settings"
        subtitle={`Branding, services, team and the QuickBooks connection. Working name is ${branding.name}.`}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Business" />
          <div className="px-4 py-5 sm:px-5">
            <ActionForm action={updateOrgSettings} submitLabel="Save settings">
              <Field label="Business name">
                <Input name="name" defaultValue={session.org.name} required />
              </Field>
              <Field
                label="Weekly revenue target"
                hint="Dollars. Drives the progress bar on the dashboard. Leave blank for none."
              >
                <Input
                  name="weekly_revenue_target"
                  inputMode="decimal"
                  defaultValue={
                    session.org.weekly_revenue_target_cents > 0
                      ? centsToInputValue(session.org.weekly_revenue_target_cents)
                      : ""
                  }
                />
              </Field>
              <Field
                label="Invoicing"
                hint="Per job creates an invoice the moment a job is marked done. Monthly leaves completed jobs to be batched."
              >
                <Select name="invoicing_mode" defaultValue={session.org.invoicing_mode}>
                  <option value="per_job">One invoice per completed job</option>
                  <option value="monthly">Batch monthly per customer</option>
                </Select>
              </Field>
            </ActionForm>

            <p className="mt-5 border-t border-line pt-4 text-xs text-muted">
              Colors, logo and the name shown in the header live in src/lib/branding.ts. Change
              them there and the whole app follows.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="QuickBooks"
            meta="QuickBooks owns the money. This app owns operations."
            action={qboConnected ? <SyncBadge freshness={freshness} /> : null}
          />
          <div className="flex flex-col gap-4 px-4 py-5 sm:px-5">
            {message?.tone === "notice" ? <FormNotice message={message.text} /> : null}
            {message?.tone === "error" ? <FormError message={message.text} /> : null}

            <div className="flex flex-wrap items-center gap-2">
              {qboConnected ? (
                <Badge tone="green">Connected</Badge>
              ) : (
                <Badge tone="quiet">Not connected</Badge>
              )}
              <Badge tone="quiet">
                {process.env.QBO_ENVIRONMENT === "production" ? "Production" : "Sandbox"}
              </Badge>
              {session.org.qbo_realm_id ? (
                <span className="mono text-muted">Company {session.org.qbo_realm_id}</span>
              ) : null}
            </div>

            {qboConfigured ? (
              <QboActions connected={qboConnected} />
            ) : (
              <p className="text-sm text-orange">
                Set QBO_CLIENT_ID, QBO_CLIENT_SECRET and QBO_REDIRECT_URI in the environment,
                then reload this page.
              </p>
            )}

            {qboConnected && syncState ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-4 text-sm">
                <dt className="text-muted">Open invoices</dt>
                <dd className="mono text-ink">{syncState.open_invoices.length}</dd>
                <dt className="text-muted">Outstanding</dt>
                <dd className="mono text-ink">
                  {syncState.ar_total_cents === null
                    ? "Not available"
                    : formatCents(syncState.ar_total_cents)}
                </dd>
                <dt className="text-muted">Past due over 90 days</dt>
                <dd className="mono text-ink">
                  {syncState.ar_90_plus_cents === null
                    ? "Not available"
                    : formatCents(syncState.ar_90_plus_cents)}
                </dd>
              </dl>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Services" meta={`${services.length}`} />
          {services.length === 0 ? (
            <EmptyState headline="No services yet">
              Add the work you sell, like a weekly mow or a spring cleanup. Recurring schedules
              and estimates both pull from this list.
            </EmptyState>
          ) : (
            <ul>
              {services.map((service) => (
                <li
                  key={service.id}
                  className="route-divider flex flex-wrap items-center justify-between gap-2 px-4 py-3 last:border-b-0 sm:px-5"
                >
                  <span>
                    <span className="block text-sm uppercase text-ink">{service.name}</span>
                    <span className="block text-xs text-muted">
                      {PRICING_UNIT_LABELS[service.pricing_unit]}
                      {service.qbo_item_id ? " · linked to QuickBooks" : ""}
                    </span>
                  </span>
                  <span className="mono text-ink">
                    {formatCents(service.default_price_cents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line px-4 py-5 sm:px-5">
            <ActionForm action={createService} submitLabel="Add service" submitTone="secondary">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Name">
                  <Input name="name" placeholder="Weekly mow" required />
                </Field>
                <Field label="Default price" hint="Dollars">
                  <Input name="default_price" inputMode="decimal" placeholder="55.00" required />
                </Field>
                <Field label="Priced">
                  <Select name="pricing_unit" defaultValue="per_visit">
                    <option value="per_visit">Per visit</option>
                    <option value="flat">Flat price</option>
                    <option value="per_sqft">Per square foot</option>
                  </Select>
                </Field>
              </div>
            </ActionForm>
          </div>
        </Card>

        <Card className="self-start">
          <CardHeader
            title="Team"
            meta={`${team.length} ${team.length === 1 ? "person" : "people"}. There is no public signup, so everyone here was added by an admin.`}
          />

          <ul>
            {team.map((member) => (
              <TeamMemberRow
                key={member.id}
                userId={member.id}
                name={member.name}
                email={emailByUserId.get(member.id) ?? null}
                role={member.role}
                isSelf={member.id === session.userId}
              />
            ))}
          </ul>

          <div className="border-t border-line px-4 py-5 sm:px-5">
            <h3 className="eyebrow text-ink">Add someone</h3>
            <p className="mb-4 mt-1.5 text-sm text-muted">
              They can sign in as soon as you save. Give them the starting password
              yourself rather than by email.
            </p>

            <ActionForm action={createTeamMember} submitLabel="Add to the team">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name">
                  <Input name="name" required placeholder="Alex Blair" />
                </Field>
                <Field label="Email">
                  <Input name="email" type="email" required placeholder="alex@example.com" />
                </Field>
                <Field label="Starting password" hint="At least 8 characters">
                  <Input name="password" type="text" required minLength={8} />
                </Field>
                <Field label="Role">
                  <Select name="role" defaultValue="staff">
                    {USER_ROLES.map((role: UserRole) => (
                      <option key={role} value={role}>
                        {USER_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <dl className="rounded border border-line bg-canvas px-3 py-2.5 text-xs">
                {USER_ROLES.map((role: UserRole) => (
                  <div key={role} className="flex gap-2 py-0.5">
                    <dt className="label w-16 shrink-0 pt-px">{USER_ROLE_LABELS[role]}</dt>
                    <dd className="text-muted">{USER_ROLE_DESCRIPTIONS[role]}</dd>
                  </div>
                ))}
              </dl>
            </ActionForm>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
