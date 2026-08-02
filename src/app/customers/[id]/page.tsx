import { notFound } from "next/navigation";
import Link from "next/link";

import { createRecurringJob, saveProperty, updateCustomer } from "@/app/actions/customers";
import { ActionForm } from "@/components/ActionForm";
import { AppShell } from "@/components/AppShell";
import { RecurringToggle } from "@/components/RecurringToggle";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeading,
  Select,
  Textarea,
} from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { DAY_NAMES, formatIsoDate, today } from "@/lib/dates";
import { centsToInputValue, formatCents } from "@/lib/money";
import { STATUS_LABELS } from "@/lib/route";
import { createClient } from "@/lib/supabase/server";
import type { Frequency, Property, RecurringJob, Service } from "@/lib/types";

export const dynamic = "force-dynamic";

/** A uuid that matches nothing, so an empty "in" filter returns no rows. */
const NO_MATCH = "00000000-0000-0000-0000-000000000000";

const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: "Weekly",
  biweekly: "Every other week",
  monthly: "Monthly",
};

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAdmin();
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!customer) notFound();

  const { data: propertyRows } = await supabase
    .from("properties")
    .select("*")
    .eq("customer_id", id)
    .order("created_at");

  const properties = (propertyRows ?? []) as Property[];
  const propertyIdList =
    properties.length > 0 ? properties.map((property) => property.id) : [NO_MATCH];

  const [servicesResult, recurringResult, jobsResult] = await Promise.all([
    supabase.from("services").select("*").eq("org_id", session.org.id).order("name"),
    supabase
      .from("recurring_jobs")
      .select("*, property:properties(id, label, address), service:services(id, name)")
      .eq("org_id", session.org.id)
      .in("property_id", propertyIdList),
    supabase
      .from("jobs")
      .select("*, property:properties(customer_id), service:services(name)")
      .eq("org_id", session.org.id)
      .order("scheduled_date", { ascending: false })
      .limit(50),
  ]);

  const services = (servicesResult.data ?? []) as Service[];
  const recurringJobs = (recurringResult.data ?? []) as (RecurringJob & {
    property: { id: string; label: string; address: string } | null;
    service: { id: string; name: string } | null;
  })[];

  const propertyIds = new Set(properties.map((property) => property.id));
  const jobs = (jobsResult.data ?? []).filter((job) => propertyIds.has(job.property_id));

  return (
    <AppShell session={session}>
      <PageHeading
        title={customer.name}
        subtitle={
          <>
            {customer.email ? <span>{customer.email}</span> : null}
            {customer.email && customer.phone ? <span> · </span> : null}
            {customer.phone ? <span className="mono">{customer.phone}</span> : null}
          </>
        }
        action={
          <div className="flex items-center gap-2">
            {customer.qbo_customer_id ? (
              <Badge tone="green">Linked to QuickBooks</Badge>
            ) : (
              <Badge tone="quiet">Not in QuickBooks yet</Badge>
            )}
            <ButtonLink href="/customers" tone="secondary">
              All customers
            </ButtonLink>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Details" />
          <div className="px-4 py-5 sm:px-5">
            <ActionForm action={updateCustomer} submitLabel="Save customer">
              <input type="hidden" name="id" value={customer.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name">
                  <Input name="name" defaultValue={customer.name} required />
                </Field>
                <Field label="Status">
                  <Select name="status" defaultValue={customer.status}>
                    <option value="lead">Lead</option>
                    <option value="estimate">Estimate out</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="churned">Churned</option>
                  </Select>
                </Field>
                <Field label="Email">
                  <Input name="email" type="email" defaultValue={customer.email ?? ""} />
                </Field>
                <Field label="Phone">
                  <Input name="phone" defaultValue={customer.phone ?? ""} />
                </Field>
              </div>
              <Field label="Notes">
                <Textarea name="notes" defaultValue={customer.notes ?? ""} />
              </Field>
            </ActionForm>
          </div>
        </Card>

        <Card>
          <CardHeader title="Add a property" />
          <div className="px-4 py-5 sm:px-5">
            <ActionForm action={saveProperty} submitLabel="Add property">
              <input type="hidden" name="customer_id" value={customer.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Street address">
                  <Input name="address" required placeholder="1420 Ridgeline Dr" />
                </Field>
                <Field label="City">
                  <Input name="city" placeholder="Franklin" />
                </Field>
                <Field label="Label">
                  <Input name="label" defaultValue="Home" />
                </Field>
                <Field label="Lot size" hint="Square feet">
                  <Input name="lot_sqft" inputMode="numeric" />
                </Field>
                <Field label="Gate code">
                  <Input name="gate_code" />
                </Field>
              </div>
              <Field label="Property notes" hint="Pets, sprinklers, access, parking">
                <Textarea name="notes" />
              </Field>
            </ActionForm>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Properties" meta={`${properties.length}`} />
        {properties.length === 0 ? (
          <EmptyState headline="No property on file">
            Add the street address above so this customer can be put on a route.
          </EmptyState>
        ) : (
          <ul>
            {properties.map((property) => (
              <li key={property.id} className="route-divider px-4 py-4 last:border-b-0 sm:px-5">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="block text-base uppercase leading-tight text-ink">
                        {property.address}
                        {property.city ? `, ${property.city}` : ""}
                      </span>
                      <span className="block text-sm text-muted">
                        {property.label}
                        {property.lot_sqft
                          ? ` · ${property.lot_sqft.toLocaleString("en-US")} sq ft`
                          : ""}
                        {property.gate_code ? ` · gate ${property.gate_code}` : ""}
                      </span>
                    </span>
                    <span className="label">Edit</span>
                  </summary>

                  {property.notes ? (
                    <p className="mt-3 rounded border border-line bg-canvas px-3 py-2 text-sm text-ink">
                      {property.notes}
                    </p>
                  ) : null}

                  <div className="mt-4">
                    <ActionForm action={saveProperty} submitLabel="Save property" submitTone="secondary">
                      <input type="hidden" name="customer_id" value={customer.id} />
                      <input type="hidden" name="property_id" value={property.id} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Street address">
                          <Input name="address" defaultValue={property.address} required />
                        </Field>
                        <Field label="City">
                          <Input name="city" defaultValue={property.city ?? ""} />
                        </Field>
                        <Field label="Label">
                          <Input name="label" defaultValue={property.label} />
                        </Field>
                        <Field label="Lot size" hint="Square feet">
                          <Input
                            name="lot_sqft"
                            inputMode="numeric"
                            defaultValue={property.lot_sqft ?? ""}
                          />
                        </Field>
                        <Field label="Gate code">
                          <Input name="gate_code" defaultValue={property.gate_code ?? ""} />
                        </Field>
                      </div>
                      <Field label="Property notes">
                        <Textarea name="notes" defaultValue={property.notes ?? ""} />
                      </Field>
                    </ActionForm>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recurring services" meta={`${recurringJobs.length}`} />
          {recurringJobs.length === 0 ? (
            <EmptyState headline="No recurring service set">
              Set a weekly or biweekly mow below and it will fill onto the route when you
              generate the schedule.
            </EmptyState>
          ) : (
            <ul>
              {recurringJobs.map((recurring) => (
                <li
                  key={recurring.id}
                  className="route-divider flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 last:border-b-0 sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="block text-sm uppercase text-ink">
                      {recurring.service?.name ?? "Service"} ·{" "}
                      {FREQUENCY_LABELS[recurring.frequency]} on{" "}
                      {DAY_NAMES[recurring.day_of_week]}
                    </span>
                    <span className="block text-sm text-muted">
                      {recurring.property?.address ?? "Property"} ·{" "}
                      <span className="mono">{formatCents(recurring.price_cents)}</span> a visit
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {recurring.active ? (
                      <Badge tone="green">Active</Badge>
                    ) : (
                      <Badge tone="quiet">Paused</Badge>
                    )}
                    <RecurringToggle id={recurring.id} active={recurring.active} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Set a recurring service" />
          <div className="px-4 py-5 sm:px-5">
            {properties.length === 0 || services.length === 0 ? (
              <EmptyState headline="Not ready yet">
                {properties.length === 0
                  ? "Add a property first."
                  : "Add a service in Settings first, then come back here."}
              </EmptyState>
            ) : (
              <ActionForm action={createRecurringJob} submitLabel="Add recurring service">
                <input type="hidden" name="customer_id" value={customer.id} />
                <input type="hidden" name="anchor_date" value={today()} />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Property">
                    <Select name="property_id" required>
                      {properties.map((property) => (
                        <option key={property.id} value={property.id}>
                          {property.address}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Service">
                    <Select name="service_id" required>
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="How often">
                    <Select name="frequency" defaultValue="weekly">
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Every other week</option>
                      <option value="monthly">Monthly</option>
                    </Select>
                  </Field>
                  <Field label="Day">
                    <Select name="day_of_week" defaultValue="2">
                      {DAY_NAMES.map((day, index) => (
                        <option key={day} value={index}>
                          {day}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Price per visit" hint="Dollars, like 55 or 55.00">
                    <Input
                      name="price"
                      inputMode="decimal"
                      defaultValue={
                        services[0]
                          ? centsToInputValue(services[0].default_price_cents)
                          : "0.00"
                      }
                      required
                    />
                  </Field>
                  <Field label="Season start" hint="Optional">
                    <Input name="season_start" type="date" />
                  </Field>
                  <Field label="Season end" hint="Optional">
                    <Input name="season_end" type="date" />
                  </Field>
                </div>
              </ActionForm>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Job history" meta={`${jobs.length} most recent`} />
        {jobs.length === 0 ? (
          <EmptyState headline="No jobs yet">
            Once this customer has a recurring service and you generate the schedule, their
            stops will appear here.
          </EmptyState>
        ) : (
          <ul>
            {jobs.slice(0, 20).map((job) => {
              const service = job.service as unknown as { name?: string } | null;
              return (
                <li
                  key={job.id}
                  className="route-divider flex flex-wrap items-center justify-between gap-3 px-4 py-3 last:border-b-0 sm:px-5"
                >
                  <span>
                    <span className="mono text-muted">{formatIsoDate(job.scheduled_date)}</span>
                    <span className="pl-3 text-sm text-ink">{service?.name ?? "Service"}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    {job.qbo_invoice_id ? (
                      <Badge tone="green">Invoiced</Badge>
                    ) : job.status === "complete" ? (
                      <Badge tone="orange">No invoice</Badge>
                    ) : null}
                    <Badge tone="quiet">{STATUS_LABELS[job.status]}</Badge>
                    <span className="mono text-ink">{formatCents(job.price_cents)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="mt-6 text-sm text-muted">
        Payment status and invoice balances live in QuickBooks.{" "}
        <Link href="/settings" className="text-cut hover:underline">
          Check the connection
        </Link>
        .
      </p>
    </AppShell>
  );
}
