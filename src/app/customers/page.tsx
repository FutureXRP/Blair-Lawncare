import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeading } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CustomerStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<CustomerStatus, string> = {
  lead: "Lead",
  estimate: "Estimate out",
  active: "Active",
  paused: "Paused",
  churned: "Churned",
};

const STATUS_ORDER: CustomerStatus[] = ["active", "estimate", "lead", "paused", "churned"];

export default async function CustomersPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: customers } = await supabase
    .from("customers")
    .select("*, properties(id, label, address, city)")
    .eq("org_id", session.org.id)
    .order("name", { ascending: true });

  const rows = customers ?? [];
  const byStatus = STATUS_ORDER.map((status) => ({
    status,
    customers: rows.filter((customer) => customer.status === status),
  })).filter((group) => group.customers.length > 0);

  return (
    <AppShell session={session}>
      <PageHeading
        title="Customers"
        subtitle={`${rows.length} on the books`}
        action={
          session.isOwner ? <ButtonLink href="/customers/new">Add a customer</ButtonLink> : null
        }
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            headline="No customers yet"
            action={
              session.isOwner ? (
                <ButtonLink href="/customers/new">Add a customer</ButtonLink>
              ) : null
            }
          >
            Add the first customer with their property, then set a recurring service so their
            stops start showing up on the route.
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {byStatus.map((group) => (
            <Card key={group.status}>
              <CardHeader
                title={STATUS_LABELS[group.status]}
                meta={`${group.customers.length}`}
              />
              <ul>
                {group.customers.map((customer) => {
                  const properties = (customer.properties ?? []) as unknown as {
                    id: string;
                    label: string;
                    address: string;
                    city: string | null;
                  }[];

                  return (
                    <li key={customer.id} className="route-divider last:border-b-0">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition hover:bg-canvas sm:px-5"
                      >
                        <span className="min-w-0">
                          <span className="block text-base uppercase leading-tight text-ink">
                            {customer.name}
                          </span>
                          <span className="block text-sm text-muted">
                            {properties.length === 0
                              ? "No property on file"
                              : properties
                                  .map((property) =>
                                    property.city
                                      ? `${property.address}, ${property.city}`
                                      : property.address,
                                  )
                                  .join(" · ")}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          {customer.phone ? (
                            <span className="mono text-muted">{customer.phone}</span>
                          ) : null}
                          <Badge tone={customer.status === "active" ? "green" : "quiet"}>
                            {STATUS_LABELS[customer.status]}
                          </Badge>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
