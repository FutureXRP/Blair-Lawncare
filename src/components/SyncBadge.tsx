import { formatSyncedAt } from "@/lib/dates";
import type { SyncFreshness } from "@/lib/qbo-sync";
import { cx } from "@/components/ui";

/**
 * Every figure that came from QuickBooks says so, and says when it arrived.
 * When a sync fails the badge shows the last good time and turns orange rather
 * than letting a stale number pass as current.
 */
export function SyncBadge({
  freshness,
  className,
}: {
  freshness: SyncFreshness;
  className?: string;
}) {
  if (freshness.kind === "never") {
    return (
      <span className={cx("text-[0.6875rem] text-muted", className)}>
        From QuickBooks · not synced yet
      </span>
    );
  }

  if (freshness.kind === "fresh") {
    return (
      <span className={cx("text-[0.6875rem] text-muted", className)}>
        From QuickBooks · synced {formatSyncedAt(freshness.syncedAt)}
      </span>
    );
  }

  const lastGood = formatSyncedAt(freshness.lastGoodAt);
  return (
    <span
      className={cx("text-[0.6875rem] text-orange", className)}
      title={freshness.error ?? undefined}
    >
      {lastGood
        ? `From QuickBooks · sync failed, showing ${lastGood}`
        : "From QuickBooks · sync unavailable"}
    </span>
  );
}

/**
 * Stands in for a QBO number that cannot be shown. Never a zero, never a dash
 * styled like a value: an explicit statement that the figure is not available.
 */
export function SyncUnavailable({ label }: { label?: string }) {
  return (
    <span className="text-sm text-orange">{label ?? "Sync unavailable"}</span>
  );
}
