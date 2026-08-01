import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { startOfMonth, today } from "@/lib/dates";
import {
  QboNotConnectedError,
  fetchArAging,
  fetchInvoiceBalances,
  fetchOpenInvoices,
  fetchRevenueByItem,
  getConnection,
} from "@/lib/qbo";
import type { Database, QboSyncState, TableUpdate, Uuid } from "@/lib/types";

/**
 * Pulls the QuickBooks side of the picture into the local cache.
 *
 * Everything written here is a snapshot with a timestamp. On failure the last
 * good snapshot is kept and flagged as stale rather than overwritten with zeros,
 * because a zero that looks like data is worse than a warning that says so.
 */

type Db = SupabaseClient<Database>;

export interface SyncResult {
  status: "ok" | "error";
  syncedAt: string;
  openInvoiceCount?: number;
  error?: string;
}

export async function syncOrgFromQbo(db: Db, orgId: Uuid): Promise<SyncResult> {
  const startedAt = new Date().toISOString();

  try {
    const connection = await getConnection(db, orgId);

    const monthStart = startOfMonth(today());
    const [openInvoices, aging, revenueByItem] = await Promise.all([
      fetchOpenInvoices(connection),
      fetchArAging(connection),
      fetchRevenueByItem(connection, monthStart, today()),
    ]);

    // Reconcile paid status for invoices this app created.
    const { data: invoicedJobs } = await db
      .from("jobs")
      .select("id, qbo_invoice_id")
      .eq("org_id", orgId)
      .not("qbo_invoice_id", "is", null);

    const trackedIds = (invoicedJobs ?? [])
      .map((job) => job.qbo_invoice_id)
      .filter((id): id is string => Boolean(id));

    const balances = await fetchInvoiceBalances(connection, trackedIds);

    const completedAt = new Date().toISOString();
    const monthKey = monthStart.slice(0, 7);

    const update: TableUpdate<"qbo_sync_state"> = {
      last_sync_at: completedAt,
      last_sync_status: "ok",
      last_sync_error: null,
      last_good_sync_at: completedAt,
      ar_current_cents: aging.current_cents,
      ar_1_30_cents: aging.bucket_1_30_cents,
      ar_31_60_cents: aging.bucket_31_60_cents,
      ar_61_90_cents: aging.bucket_61_90_cents,
      ar_90_plus_cents: aging.bucket_90_plus_cents,
      ar_total_cents: aging.total_cents,
      open_invoices: openInvoices,
      revenue_by_item: { [monthKey]: revenueByItem },
      cursor: {
        started_at: startedAt,
        tracked_invoice_count: trackedIds.length,
        paid_invoice_count: [...balances.values()].filter((balance) => balance === 0).length,
      },
    };

    await upsertSyncState(db, orgId, update);

    return { status: "ok", syncedAt: completedAt, openInvoiceCount: openInvoices.length };
  } catch (cause) {
    const message =
      cause instanceof QboNotConnectedError
        ? "QuickBooks is not connected"
        : cause instanceof Error
          ? cause.message
          : "QuickBooks sync failed";

    const failedAt = new Date().toISOString();

    // Note the failure without touching the cached figures or last_good_sync_at.
    await upsertSyncState(db, orgId, {
      last_sync_at: failedAt,
      last_sync_status: "error",
      last_sync_error: message,
    });

    return { status: "error", syncedAt: failedAt, error: message };
  }
}

async function upsertSyncState(
  db: Db,
  orgId: Uuid,
  update: TableUpdate<"qbo_sync_state">,
): Promise<void> {
  const { data: existing } = await db
    .from("qbo_sync_state")
    .select("id")
    .eq("org_id", orgId)
    .maybeSingle();

  if (existing) {
    await db.from("qbo_sync_state").update(update).eq("org_id", orgId);
  } else {
    await db.from("qbo_sync_state").insert({ org_id: orgId, ...update });
  }
}

/** How the UI describes the freshness of a QBO figure. */
export type SyncFreshness =
  | { kind: "never" }
  | { kind: "fresh"; syncedAt: string }
  | { kind: "stale"; lastGoodAt: string | null; error: string | null };

export function readFreshness(state: QboSyncState | null): SyncFreshness {
  if (!state || !state.last_sync_at) return { kind: "never" };
  if (state.last_sync_status === "ok" && state.last_good_sync_at) {
    return { kind: "fresh", syncedAt: state.last_good_sync_at };
  }
  return {
    kind: "stale",
    lastGoodAt: state.last_good_sync_at,
    error: state.last_sync_error,
  };
}
