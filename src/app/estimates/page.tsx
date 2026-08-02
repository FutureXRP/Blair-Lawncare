import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeading } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatSyncedAt, hoursSince } from "@/lib/dates";
import { ESTIMATE_STATUS_LABELS } from "@/lib/estimates";
import { formatCents } from "@/lib/money";
import { STALE_ESTIMATE_HOURS } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EstimatesPage() {
  const session = await requireAdmin();
  const supabase = await createClient();

  const { data: estimates } = await supabase
    .from("estimates")
    .select("*, customer:customers(id, name)")
    .eq("org_id", session.org.id)
    .order("created_at", { ascending: false });

  const rows = estimates ?? [];

  return (
    <AppShell session={session}>
      <PageHeading
        title="Estimates"
        subtitle={`${rows.length} on file`}
        action={<ButtonLink href="/estimates/new">Write an estimate</ButtonLink>}
      />

      <Card>
        <CardHeader title="All estimates" />
        {rows.length === 0 ? (
          <EmptyState
            headline="No estimates yet"
            action={<ButtonLink href="/estimates/new">Write an estimate</ButtonLink>}
          >
            Write one for a lead, mark it sent, and it will show up on the dashboard until the
            customer decides.
          </EmptyState>
        ) : (
          <ul>
            {rows.map((estimate) => {
              const customer = estimate.customer as unknown as { name?: string } | null;
              const viewedHours = hoursSince(estimate.viewed_at);
              const isStale =
                estimate.status === "viewed" &&
                viewedHours !== null &&
                viewedHours >= STALE_ESTIMATE_HOURS;

              return (
                <li key={estimate.id} className="route-divider last:border-b-0">
                  <Link
                    href={`/estimates/${estimate.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition hover:bg-canvas sm:px-5"
                  >
                    <span className="min-w-0">
                      <span className="block text-base uppercase leading-tight text-ink">
                        {customer?.name ?? "Customer"}
                      </span>
                      <span className="block text-sm text-muted">
                        {estimate.line_items.length}{" "}
                        {estimate.line_items.length === 1 ? "line" : "lines"}
                        {estimate.sent_at
                          ? ` · sent ${formatSyncedAt(estimate.sent_at) ?? ""}`
                          : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {isStale ? <Badge tone="orange">Needs a nudge</Badge> : null}
                      <Badge tone={estimate.status === "accepted" ? "green" : "quiet"}>
                        {ESTIMATE_STATUS_LABELS[estimate.status]}
                      </Badge>
                      <span className="mono text-ink">{formatCents(estimate.total_cents)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
