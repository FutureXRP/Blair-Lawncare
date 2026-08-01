"use client";

import { useTransition } from "react";

import { setRainRisk } from "@/app/actions/jobs";
import { cx } from "@/components/ui";

/**
 * Manual rain risk flag. A weather feed replaces this in Phase 2; for now the
 * owner sets it from what they can see out the window.
 */
export function RainRiskToggle({ enabled }: { enabled: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={enabled}
      disabled={isPending}
      onClick={() => startTransition(() => void setRainRisk(!enabled))}
      className={cx(
        "inline-flex items-center gap-2 rounded border px-3 py-2",
        "font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.1em]",
        "transition disabled:opacity-50",
        enabled
          ? "border-orange bg-orange/10 text-orange"
          : "border-line bg-card text-muted hover:border-cut hover:text-cut",
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "block h-2 w-2 rounded-full",
          enabled ? "bg-orange" : "bg-line",
        )}
      />
      {enabled ? "Rain risk on" : "Flag rain risk"}
    </button>
  );
}
