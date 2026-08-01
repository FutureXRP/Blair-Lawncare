"use client";

import { useState, useTransition } from "react";

import { disconnectQuickBooks, syncQboNow } from "@/app/actions/settings";
import { Button, FormError, FormNotice } from "@/components/ui";

export function QboActions({ connected }: { connected: boolean }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ notice?: string; error?: string }>) {
    setNotice(null);
    setError(null);
    startTransition(async () => {
      const result = await action();
      setNotice(result.notice ?? null);
      setError(result.error ?? null);
    });
  }

  if (!connected) {
    return (
      <div className="flex flex-col gap-3">
        <a
          href="/api/qbo/connect"
          className="inline-flex w-fit items-center justify-center gap-2 rounded border border-cut bg-cut px-3.5 py-2 font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.1em] text-white transition hover:brightness-105"
        >
          Connect QuickBooks
        </a>
        <p className="text-sm text-muted">
          You will be sent to Intuit to authorize, then brought straight back here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button disabled={isPending} onClick={() => run(syncQboNow)}>
          Sync now
        </Button>
        <Button
          tone="secondary"
          disabled={isPending}
          onClick={() => run(disconnectQuickBooks)}
        >
          Disconnect
        </Button>
      </div>
      <FormNotice message={notice} />
      <FormError message={error} />
    </div>
  );
}
