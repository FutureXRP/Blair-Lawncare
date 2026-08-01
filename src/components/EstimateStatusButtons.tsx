"use client";

import { useState, useTransition } from "react";

import { setEstimateStatus } from "@/app/actions/estimates";
import { Button, FormNotice } from "@/components/ui";
import { nextEstimateActions } from "@/lib/estimates";
import type { EstimateStatus } from "@/lib/types";

export function EstimateStatusButtons({
  estimateId,
  status,
}: {
  estimateId: string;
  status: EstimateStatus;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const actions = nextEstimateActions(status);

  if (actions.length === 0 && !notice) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.status}
            tone={action.status === "accepted" ? "primary" : "secondary"}
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await setEstimateStatus(estimateId, action.status);
                setNotice(result.notice ?? result.error ?? null);
              })
            }
          >
            {action.label}
          </Button>
        ))}
      </div>
      <FormNotice message={notice} />
    </div>
  );
}
