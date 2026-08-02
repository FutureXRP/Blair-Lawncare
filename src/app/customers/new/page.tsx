import { AppShell } from "@/components/AppShell";
import { ActionForm } from "@/components/ActionForm";
import { Card, CardHeader, Field, Input, PageHeading, Select, Textarea } from "@/components/ui";
import { createCustomer } from "@/app/actions/customers";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewCustomerPage() {
  const session = await requireAdmin();

  return (
    <AppShell session={session}>
      <PageHeading
        title="Add a customer"
        subtitle="Their property can go in here too, so you only fill this out once."
      />

      <Card className="max-w-2xl">
        <CardHeader title="Customer" />
        <div className="px-4 py-5 sm:px-5">
          <ActionForm action={createCustomer} submitLabel="Add customer">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <Input name="name" required placeholder="Dana Whitfield" />
              </Field>
              <Field label="Status">
                <Select name="status" defaultValue="lead">
                  <option value="lead">Lead</option>
                  <option value="estimate">Estimate out</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </Select>
              </Field>
              <Field label="Email">
                <Input name="email" type="email" placeholder="dana@example.com" />
              </Field>
              <Field label="Phone">
                <Input name="phone" placeholder="(555) 214-8890" />
              </Field>
            </div>

            <Field label="Notes">
              <Textarea name="notes" placeholder="How they found you, billing preferences" />
            </Field>

            <div className="border-t border-line pt-4">
              <h3 className="eyebrow text-ink">Property</h3>
              <p className="mt-1 text-sm text-muted">
                Leave this blank if you do not have the address yet. You can add it later.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Street address">
                <Input name="address" placeholder="1420 Ridgeline Dr" />
              </Field>
              <Field label="City">
                <Input name="city" placeholder="Franklin" />
              </Field>
              <Field label="Label">
                <Input name="label" placeholder="Home" defaultValue="Home" />
              </Field>
              <Field label="Lot size" hint="Square feet, whole numbers">
                <Input name="lot_sqft" inputMode="numeric" placeholder="8400" />
              </Field>
              <Field label="Gate code">
                <Input name="gate_code" placeholder="4417" />
              </Field>
            </div>

            <Field
              label="Property notes"
              hint="Pets, sprinkler heads, where to park, anything the crew needs on site"
            >
              <Textarea
                name="property_notes"
                placeholder="Two dogs in the back yard. Latch the gate."
              />
            </Field>
          </ActionForm>
        </div>
      </Card>
    </AppShell>
  );
}
