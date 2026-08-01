import { notFound } from "next/navigation";
import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { EstimateStatusButtons } from "@/components/EstimateStatusButtons";
import { Badge, ButtonLink, Card, CardHeader, PageHeading } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { formatIsoDateLong } from "@/lib/dates";
import { ESTIMATE_STATUS_LABELS } from "@/lib/estimates";
import { formatCents, multiplyCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function formatTimestamp(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function EstimatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireOwner();
  const supabase = await createClient();

  const { data: estimate } = await supabase
    .from("estimates")
    .select("*, customer:customers(id, name, email, phone)")
    .eq("id", id)
    .maybeSingle();

  if (!estimate) notFound();

  const customer = estimate.customer as unknown as {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  } | null;

  const timeline = [
    { label: "Created", value: estimate.created_at },
    { label: "Sent", value: estimate.sent_at },
    { label: "Viewed", value: estimate.viewed_at },
    { label: "Decided", value: estimate.decided_at },
  ].filter((entry) => entry.value);

  return (
    <AppShell session={session}>
      <PageHeading
        title={customer?.name ?? "Estimate"}
        subtitle={formatIsoDateLong(estimate.created_at.slice(0, 10))}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={estimate.status === "accepted" ? "green" : "quiet"}>
              {ESTIMATE_STATUS_LABELS[estimate.status]}
            </Badge>
            <ButtonLink href="/estimates" tone="secondary">
              All estimates
            </ButtonLink>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Lines" />
          <ul>
            {estimate.line_items.map((item, index) => (
              <li
                key={`${item.description}-${index}`}
                className="route-divider flex flex-wrap items-center justify-between gap-2 px-4 py-3 last:border-b-0 sm:px-5"
              >
                <span className="min-w-0">
                  <span className="block text-sm text-ink">{item.description}</span>
                  <span className="block text-xs text-muted">
                    {item.qty} × <span className="mono">{formatCents(item.price_cents)}</span>
                  </span>
                </span>
                <span className="mono text-ink">
                  {formatCents(multiplyCents(item.price_cents, item.qty))}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between border-t border-line px-4 py-3.5 sm:px-5">
            <span className="label">Total</span>
            <span className="numeric text-2xl text-ink">
              {formatCents(estimate.total_cents)}
            </span>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="px-4 py-4 sm:px-5">
            <h2 className="eyebrow text-ink">Move it along</h2>
            <p className="mt-1.5 mb-3 text-sm text-muted">
              Accepting an estimate marks the customer active and mirrors the estimate into
              QuickBooks.
            </p>
            <EstimateStatusButtons estimateId={estimate.id} status={estimate.status} />
          </Card>

          <Card className="px-4 py-4 sm:px-5">
            <h2 className="eyebrow text-ink">Timeline</h2>
            <ul className="mt-3 flex flex-col gap-1.5">
              {timeline.map((entry) => (
                <li key={entry.label} className="flex justify-between gap-3 text-sm">
                  <span className="text-muted">{entry.label}</span>
                  <span className="mono text-ink">{formatTimestamp(entry.value)}</span>
                </li>
              ))}
            </ul>
            {estimate.qbo_estimate_id ? (
              <p className="mt-3 text-xs text-muted">
                Mirrored to QuickBooks as estimate {estimate.qbo_estimate_id}
              </p>
            ) : null}
          </Card>

          {customer ? (
            <Card className="px-4 py-4 sm:px-5">
              <h2 className="eyebrow text-ink">Customer</h2>
              <p className="mt-2 text-sm">
                <Link href={`/customers/${customer.id}`} className="text-cut hover:underline">
                  {customer.name}
                </Link>
              </p>
              {customer.email ? (
                <p className="text-sm text-muted">{customer.email}</p>
              ) : null}
              {customer.phone ? <p className="mono text-muted">{customer.phone}</p> : null}
            </Card>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
