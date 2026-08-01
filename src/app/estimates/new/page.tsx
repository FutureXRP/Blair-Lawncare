import { createEstimate } from "@/app/actions/estimates";
import { ActionForm } from "@/components/ActionForm";
import { AppShell } from "@/components/AppShell";
import { EstimateLineEditor } from "@/components/EstimateLineEditor";
import { ButtonLink, Card, CardHeader, EmptyState, Field, PageHeading, Select } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { centsToInputValue } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewEstimatePage() {
  const session = await requireOwner();
  const supabase = await createClient();

  const [customersResult, servicesResult] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name")
      .eq("org_id", session.org.id)
      .order("name"),
    supabase
      .from("services")
      .select("id, name, default_price_cents")
      .eq("org_id", session.org.id)
      .order("name"),
  ]);

  const customers = customersResult.data ?? [];
  const services = (servicesResult.data ?? []).map((service) => ({
    id: service.id,
    name: service.name,
    defaultPrice: centsToInputValue(service.default_price_cents),
  }));

  return (
    <AppShell session={session}>
      <PageHeading
        title="Write an estimate"
        subtitle="Lines are priced in whole cents. The total on screen is the total that gets saved."
        action={
          <ButtonLink href="/estimates" tone="secondary">
            All estimates
          </ButtonLink>
        }
      />

      <Card>
        <CardHeader title="Estimate" />
        <div className="px-4 py-5 sm:px-5">
          {customers.length === 0 ? (
            <EmptyState
              headline="No customers yet"
              action={<ButtonLink href="/customers/new">Add a customer</ButtonLink>}
            >
              An estimate goes to a customer, so add one first.
            </EmptyState>
          ) : (
            <ActionForm action={createEstimate} submitLabel="Save as draft">
              <div className="max-w-sm">
                <Field label="Customer">
                  <Select name="customer_id" required>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <EstimateLineEditor services={services} />

              {services.length === 0 ? (
                <p className="text-sm text-muted">
                  You have no services set up yet. Custom lines work fine, but a line has to be
                  tied to a service before the estimate can be mirrored into QuickBooks.
                </p>
              ) : null}
            </ActionForm>
          )}
        </div>
      </Card>
    </AppShell>
  );
}
