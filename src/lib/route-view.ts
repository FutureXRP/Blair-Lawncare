import type { RouteStopView } from "@/components/RouteList";
import type { RouteStop } from "@/lib/types";

/**
 * Flattens a route stop for the client component. Without full access the
 * price is dropped here rather than hidden with CSS, so it never reaches the
 * browser at all.
 */
export function toRouteStopView(stop: RouteStop, canSeeMoney: boolean): RouteStopView {
  return {
    id: stop.id,
    status: stop.status,
    priceCents: canSeeMoney ? stop.price_cents : null,
    serviceName: stop.service.name,
    customerName: stop.customer.name,
    customerPhone: stop.customer.phone,
    propertyLabel: stop.property.label,
    address: stop.property.address,
    city: stop.property.city,
    gateCode: stop.property.gate_code,
    notes: stop.property.notes,
    startedAt: stop.started_at,
    completedAt: stop.completed_at,
    completionNotes: stop.completion_notes,
    invoiceId: canSeeMoney ? stop.qbo_invoice_id : null,
    invoiceError: canSeeMoney ? stop.qbo_invoice_error : null,
  };
}
