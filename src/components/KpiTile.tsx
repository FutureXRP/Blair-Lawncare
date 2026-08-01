import type { ReactNode } from "react";

import { cx } from "@/components/ui";

/**
 * A KPI tile. The number is condensed and tracked; the source line underneath
 * says where the figure came from. A tile whose figure is unavailable says so in
 * words instead of showing a zero.
 */
export function KpiTile({
  label,
  value,
  unavailable,
  source,
  detail,
  progress,
  tone = "ink",
}: {
  label: string;
  value?: ReactNode;
  /** Shown in place of the value when the figure cannot be produced. */
  unavailable?: string;
  source?: ReactNode;
  detail?: ReactNode;
  /** 0 to 1. Renders the fresh-cut progress bar. */
  progress?: number | null;
  tone?: "ink" | "orange";
}) {
  return (
    <div className="card flex flex-col gap-1 px-4 py-3.5">
      <span className="label">{label}</span>

      {unavailable ? (
        <span className="pt-0.5 text-sm text-orange">{unavailable}</span>
      ) : (
        <span
          className={cx(
            "numeric text-3xl leading-none",
            tone === "orange" ? "text-orange" : "text-ink",
          )}
        >
          {value}
        </span>
      )}

      {progress !== undefined && progress !== null ? (
        <span
          className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-line"
          role="presentation"
        >
          <span
            className="block h-full rounded-full bg-cut transition-[width]"
            style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
          />
        </span>
      ) : null}

      {detail ? <span className="mt-1 text-xs text-muted">{detail}</span> : null}
      {source ? <span className="mt-0.5">{source}</span> : null}
    </div>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}
