import Link from "next/link";

import { SyncBadge } from "@/components/SyncBadge";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import type { AttentionItem } from "@/lib/dashboard";
import type { SyncFreshness } from "@/lib/qbo-sync";

const KIND_LABELS: Record<AttentionItem["kind"], string> = {
  overdue_invoice: "Overdue",
  stale_estimate: "Estimate",
  equipment_service: "Service",
  rain_risk: "Rain",
};

/**
 * Orange lives here. Everything in this panel is something the owner has to act
 * on, which is the only thing orange is ever used for.
 */
export function NeedsAttention({
  items,
  freshness,
}: {
  items: AttentionItem[];
  freshness: SyncFreshness;
}) {
  return (
    <Card>
      <CardHeader
        title="Needs attention"
        meta={items.length > 0 ? `${items.length} open` : undefined}
        action={
          items.some((item) => item.fromQbo) ? <SyncBadge freshness={freshness} /> : null
        }
      />

      {items.length === 0 ? (
        <EmptyState headline="Nothing is waiting on you">
          Overdue invoices, estimates that went quiet, and equipment past its service hours
          show up here. Keep working the route.
        </EmptyState>
      ) : (
        <ul>
          {items.map((item) => {
            const body = (
              <>
                <div className="flex items-start gap-2.5">
                  <Badge tone="orange" className="mt-0.5 shrink-0">
                    {KIND_LABELS[item.kind]}
                  </Badge>
                  <span className="min-w-0">
                    <span className="block text-sm text-ink">{item.headline}</span>
                    <span className="block text-xs text-muted">{item.detail}</span>
                  </span>
                </div>
              </>
            );

            return (
              <li key={item.id} className="route-divider last:border-b-0">
                {item.href ? (
                  <Link
                    href={item.href}
                    className="block px-4 py-3 transition hover:bg-canvas sm:px-5"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="px-4 py-3 sm:px-5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
