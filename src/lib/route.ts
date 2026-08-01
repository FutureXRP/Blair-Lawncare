import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sumCents } from "@/lib/money";
import type { Database, JobStatus, RouteStop, Uuid } from "@/lib/types";

type Db = SupabaseClient<Database>;

const STOP_SELECT = `
  *,
  property:properties (
    id, label, address, city, gate_code, notes, lot_sqft,
    customer:customers ( id, name, phone )
  ),
  service:services ( id, name )
`;

interface RawStop {
  property: (RouteStop["property"] & { customer: RouteStop["customer"] | null }) | null;
  service: RouteStop["service"] | null;
  [key: string]: unknown;
}

export async function getRouteForDate(
  db: Db,
  orgId: Uuid,
  date: string,
): Promise<RouteStop[]> {
  const { data, error } = await db
    .from("jobs")
    .select(STOP_SELECT)
    .eq("org_id", orgId)
    .eq("scheduled_date", date)
    .order("route_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).flatMap((row) => {
    const raw = row as unknown as RawStop;
    if (!raw.property || !raw.service || !raw.property.customer) return [];

    const { customer, ...property } = raw.property;
    return [
      {
        ...(raw as unknown as RouteStop),
        property,
        customer,
        service: raw.service,
      },
    ];
  });
}

export const DONE_STATUSES: JobStatus[] = ["complete", "skipped"];

export interface RouteTotals {
  stopCount: number;
  completeCount: number;
  /** integer cents, scheduled value of the whole day */
  scheduledCents: number;
  /** integer cents, value of the stops marked complete */
  completedCents: number;
}

/**
 * Day totals are computed, never stored. These are the app's own operational
 * numbers from the schedule it owns, not accounting figures from QuickBooks.
 */
export function summarizeRoute(stops: RouteStop[]): RouteTotals {
  const completed = stops.filter((stop) => stop.status === "complete");

  return {
    stopCount: stops.length,
    completeCount: completed.length,
    scheduledCents: sumCents(
      stops.filter((stop) => stop.status !== "skipped").map((stop) => stop.price_cents),
    ),
    completedCents: sumCents(completed.map((stop) => stop.price_cents)),
  };
}

export const STATUS_LABELS: Record<JobStatus, string> = {
  scheduled: "Scheduled",
  en_route: "On the way",
  in_progress: "Mowing",
  complete: "Done",
  skipped: "Skipped",
  rain_delay: "Rain delay",
};
