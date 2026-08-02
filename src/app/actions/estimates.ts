"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { totalForLines } from "@/lib/estimates";
import { parseDollarsToCents } from "@/lib/money";
import {
  QboNotConnectedError,
  createEstimateMirror,
  ensureQboCustomer,
  ensureQboItem,
  getConnection,
} from "@/lib/qbo";
import { createClient } from "@/lib/supabase/server";
import type { EstimateLineItem, EstimateStatus, TableUpdate } from "@/lib/types";
import type { FormState } from "@/app/actions/customers";

interface SubmittedLine {
  service_id?: string | null;
  description?: string;
  qty?: string | number;
  price?: string;
}

/** Parses the line item editor's JSON payload into integer cents. */
function parseLineItems(raw: string): { items: EstimateLineItem[]; error?: string } {
  let parsed: SubmittedLine[];
  try {
    parsed = JSON.parse(raw) as SubmittedLine[];
  } catch {
    return { items: [], error: "Could not read the line items" };
  }

  const items: EstimateLineItem[] = [];

  for (const line of parsed) {
    const description = String(line.description ?? "").trim();
    if (!description) continue;

    const priceCents = parseDollarsToCents(String(line.price ?? ""));
    if (priceCents === null || priceCents < 0) {
      return { items: [], error: `Enter a price for "${description}" like 55 or 55.00` };
    }

    const qty = Number.parseInt(String(line.qty ?? "1"), 10);
    if (!Number.isInteger(qty) || qty < 1) {
      return { items: [], error: `Enter a whole quantity for "${description}"` };
    }

    items.push({
      service_id: line.service_id ? String(line.service_id) : null,
      description,
      qty,
      price_cents: priceCents,
    });
  }

  if (items.length === 0) return { items: [], error: "Add at least one line" };
  return { items };
}

export async function createEstimate(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();
  const supabase = await createClient();

  const customerId = String(formData.get("customer_id") ?? "");
  if (!customerId) return { error: "Pick a customer" };

  const { items, error: linesError } = parseLineItems(
    String(formData.get("line_items") ?? "[]"),
  );
  if (linesError) return { error: linesError };

  const propertyId = String(formData.get("property_id") ?? "").trim();

  const { data: estimate, error } = await supabase
    .from("estimates")
    .insert({
      org_id: session.org.id,
      customer_id: customerId,
      property_id: propertyId === "" ? null : propertyId,
      status: "draft",
      line_items: items,
      total_cents: totalForLines(items),
    })
    .select("id")
    .single();

  if (error || !estimate) return { error: error?.message ?? "Could not save the estimate" };

  revalidatePath("/estimates");
  redirect(`/estimates/${estimate.id}`);
}

/**
 * Moves an estimate along its lifecycle. The app owns this lifecycle; accepting
 * one optionally mirrors it into QuickBooks.
 */
export async function setEstimateStatus(
  estimateId: string,
  status: EstimateStatus,
): Promise<FormState> {
  const session = await requireAdmin();
  const supabase = await createClient();

  const now = new Date().toISOString();
  const update: TableUpdate<"estimates"> = { status };

  if (status === "sent") update.sent_at = now;
  if (status === "viewed") update.viewed_at = now;
  if (status === "accepted" || status === "declined") update.decided_at = now;

  const { error } = await supabase.from("estimates").update(update).eq("id", estimateId);
  if (error) return { error: error.message };

  let notice = `Estimate marked ${status}`;

  if (status === "accepted") {
    const mirror = await mirrorEstimateToQbo(estimateId);
    if (mirror.error) notice = `Estimate accepted. Not mirrored to QuickBooks: ${mirror.error}`;
    else notice = "Estimate accepted and mirrored to QuickBooks";

    // An accepted estimate means this is a real customer now.
    const { data: estimate } = await supabase
      .from("estimates")
      .select("customer_id")
      .eq("id", estimateId)
      .single();
    if (estimate) {
      await supabase
        .from("customers")
        .update({ status: "active" })
        .eq("id", estimate.customer_id)
        .eq("org_id", session.org.id);
    }
  }

  revalidatePath("/estimates");
  revalidatePath(`/estimates/${estimateId}`);
  revalidatePath("/");
  return { notice };
}

async function mirrorEstimateToQbo(estimateId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: estimate } = await supabase
    .from("estimates")
    .select("*")
    .eq("id", estimateId)
    .single();

  if (!estimate) return { error: "Estimate was not found" };
  if (estimate.qbo_estimate_id) return {};

  try {
    const connection = await getConnection(supabase, estimate.org_id);
    const qboCustomerId = await ensureQboCustomer(supabase, connection, estimate.customer_id);

    const lines = [];
    for (const item of estimate.line_items) {
      if (!item.service_id) {
        return { error: "Every line needs a service before it can go to QuickBooks" };
      }
      lines.push({
        unitPriceCents: item.price_cents,
        quantity: item.qty,
        description: item.description,
        qboItemId: await ensureQboItem(supabase, connection, item.service_id),
      });
    }

    const mirrored = await createEstimateMirror(connection, {
      qboCustomerId,
      lines,
      privateNote: `blairlawn:estimate:${estimate.id}`,
    });

    await supabase
      .from("estimates")
      .update({ qbo_estimate_id: mirrored.id })
      .eq("id", estimateId);

    return {};
  } catch (cause) {
    if (cause instanceof QboNotConnectedError) return { error: "QuickBooks is not connected" };
    return { error: cause instanceof Error ? cause.message : "QuickBooks request failed" };
  }
}
