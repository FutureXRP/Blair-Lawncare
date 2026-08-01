"use client";

import { useTransition } from "react";

import { setTeamRole } from "@/app/actions/settings";
import { Button } from "@/components/ui";
import type { UserRole } from "@/lib/types";

export function TeamRoleToggle({ userId, role }: { userId: string; role: UserRole }) {
  const [isPending, startTransition] = useTransition();
  const nextRole: UserRole = role === "owner" ? "crew" : "owner";

  return (
    <Button
      tone="secondary"
      disabled={isPending}
      onClick={() => startTransition(() => void setTeamRole(userId, nextRole))}
    >
      {role === "owner" ? "Set to crew" : "Make owner"}
    </Button>
  );
}
