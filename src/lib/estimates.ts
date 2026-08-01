import { multiplyCents, sumCents } from "@/lib/money";
import type { EstimateLineItem, EstimateStatus } from "@/lib/types";

/** Estimate total in integer cents. Quantities are whole units. */
export function totalForLines(items: EstimateLineItem[]): number {
  return sumCents(items.map((item) => multiplyCents(item.price_cents, item.qty)));
}

export const ESTIMATE_STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
};

/** What the owner can do next with an estimate in a given state. */
export function nextEstimateActions(
  status: EstimateStatus,
): { status: EstimateStatus; label: string }[] {
  switch (status) {
    case "draft":
      return [{ status: "sent", label: "Mark sent" }];
    case "sent":
      return [
        { status: "viewed", label: "Mark viewed" },
        { status: "accepted", label: "Mark accepted" },
        { status: "declined", label: "Mark declined" },
      ];
    case "viewed":
      return [
        { status: "accepted", label: "Mark accepted" },
        { status: "declined", label: "Mark declined" },
      ];
    default:
      return [];
  }
}
