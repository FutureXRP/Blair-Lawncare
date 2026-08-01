import { createEquipment, logMaintenance, updateEngineHours } from "@/app/actions/equipment";
import { ActionForm } from "@/components/ActionForm";
import { AppShell } from "@/components/AppShell";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeading,
  Select,
  Textarea,
} from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { hoursUntilService } from "@/lib/dashboard";
import { formatCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Equipment, EquipmentCategory, MaintenanceLogEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  mower: "Mower",
  trimmer: "Trimmer",
  blower: "Blower",
  truck: "Truck",
  trailer: "Trailer",
  other: "Other",
};

function formatHours(hours: number): string {
  return Number(hours).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export default async function EquipmentPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: equipmentRows } = await supabase
    .from("equipment")
    .select("*")
    .eq("org_id", session.org.id)
    .order("category")
    .order("name");

  const equipment = (equipmentRows ?? []) as Equipment[];

  // Maintenance cost is financial, so crew never reads the log.
  const maintenance = session.isOwner
    ? (
        await supabase
          .from("maintenance_log")
          .select("*")
          .eq("org_id", session.org.id)
          .order("performed_at", { ascending: false })
          .limit(30)
      ).data ?? []
    : ([] as MaintenanceLogEntry[]);

  return (
    <AppShell session={session}>
      <PageHeading
        title="Equipment"
        subtitle="Engine hours drive the service reminders on the dashboard."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="The fleet" meta={`${equipment.length} items`} />
            {equipment.length === 0 ? (
              <EmptyState headline="Nothing on the list yet">
                {session.isOwner
                  ? "Add the mower, trimmer and truck so their service hours are tracked."
                  : "The owner has not added any equipment yet."}
              </EmptyState>
            ) : (
              <ul>
                {equipment.map((item) => {
                  const remaining = hoursUntilService(item);
                  const overdue = remaining !== null && remaining <= 0;
                  const dueSoon = remaining !== null && remaining > 0 && remaining <= 10;

                  return (
                    <li
                      key={item.id}
                      className="route-divider px-4 py-4 last:border-b-0 sm:px-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-base uppercase leading-tight text-ink">
                            {item.name}
                          </h3>
                          <p className="text-sm text-muted">
                            {CATEGORY_LABELS[item.category]} ·{" "}
                            <span className="mono">{formatHours(item.engine_hours)}</span> hours
                            {item.service_interval_hours
                              ? ` · service every ${item.service_interval_hours}`
                              : " · no service interval set"}
                          </p>
                          {item.notes ? (
                            <p className="mt-1 text-sm text-muted">{item.notes}</p>
                          ) : null}
                        </div>

                        {overdue ? (
                          <Badge tone="orange">
                            {Math.abs(Math.round(remaining))} hours past due
                          </Badge>
                        ) : dueSoon ? (
                          <Badge tone="orange">Due in {Math.round(remaining)} hours</Badge>
                        ) : remaining !== null ? (
                          <Badge tone="green">{Math.round(remaining)} hours left</Badge>
                        ) : (
                          <Badge tone="quiet">Not tracked</Badge>
                        )}
                      </div>

                      {session.isOwner ? (
                        <details className="mt-3">
                          <summary className="label cursor-pointer">Update or log service</summary>
                          <div className="mt-3 grid gap-4 sm:grid-cols-2">
                            <ActionForm
                              action={updateEngineHours}
                              submitLabel="Save hours"
                              submitTone="secondary"
                            >
                              <input type="hidden" name="id" value={item.id} />
                              <Field label="Hours on the meter">
                                <Input
                                  name="engine_hours"
                                  inputMode="decimal"
                                  defaultValue={String(item.engine_hours)}
                                />
                              </Field>
                            </ActionForm>

                            <ActionForm
                              action={logMaintenance}
                              submitLabel="Log service"
                              submitTone="secondary"
                            >
                              <input type="hidden" name="equipment_id" value={item.id} />
                              <Field label="What was done">
                                <Input name="description" placeholder="Oil and filter change" />
                              </Field>
                              <Field label="Cost" hint="Optional. Dollars, like 85.00">
                                <Input name="cost" inputMode="decimal" />
                              </Field>
                            </ActionForm>
                          </div>
                        </details>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {session.isOwner && maintenance.length > 0 ? (
            <Card>
              <CardHeader title="Recent service" meta={`${maintenance.length} entries`} />
              <ul>
                {maintenance.map((entry) => {
                  const machine = equipment.find((item) => item.id === entry.equipment_id);
                  return (
                    <li
                      key={entry.id}
                      className="route-divider flex flex-wrap items-center justify-between gap-2 px-4 py-3 last:border-b-0 sm:px-5"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm text-ink">{entry.description}</span>
                        <span className="block text-xs text-muted">
                          {machine?.name ?? "Equipment"} ·{" "}
                          {new Date(entry.performed_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </span>
                      <span className="mono text-ink">{formatCents(entry.cost_cents)}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}
        </div>

        {session.isOwner ? (
          <Card className="self-start">
            <CardHeader title="Add equipment" />
            <div className="px-4 py-5 sm:px-5">
              <ActionForm action={createEquipment} submitLabel="Add equipment">
                <Field label="Name">
                  <Input name="name" required placeholder="Scag Turf Tiger" />
                </Field>
                <Field label="Category">
                  <Select name="category" defaultValue="mower">
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Hours on the meter">
                  <Input name="engine_hours" inputMode="decimal" defaultValue="0" />
                </Field>
                <Field
                  label="Service interval"
                  hint="Hours between services. Leave blank for a truck or trailer."
                >
                  <Input name="service_interval_hours" inputMode="numeric" placeholder="100" />
                </Field>
                <Field label="Notes">
                  <Textarea name="notes" placeholder="Blades sharpened monthly" />
                </Field>
              </ActionForm>
            </div>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
