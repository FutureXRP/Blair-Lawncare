import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  QboNotConnectedError,
  createInvoice,
  ensureQboCustomer,
  ensureQboItem,
  findInvoiceByPrivateNote,
  getConnection,
} from "@/lib/qbo";
import type { Database, Uuid } from "@/lib/types";

/**
 * Completing a job creates its invoice in QuickBooks.
 *
 * The job's own price_cents is the amount invoiced. It is never recomputed from
 * a rate card at completion time, so what the owner scheduled is what the
 * customer is billed.
 */

type Db = SupabaseClient<Database>;

export type InvoiceOutcome =
  | { kind: "created"; qboInvoiceId: string; totalCents: number }
  | { kind: "already_invoiced"; qboInvoiceId: string }
  | { kind: "deferred"; reason: string }
  | { kind: "failed"; reason: string };

/** Stable per job, which is what makes the duplicate check possible. */
function privateNoteForJob(jobId: Uuid): string {
  return `blairlawn:job:${jobId}`;
}

export async function invoiceCompletedJob(db: Db, jobId: Uuid): Promise<InvoiceOutcome> {
  const { data: job, error } = await db
    .from("jobs")
    .select("*, property:properties(id, address, city, customer_id), service:services(id, name)")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return { kind: "failed", reason: "Job was not found" };
  }
  if (job.qbo_invoice_id) {
    return { kind: "already_invoiced", qboInvoiceId: job.qbo_invoice_id };
  }
  if (job.status !== "complete") {
    return { kind: "deferred", reason: "Job is not complete yet" };
  }

  const property = job.property as unknown as {
    id: Uuid;
    address: string;
    city: string | null;
    customer_id: Uuid;
  } | null;
  const service = job.service as unknown as { id: Uuid; name: string } | null;

  if (!property || !service) {
    return { kind: "failed", reason: "Job is missing its property or service" };
  }

  const { data: org } = await db
    .from("orgs")
    .select("invoicing_mode")
    .eq("id", job.org_id)
    .single();

  if (org?.invoicing_mode === "monthly") {
    // Monthly batching invoices the whole customer at month end, so a single
    // completed job is intentionally left uninvoiced here.
    return { kind: "deferred", reason: "Invoicing is set to monthly batches" };
  }

  try {
    const connection = await getConnection(db, job.org_id);

    const privateNote = privateNoteForJob(job.id);
    const existingInvoiceId = await findInvoiceByPrivateNote(connection, privateNote);
    if (existingInvoiceId) {
      await db
        .from("jobs")
        .update({ qbo_invoice_id: existingInvoiceId, qbo_invoice_error: null })
        .eq("id", job.id);
      return { kind: "already_invoiced", qboInvoiceId: existingInvoiceId };
    }

    const [qboCustomerId, qboItemId] = await Promise.all([
      ensureQboCustomer(db, connection, property.customer_id),
      ensureQboItem(db, connection, service.id),
    ]);

    const invoice = await createInvoice(connection, {
      qboCustomerId,
      privateNote,
      lines: [
        {
          unitPriceCents: job.price_cents,
          quantity: 1,
          description: `${service.name} at ${property.address}${
            property.city ? `, ${property.city}` : ""
          } on ${job.scheduled_date}`,
          qboItemId,
        },
      ],
    });

    await db
      .from("jobs")
      .update({ qbo_invoice_id: invoice.id, qbo_invoice_error: null })
      .eq("id", job.id);

    await db.from("activity_log").insert({
      org_id: job.org_id,
      event_type: "qbo.invoice_created",
      payload: {
        job_id: job.id,
        qbo_invoice_id: invoice.id,
        amount_cents: job.price_cents,
      },
    });

    return { kind: "created", qboInvoiceId: invoice.id, totalCents: invoice.totalCents };
  } catch (cause) {
    const reason =
      cause instanceof QboNotConnectedError
        ? "QuickBooks is not connected"
        : cause instanceof Error
          ? cause.message
          : "QuickBooks request failed";

    // The job stays complete. The invoice is retried from the job row, and the
    // failure is visible rather than swallowed.
    await db.from("jobs").update({ qbo_invoice_error: reason }).eq("id", jobId);

    return { kind: "failed", reason };
  }
}
