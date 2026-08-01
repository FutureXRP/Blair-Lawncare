"use client";

import { useTransition } from "react";

import { setRecurringJobActive } from "@/app/actions/customers";
import { Button } from "@/components/ui";

export function RecurringToggle({ id, active }: { id: string; active: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      tone="secondary"
      disabled={isPending}
      onClick={() => startTransition(() => void setRecurringJobActive(id, !active))}
    >
      {active ? "Pause service" : "Resume service"}
    </Button>
  );
}
