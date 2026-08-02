"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { parseDollarsToCents } from "@/lib/money";
import { disconnectQbo } from "@/lib/qbo";
import { syncOrgFromQbo } from "@/lib/qbo-sync";
import { createClient } from "@/lib/supabase/server";
import type { InvoicingMode } from "@/lib/types";
import type { FormState } from "@/app/actions/customers";

export async function updateOrgSettings(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the business a name" };

  const targetInput = String(formData.get("weekly_revenue_target") ?? "").trim();
  const targetCents = targetInput === "" ? 0 : parseDollarsToCents(targetInput);
  if (targetCents === null || targetCents < 0) {
    return { error: "Enter a weekly target like 2500 or 2500.00, or leave it blank" };
  }

  const { error } = await supabase
    .from("orgs")
    .update({
      name,
      weekly_revenue_target_cents: targetCents,
      invoicing_mode: String(formData.get("invoicing_mode") ?? "per_job") as InvoicingMode,
    })
    .eq("id", session.org.id);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/");
  return { notice: "Settings saved" };
}

/** Pulls a fresh snapshot from QuickBooks on demand. */
export async function syncQboNow(): Promise<FormState> {
  const session = await requireAdmin();
  const supabase = await createClient();

  const result = await syncOrgFromQbo(supabase, session.org.id);

  revalidatePath("/settings");
  revalidatePath("/");

  return result.status === "ok"
    ? { notice: `Synced ${result.openInvoiceCount ?? 0} open invoices from QuickBooks` }
    : { error: result.error ?? "Sync failed" };
}

export async function disconnectQuickBooks(): Promise<FormState> {
  const session = await requireAdmin();
  const supabase = await createClient();

  await disconnectQbo(supabase, session.org.id);

  revalidatePath("/settings");
  revalidatePath("/");
  return { notice: "QuickBooks disconnected. Cached figures stop updating." };
}
