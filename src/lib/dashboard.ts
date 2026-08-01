import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { endOfWeek, hoursSince, startOfWeek, today } from "@/lib/dates";
import { sumCents } from "@/lib/money";
import { readFreshness, type SyncFreshness } from "@/lib/qbo-sync";
import type { Database, Equipment, OpenInvoice, QboSyncState, Uuid } from "@/lib/types";

type Db = SupabaseClient<Database>;

/** Hours a sent estimate can sit after being viewed before it needs a nudge. */
export const STALE_ESTIMATE_HOURS = 48;

export interface WeekProgress {
  weekStart: string;
  weekEnd: string;
  jobsScheduled: number;
  jobsComplete: number;
  /** integer cents, value of jobs completed this week per the schedule */
  completedCents: number;
  /** integer cents, value of every job on the week's schedule */
  scheduledCents: number;
  /** integer cents, 0 when no target is set */
  targetCents: number;
}

export interface AttentionItem {
  id: string;
  kind: "overdue_invoice" | "stale_estimate" | "equipment_service" | "rain_risk";
  headline: string;
  detail: string;
  href?: string;
  /** Only set for QuickBooks sourced items. */
  fromQbo?: boolean;
}

export interface DashboardData {
  week: WeekProgress;
  estimates: { pendingCount: number; pendingCents: number };
  qbo: {
    connected: boolean;
    freshness: SyncFreshness;
    /** null means the figure is not available, which the UI states outright. */
    outstandingCents: number | null;
    openInvoiceCount: number | null;
    overdueInvoices: OpenInvoice[];
  };
  attention: AttentionItem[];
}

export async function loadDashboard(
  db: Db,
  orgId: Uuid,
  options: { qboConnected: boolean; rainRisk: boolean; weeklyTargetCents: number },
): Promise<DashboardData> {
  const currentDate = today();
  const weekStart = startOfWeek(currentDate);
  const weekEnd = endOfWeek(currentDate);

  const [jobsResult, estimatesResult, equipmentResult, syncResult] = await Promise.all([
    db
      .from("jobs")
      .select("id, status, price_cents")
      .eq("org_id", orgId)
      .gte("scheduled_date", weekStart)
      .lte("scheduled_date", weekEnd),
    db
      .from("estimates")
      .select("id, status, total_cents, viewed_at, sent_at, customer:customers(name)")
      .eq("org_id", orgId)
      .in("status", ["sent", "viewed"]),
    db.from("equipment").select("*").eq("org_id", orgId),
    db.from("qbo_sync_state").select("*").eq("org_id", orgId).maybeSingle(),
  ]);

  const jobs = jobsResult.data ?? [];
  const completedJobs = jobs.filter((job) => job.status === "complete");

  const week: WeekProgress = {
    weekStart,
    weekEnd,
    jobsScheduled: jobs.filter((job) => job.status !== "skipped").length,
    jobsComplete: completedJobs.length,
    completedCents: sumCents(completedJobs.map((job) => job.price_cents)),
    scheduledCents: sumCents(
      jobs.filter((job) => job.status !== "skipped").map((job) => job.price_cents),
    ),
    targetCents: options.weeklyTargetCents,
  };

  const pendingEstimates = estimatesResult.data ?? [];
  const syncState = (syncResult.data ?? null) as QboSyncState | null;
  const freshness = readFreshness(syncState);
  const hasSnapshot = Boolean(syncState?.last_good_sync_at);

  const openInvoices = hasSnapshot ? (syncState?.open_invoices ?? []) : [];
  const overdueInvoices = openInvoices
    .filter((invoice) => invoice.days_overdue > 0)
    .sort((left, right) => right.days_overdue - left.days_overdue);

  const attention: AttentionItem[] = [];

  for (const invoice of overdueInvoices.slice(0, 5)) {
    attention.push({
      id: `invoice-${invoice.qbo_invoice_id}`,
      kind: "overdue_invoice",
      headline: `${invoice.customer_name ?? "Customer"} is ${invoice.days_overdue} days past due`,
      detail: `Invoice ${invoice.doc_number ?? invoice.qbo_invoice_id}`,
      fromQbo: true,
    });
  }

  for (const estimate of pendingEstimates) {
    if (estimate.status !== "viewed") continue;
    const hours = hoursSince(estimate.viewed_at);
    if (hours === null || hours < STALE_ESTIMATE_HOURS) continue;

    const customer = estimate.customer as unknown as { name?: string } | null;
    attention.push({
      id: `estimate-${estimate.id}`,
      kind: "stale_estimate",
      headline: `${customer?.name ?? "Customer"} opened an estimate and has not replied`,
      detail: `Viewed ${Math.floor(hours / 24)} days ago`,
      href: `/estimates/${estimate.id}`,
    });
  }

  for (const item of equipmentResult.data ?? []) {
    const dueIn = hoursUntilService(item);
    if (dueIn === null || dueIn > 0) continue;
    attention.push({
      id: `equipment-${item.id}`,
      kind: "equipment_service",
      headline: `${item.name} is due for service`,
      detail: `${Math.abs(Math.round(dueIn))} hours past the ${item.service_interval_hours} hour interval`,
      href: "/equipment",
    });
  }

  if (options.rainRisk) {
    attention.push({
      id: "rain-risk",
      kind: "rain_risk",
      headline: "Rain risk is flagged for today",
      detail: "Move the stops that cannot be cut wet, or mark them as a rain delay",
      href: "/route",
    });
  }

  return {
    week,
    estimates: {
      pendingCount: pendingEstimates.length,
      pendingCents: sumCents(pendingEstimates.map((estimate) => estimate.total_cents)),
    },
    qbo: {
      connected: options.qboConnected,
      freshness,
      outstandingCents: hasSnapshot ? (syncState?.ar_total_cents ?? null) : null,
      openInvoiceCount: hasSnapshot ? openInvoices.length : null,
      overdueInvoices,
    },
    attention,
  };
}

/**
 * Hours left before a machine hits its service interval. Negative means it is
 * already past due. Null when the equipment has no interval set.
 */
export function hoursUntilService(item: Equipment): number | null {
  if (!item.service_interval_hours) return null;
  const baseline = item.last_service_hours ?? 0;
  const hoursRun = Number(item.engine_hours) - Number(baseline);
  return item.service_interval_hours - hoursRun;
}
