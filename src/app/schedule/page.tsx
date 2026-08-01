import Link from "next/link";

import { generateSchedule } from "@/app/actions/schedule";
import { ActionForm } from "@/components/ActionForm";
import { AppShell } from "@/components/AppShell";
import { Badge, Card, CardHeader, EmptyState, PageHeading } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { addDays, formatIsoDate, today } from "@/lib/dates";
import { formatCents, sumCents } from "@/lib/money";
import { DEFAULT_HORIZON_DAYS } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const session = await requireOwner();
  const supabase = await createClient();

  const windowStart = today();
  const windowEnd = addDays(windowStart, DEFAULT_HORIZON_DAYS - 1);

  const [jobsResult, recurringResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("*, property:properties(address, city, customer:customers(name)), service:services(name)")
      .eq("org_id", session.org.id)
      .gte("scheduled_date", windowStart)
      .lte("scheduled_date", windowEnd)
      .order("scheduled_date", { ascending: true })
      .order("route_order", { ascending: true }),
    supabase
      .from("recurring_jobs")
      .select("id, active")
      .eq("org_id", session.org.id)
      .eq("active", true),
  ]);

  const jobs = jobsResult.data ?? [];
  const activeRecurringCount = recurringResult.data?.length ?? 0;

  const days = Array.from({ length: DEFAULT_HORIZON_DAYS }, (_, offset) => {
    const date = addDays(windowStart, offset);
    const dayJobs = jobs.filter((job) => job.scheduled_date === date);
    return {
      date,
      jobs: dayJobs,
      valueCents: sumCents(
        dayJobs.filter((job) => job.status !== "skipped").map((job) => job.price_cents),
      ),
    };
  });

  return (
    <AppShell session={session}>
      <PageHeading
        title="Schedule"
        subtitle={`${formatIsoDate(windowStart)} through ${formatIsoDate(windowEnd)} · ${activeRecurringCount} active recurring services`}
      />

      <Card className="mb-4">
        <CardHeader
          title="Fill the schedule"
          meta="Generating is safe to repeat. Stops that already exist are left alone."
        />
        <div className="px-4 py-4 sm:px-5">
          <ActionForm
            action={generateSchedule}
            submitLabel="Generate the next two weeks"
            footer={
              <span className="text-xs text-muted">
                Jobs you moved or repriced by hand stay exactly as you left them.
              </span>
            }
          >
            <></>
          </ActionForm>
        </div>
      </Card>

      {jobs.length === 0 ? (
        <Card>
          <EmptyState headline="Nothing scheduled yet">
            {activeRecurringCount === 0
              ? "Set a recurring service on a customer's property first, then generate the schedule."
              : "Press generate above to fill the next two weeks from your recurring services."}
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {days.map((day) => (
            <Card key={day.date}>
              <CardHeader
                title={formatIsoDate(day.date)}
                meta={
                  day.jobs.length === 0 ? (
                    "No stops"
                  ) : (
                    <>
                      {day.jobs.length} {day.jobs.length === 1 ? "stop" : "stops"} ·{" "}
                      <span className="mono">{formatCents(day.valueCents)}</span>
                    </>
                  )
                }
                action={
                  day.jobs.length > 0 ? (
                    <Link
                      href={`/route?date=${day.date}`}
                      className="font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.1em] text-cut hover:underline"
                    >
                      Open route
                    </Link>
                  ) : null
                }
              />
              {day.jobs.length > 0 ? (
                <ul>
                  {day.jobs.map((job) => {
                    const property = job.property as unknown as {
                      address?: string;
                      city?: string | null;
                      customer?: { name?: string } | null;
                    } | null;
                    const service = job.service as unknown as { name?: string } | null;

                    return (
                      <li
                        key={job.id}
                        className="route-divider flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 last:border-b-0 sm:px-5"
                      >
                        <span className="min-w-0">
                          <span className="text-sm text-ink">
                            {property?.customer?.name ?? "Customer"}
                          </span>
                          <span className="pl-2 text-sm text-muted">
                            {property?.address}
                            {property?.city ? `, ${property.city}` : ""}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <Badge tone="quiet">{service?.name ?? "Service"}</Badge>
                          <span className="mono text-ink">{formatCents(job.price_cents)}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
