"use server";

import { revalidatePath } from "next/cache";

import { requireOwner, requireSession } from "@/lib/auth";
import { invoiceCompletedJob } from "@/lib/invoicing";
import { createClient } from "@/lib/supabase/server";
import type { JobStatus, TableUpdate } from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const VALID_STATUSES: JobStatus[] = [
  "scheduled",
  "en_route",
  "in_progress",
  "complete",
  "skipped",
  "rain_delay",
];

/**
 * Moves a job through the day. Completing a job also creates its QuickBooks
 * invoice; if QBO is unreachable the job still completes and the failure is
 * recorded on the job so it can be retried.
 */
export async function setJobStatus(
  jobId: string,
  status: JobStatus,
  completionNotes?: string,
): Promise<ActionResult> {
  await requireSession();

  if (!VALID_STATUSES.includes(status)) {
    return { ok: false, message: "That is not a job status" };
  }

  const supabase = await createClient();

  const update: TableUpdate<"jobs"> = { status };

  if (status === "in_progress" || status === "en_route") {
    update.started_at = new Date().toISOString();
  }
  if (status === "complete") {
    update.completed_at = new Date().toISOString();
    if (completionNotes !== undefined) update.completion_notes = completionNotes;
  }
  if (status === "scheduled") {
    update.started_at = null;
    update.completed_at = null;
  }

  const { error } = await supabase.from("jobs").update(update).eq("id", jobId);
  if (error) return { ok: false, message: error.message };

  let message: string | undefined;

  if (status === "complete") {
    const outcome = await invoiceCompletedJob(supabase, jobId);
    if (outcome.kind === "failed") {
      message = `Job marked done. Invoice not created: ${outcome.reason}`;
    } else if (outcome.kind === "deferred") {
      message = `Job marked done. ${outcome.reason}`;
    }
  }

  revalidatePath("/");
  revalidatePath("/route");
  return { ok: true, message };
}

/** Retries the QuickBooks invoice for a job that completed while QBO was down. */
export async function retryJobInvoice(jobId: string): Promise<ActionResult> {
  await requireOwner();
  const supabase = await createClient();

  const outcome = await invoiceCompletedJob(supabase, jobId);

  revalidatePath("/");
  revalidatePath("/route");

  switch (outcome.kind) {
    case "created":
      return { ok: true, message: "Invoice created in QuickBooks" };
    case "already_invoiced":
      return { ok: true, message: "This job already has an invoice" };
    case "deferred":
      return { ok: false, message: outcome.reason };
    case "failed":
      return { ok: false, message: outcome.reason };
  }
}

/** Persists a new stop order for one day. */
export async function reorderRoute(
  date: string,
  orderedJobIds: string[],
): Promise<ActionResult> {
  const session = await requireOwner();
  const supabase = await createClient();

  for (const [index, jobId] of orderedJobIds.entries()) {
    const { error } = await supabase
      .from("jobs")
      .update({ route_order: index })
      .eq("id", jobId)
      .eq("org_id", session.org.id)
      .eq("scheduled_date", date);

    if (error) return { ok: false, message: error.message };
  }

  revalidatePath("/");
  revalidatePath("/route");
  return { ok: true };
}

export async function setRainRisk(rainRisk: boolean): Promise<ActionResult> {
  const session = await requireOwner();
  const supabase = await createClient();

  const { error } = await supabase
    .from("orgs")
    .update({ rain_risk: rainRisk })
    .eq("id", session.org.id);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  revalidatePath("/route");
  return { ok: true };
}
