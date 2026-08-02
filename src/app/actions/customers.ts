"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { parseDollarsToCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { CustomerStatus, Frequency, PricingUnit } from "@/lib/types";

export interface FormState {
  error?: string;
  notice?: string;
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value === "" ? null : value;
}

function optionalInteger(formData: FormData, key: string): number | null {
  const value = text(formData, key).replace(/,/g, "");
  if (value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export async function createCustomer(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();
  const supabase = await createClient();

  const name = text(formData, "name");
  if (!name) return { error: "Give the customer a name" };

  const { data: customer, error } = await supabase
    .from("customers")
    .insert({
      org_id: session.org.id,
      name,
      email: optionalText(formData, "email"),
      phone: optionalText(formData, "phone"),
      status: (text(formData, "status") || "lead") as CustomerStatus,
      notes: optionalText(formData, "notes"),
    })
    .select("id")
    .single();

  if (error || !customer) return { error: error?.message ?? "Could not save the customer" };

  // A customer with an address gets its property in the same step, because a
  // customer with nowhere to mow is not useful yet.
  const address = text(formData, "address");
  if (address) {
    const { error: propertyError } = await supabase.from("properties").insert({
      org_id: session.org.id,
      customer_id: customer.id,
      label: text(formData, "label") || "Home",
      address,
      city: optionalText(formData, "city"),
      lot_sqft: optionalInteger(formData, "lot_sqft"),
      gate_code: optionalText(formData, "gate_code"),
      notes: optionalText(formData, "property_notes"),
    });
    if (propertyError) return { error: propertyError.message };
  }

  revalidatePath("/customers");
  redirect(`/customers/${customer.id}`);
}

export async function updateCustomer(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const supabase = await createClient();

  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!id) return { error: "Missing customer" };
  if (!name) return { error: "Give the customer a name" };

  const { error } = await supabase
    .from("customers")
    .update({
      name,
      email: optionalText(formData, "email"),
      phone: optionalText(formData, "phone"),
      status: text(formData, "status") as CustomerStatus,
      notes: optionalText(formData, "notes"),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/customers/${id}`);
  revalidatePath("/customers");
  return { notice: "Customer saved" };
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

export async function saveProperty(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();
  const supabase = await createClient();

  const customerId = text(formData, "customer_id");
  const propertyId = optionalText(formData, "property_id");
  const address = text(formData, "address");

  if (!customerId) return { error: "Missing customer" };
  if (!address) return { error: "Give the property a street address" };

  const values = {
    label: text(formData, "label") || "Home",
    address,
    city: optionalText(formData, "city"),
    lot_sqft: optionalInteger(formData, "lot_sqft"),
    gate_code: optionalText(formData, "gate_code"),
    notes: optionalText(formData, "notes"),
  };

  const { error } = propertyId
    ? await supabase.from("properties").update(values).eq("id", propertyId)
    : await supabase
        .from("properties")
        .insert({ org_id: session.org.id, customer_id: customerId, ...values });

  if (error) return { error: error.message };

  revalidatePath(`/customers/${customerId}`);
  return { notice: propertyId ? "Property saved" : "Property added" };
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export async function createService(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();
  const supabase = await createClient();

  const name = text(formData, "name");
  if (!name) return { error: "Give the service a name" };

  const priceCents = parseDollarsToCents(text(formData, "default_price"));
  if (priceCents === null || priceCents < 0) {
    return { error: "Enter a price like 55 or 55.00" };
  }

  const { error } = await supabase.from("services").insert({
    org_id: session.org.id,
    name,
    default_price_cents: priceCents,
    pricing_unit: (text(formData, "pricing_unit") || "per_visit") as PricingUnit,
  });

  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { notice: "Service added" };
}

// ---------------------------------------------------------------------------
// Recurring jobs
// ---------------------------------------------------------------------------

export async function createRecurringJob(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();
  const supabase = await createClient();

  const propertyId = text(formData, "property_id");
  const serviceId = text(formData, "service_id");
  const customerId = text(formData, "customer_id");

  if (!propertyId || !serviceId) return { error: "Pick a property and a service" };

  const priceCents = parseDollarsToCents(text(formData, "price"));
  if (priceCents === null || priceCents < 0) {
    return { error: "Enter a price like 55 or 55.00" };
  }

  const dayOfWeek = Number.parseInt(text(formData, "day_of_week"), 10);
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return { error: "Pick a day of the week" };
  }

  const { error } = await supabase.from("recurring_jobs").insert({
    org_id: session.org.id,
    property_id: propertyId,
    service_id: serviceId,
    frequency: (text(formData, "frequency") || "weekly") as Frequency,
    day_of_week: dayOfWeek,
    price_cents: priceCents,
    active: true,
    season_start: optionalText(formData, "season_start"),
    season_end: optionalText(formData, "season_end"),
    anchor_date: optionalText(formData, "anchor_date") ?? undefined,
  });

  if (error) return { error: error.message };

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/schedule");
  return { notice: "Recurring service added. Generate the schedule to see the stops." };
}

export async function setRecurringJobActive(
  recurringJobId: string,
  active: boolean,
): Promise<FormState> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("recurring_jobs")
    .update({ active })
    .eq("id", recurringJobId);

  if (error) return { error: error.message };

  revalidatePath("/customers");
  revalidatePath("/schedule");
  return { notice: active ? "Service resumed" : "Service paused" };
}
