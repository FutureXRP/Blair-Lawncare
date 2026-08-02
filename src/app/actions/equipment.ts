"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { parseDollarsToCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { EquipmentCategory } from "@/lib/types";
import type { FormState } from "@/app/actions/customers";

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalNumber(formData: FormData, key: string): number | null {
  const value = text(formData, key);
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createEquipment(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();
  const supabase = await createClient();

  const name = text(formData, "name");
  if (!name) return { error: "Give the machine a name" };

  const engineHours = optionalNumber(formData, "engine_hours") ?? 0;
  const interval = optionalNumber(formData, "service_interval_hours");

  const { error } = await supabase.from("equipment").insert({
    org_id: session.org.id,
    name,
    category: (text(formData, "category") || "other") as EquipmentCategory,
    engine_hours: engineHours,
    service_interval_hours: interval === null ? null : Math.round(interval),
    last_service_hours: engineHours,
    notes: text(formData, "notes") || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/equipment");
  return { notice: "Equipment added" };
}

export async function updateEngineHours(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const supabase = await createClient();

  const id = text(formData, "id");
  const hours = optionalNumber(formData, "engine_hours");

  if (!id) return { error: "Missing equipment" };
  if (hours === null || hours < 0) return { error: "Enter the hours on the meter" };

  const { error } = await supabase
    .from("equipment")
    .update({ engine_hours: hours })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/equipment");
  revalidatePath("/");
  return { notice: "Hours updated" };
}

/**
 * Records service and resets the interval baseline to the hours on the meter,
 * which is what clears the machine off the Needs attention panel.
 */
export async function logMaintenance(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();
  const supabase = await createClient();

  const equipmentId = text(formData, "equipment_id");
  const description = text(formData, "description");

  if (!equipmentId) return { error: "Missing equipment" };
  if (!description) return { error: "Say what was done" };

  const costInput = text(formData, "cost");
  const costCents = costInput === "" ? 0 : parseDollarsToCents(costInput);
  if (costCents === null || costCents < 0) {
    return { error: "Enter a cost like 85 or 85.00, or leave it blank" };
  }

  const { data: equipment } = await supabase
    .from("equipment")
    .select("engine_hours")
    .eq("id", equipmentId)
    .single();

  const { error } = await supabase.from("maintenance_log").insert({
    org_id: session.org.id,
    equipment_id: equipmentId,
    description,
    cost_cents: costCents,
    performed_at: new Date().toISOString(),
  });

  if (error) return { error: error.message };

  await supabase
    .from("equipment")
    .update({
      last_service_at: new Date().toISOString(),
      last_service_hours: equipment?.engine_hours ?? 0,
    })
    .eq("id", equipmentId);

  revalidatePath("/equipment");
  revalidatePath("/");
  return { notice: "Service logged" };
}
