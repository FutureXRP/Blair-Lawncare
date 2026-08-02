import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { RainRiskToggle } from "@/components/RainRiskToggle";
import { RouteList } from "@/components/RouteList";
import { Card, CardHeader, PageHeading } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { addDays, formatIsoDate, formatIsoDateLong, today } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { getRouteForDate, summarizeRoute } from "@/lib/route";
import { toRouteStopView } from "@/lib/route-view";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function RoutePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requireSession();
  const supabase = await createClient();

  const { date: requestedDate } = await searchParams;
  const date = requestedDate && ISO_DATE.test(requestedDate) ? requestedDate : today();

  const stops = await getRouteForDate(supabase, session.org.id, date);
  const totals = summarizeRoute(stops);
  const canSeeMoney = session.isAdmin;

  return (
    <AppShell session={session}>
      <PageHeading
        title={date === today() ? "Today's route" : "Route"}
        subtitle={formatIsoDateLong(date)}
        action={session.isAdmin ? <RainRiskToggle enabled={session.org.rain_risk} /> : null}
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href={`/route?date=${addDays(date, -1)}`}
          className="font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.1em] text-muted transition hover:text-cut"
        >
          {formatIsoDate(addDays(date, -1))}
        </Link>
        {date !== today() ? (
          <Link
            href="/route"
            className="font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.1em] text-cut"
          >
            Back to today
          </Link>
        ) : (
          <span />
        )}
        <Link
          href={`/route?date=${addDays(date, 1)}`}
          className="font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.1em] text-muted transition hover:text-cut"
        >
          {formatIsoDate(addDays(date, 1))}
        </Link>
      </div>

      <Card>
        <CardHeader
          title="Stops"
          meta={
            canSeeMoney ? (
              <>
                {totals.completeCount} of {totals.stopCount} done ·{" "}
                <span className="mono">{formatCents(totals.completedCents)}</span> of{" "}
                <span className="mono">{formatCents(totals.scheduledCents)}</span>
              </>
            ) : (
              `${totals.completeCount} of ${totals.stopCount} done`
            )
          }
        />
        <RouteList
          date={date}
          stops={stops.map((stop) => toRouteStopView(stop, canSeeMoney))}
          canReorder={session.isAdmin}
          canSeeMoney={canSeeMoney}
        />
      </Card>
    </AppShell>
  );
}
