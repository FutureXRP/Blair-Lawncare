import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { KpiGrid, KpiTile } from "@/components/KpiTile";
import { NeedsAttention } from "@/components/NeedsAttention";
import { RainRiskToggle } from "@/components/RainRiskToggle";
import { RouteList } from "@/components/RouteList";
import { SyncBadge } from "@/components/SyncBadge";
import { ButtonLink, Card, CardHeader, PageHeading } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { loadDashboard } from "@/lib/dashboard";
import { formatIsoDate, formatIsoDateLong, today } from "@/lib/dates";
import { formatCents, formatCentsCompact } from "@/lib/money";
import { isConnected } from "@/lib/qbo";
import { getRouteForDate, summarizeRoute } from "@/lib/route";
import { toRouteStopView } from "@/lib/route-view";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireAdmin();
  const supabase = await createClient();
  const currentDate = today();

  const qboConnected = isConnected(session.org);

  const [stops, dashboard] = await Promise.all([
    getRouteForDate(supabase, session.org.id, currentDate),
    loadDashboard(supabase, session.org.id, {
      qboConnected,
      rainRisk: session.org.rain_risk,
      weeklyTargetCents: session.org.weekly_revenue_target_cents,
    }),
  ]);

  const totals = summarizeRoute(stops);
  const { week, qbo, estimates } = dashboard;

  const targetProgress =
    week.targetCents > 0 ? week.completedCents / week.targetCents : null;

  return (
    <AppShell session={session}>
      <PageHeading
        title="Today"
        subtitle={formatIsoDateLong(currentDate)}
        action={<RainRiskToggle enabled={session.org.rain_risk} />}
      />

      <KpiGrid>
        <KpiTile
          label="Completed this week"
          value={formatCentsCompact(week.completedCents)}
          progress={targetProgress}
          detail={
            week.targetCents > 0
              ? `${formatCentsCompact(week.targetCents)} target · ${formatCentsCompact(
                  week.scheduledCents,
                )} on the schedule`
              : `${formatCentsCompact(week.scheduledCents)} on the schedule. Set a weekly target in Settings.`
          }
          source={
            <span className="text-[0.6875rem] text-muted">
              From the schedule · {formatIsoDate(week.weekStart)} to{" "}
              {formatIsoDate(week.weekEnd)}
            </span>
          }
        />

        <KpiTile
          label="Outstanding invoices"
          value={
            qbo.outstandingCents !== null ? formatCentsCompact(qbo.outstandingCents) : undefined
          }
          unavailable={
            qbo.outstandingCents === null
              ? qboConnected
                ? "Sync unavailable"
                : "QuickBooks not connected"
              : undefined
          }
          tone={qbo.overdueInvoices.length > 0 ? "orange" : "ink"}
          detail={
            qbo.openInvoiceCount !== null
              ? `${qbo.openInvoiceCount} open · ${qbo.overdueInvoices.length} past due`
              : undefined
          }
          source={<SyncBadge freshness={qbo.freshness} />}
        />

        <KpiTile
          label="Jobs this week"
          value={`${week.jobsComplete}/${week.jobsScheduled}`}
          progress={week.jobsScheduled > 0 ? week.jobsComplete / week.jobsScheduled : null}
          detail="Done out of scheduled"
          source={<span className="text-[0.6875rem] text-muted">From the schedule</span>}
        />

        <KpiTile
          label="Pending estimates"
          value={String(estimates.pendingCount)}
          detail={
            estimates.pendingCount > 0
              ? `${formatCents(estimates.pendingCents)} out for decision`
              : "Nothing waiting on a customer"
          }
          source={<span className="text-[0.6875rem] text-muted">From the schedule</span>}
        />
      </KpiGrid>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Today's route"
            meta={
              <>
                {totals.completeCount} of {totals.stopCount} done ·{" "}
                <span className="mono">{formatCents(totals.completedCents)}</span> of{" "}
                <span className="mono">{formatCents(totals.scheduledCents)}</span>
              </>
            }
            action={
              <ButtonLink href="/schedule" tone="secondary">
                Schedule
              </ButtonLink>
            }
          />
          <RouteList
            date={currentDate}
            stops={stops.map((stop) => toRouteStopView(stop, true))}
            canReorder
            canSeeMoney
          />
        </Card>

        <div className="flex flex-col gap-4">
          <NeedsAttention items={dashboard.attention} freshness={qbo.freshness} />

          {!qboConnected ? (
            <Card className="px-4 py-4 sm:px-5">
              <h2 className="eyebrow text-ink">Connect QuickBooks</h2>
              <p className="mt-2 text-sm text-muted">
                Invoices, payment status and AR aging all come from QuickBooks. Until it is
                connected those figures stay blank rather than showing a number that is not
                real.
              </p>
              <div className="mt-3">
                <ButtonLink href="/settings">Connect QuickBooks</ButtonLink>
              </div>
            </Card>
          ) : null}

          <Card className="px-4 py-4 sm:px-5">
            <h2 className="eyebrow text-ink">Quick actions</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              <li>
                <Link href="/customers/new" className="text-cut hover:underline">
                  Add a customer
                </Link>
              </li>
              <li>
                <Link href="/schedule" className="text-cut hover:underline">
                  Generate the next two weeks
                </Link>
              </li>
              <li>
                <Link href="/estimates/new" className="text-cut hover:underline">
                  Write an estimate
                </Link>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
