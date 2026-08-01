import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { addDays, today } from "@/lib/dates";
import { occurrencesInWindow } from "@/lib/recurrence";
import type { Database, TableInsert, Uuid } from "@/lib/types";

/**
 * Turns recurring jobs into concrete `jobs` rows.
 *
 * The generator is idempotent: it reads what already exists in the window and
 * inserts only what is missing, and the database backs that up with a unique
 * index on (recurring_job_id, scheduled_date). Running it twice, or ten times,
 * produces the same schedule. It never edits or deletes a job that already
 * exists, so a job the owner moved or repriced by hand stays moved and repriced.
 */

type Db = SupabaseClient<Database>;
type IsoDate = string;

export const DEFAULT_HORIZON_DAYS = 14;

export interface GenerationResult {
  windowStart: IsoDate;
  windowEnd: IsoDate;
  created: number;
  skippedExisting: number;
}

/**
 * Fills the schedule from `startDate` forward for `horizonDays`.
 * Safe to re-run at any time, from a cron or from the Schedule screen.
 */
export async function generateJobs(
  db: Db,
  orgId: Uuid,
  options: { startDate?: IsoDate; horizonDays?: number } = {},
): Promise<GenerationResult> {
  const windowStart = options.startDate ?? today();
  const horizonDays = options.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const windowEnd = addDays(windowStart, horizonDays - 1);

  const { data: recurringJobs, error: recurringError } = await db
    .from("recurring_jobs")
    .select("*")
    .eq("org_id", orgId)
    .eq("active", true);

  if (recurringError) throw new Error(recurringError.message);
  if (!recurringJobs || recurringJobs.length === 0) {
    return { windowStart, windowEnd, created: 0, skippedExisting: 0 };
  }

  const { data: existingJobs, error: existingError } = await db
    .from("jobs")
    .select("id, recurring_job_id, scheduled_date, route_order")
    .eq("org_id", orgId)
    .gte("scheduled_date", windowStart)
    .lte("scheduled_date", windowEnd);

  if (existingError) throw new Error(existingError.message);

  const existingKeys = new Set(
    (existingJobs ?? [])
      .filter((job) => job.recurring_job_id)
      .map((job) => `${job.recurring_job_id}:${job.scheduled_date}`),
  );

  // Next route position per day, so generated stops land after anything the
  // owner already placed on that day.
  const nextRouteOrder = new Map<IsoDate, number>();
  for (const job of existingJobs ?? []) {
    const current = nextRouteOrder.get(job.scheduled_date) ?? 0;
    nextRouteOrder.set(job.scheduled_date, Math.max(current, job.route_order + 1));
  }

  const rows: TableInsert<"jobs">[] = [];
  let skippedExisting = 0;

  for (const recurring of recurringJobs) {
    for (const date of occurrencesInWindow(recurring, windowStart, windowEnd)) {
      const key = `${recurring.id}:${date}`;
      if (existingKeys.has(key)) {
        skippedExisting += 1;
        continue;
      }
      existingKeys.add(key);

      const routeOrder = nextRouteOrder.get(date) ?? 0;
      nextRouteOrder.set(date, routeOrder + 1);

      rows.push({
        org_id: orgId,
        property_id: recurring.property_id,
        recurring_job_id: recurring.id,
        service_id: recurring.service_id,
        scheduled_date: date,
        route_order: routeOrder,
        status: "scheduled",
        price_cents: recurring.price_cents,
      });
    }
  }

  if (rows.length === 0) {
    return { windowStart, windowEnd, created: 0, skippedExisting };
  }

  const { data: inserted, error: insertError } = await db
    .from("jobs")
    .insert(rows)
    .select("id");

  if (insertError) {
    // 23505 is the unique index doing its job when two generators overlap.
    // Nothing is wrong and nothing is lost, so report zero new rows.
    if (insertError.code === "23505") {
      return { windowStart, windowEnd, created: 0, skippedExisting: skippedExisting + rows.length };
    }
    throw new Error(insertError.message);
  }

  return {
    windowStart,
    windowEnd,
    created: inserted?.length ?? 0,
    skippedExisting,
  };
}
