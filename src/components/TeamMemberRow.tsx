"use client";

import { useState, useTransition } from "react";

import { removeTeamMember, setTeamRole } from "@/app/actions/team";
import { Badge, Button, FormError, FormNotice, Select, cx } from "@/components/ui";
import {
  USER_ROLES,
  USER_ROLE_LABELS,
  hasFullAccess,
  type UserRole,
} from "@/lib/types";

/**
 * One person on the team. An admin can move anyone else to any role, admin
 * included, which is how the org hands over ownership. Nobody can change their
 * own role, so there is always at least one admin left.
 */
export function TeamMemberRow({
  userId,
  name,
  email,
  role,
  isSelf,
}: {
  userId: string;
  name: string;
  email: string | null;
  role: UserRole;
  isSelf: boolean;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [isPending, startTransition] = useTransition();

  function changeRole(nextRole: UserRole) {
    setNotice(null);
    setError(null);
    startTransition(async () => {
      const result = await setTeamRole(userId, nextRole);
      setNotice(result.notice ?? null);
      setError(result.error ?? null);
    });
  }

  function remove() {
    setNotice(null);
    setError(null);
    startTransition(async () => {
      const result = await removeTeamMember(userId);
      setNotice(result.notice ?? null);
      setError(result.error ?? null);
      setConfirmingRemove(false);
    });
  }

  return (
    <li className="route-divider px-4 py-3.5 last:border-b-0 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm uppercase text-ink">
            {name || "Unnamed"}
            {isSelf ? <span className="pl-2 text-xs normal-case text-muted">You</span> : null}
          </span>
          {email ? <span className="block text-xs text-muted">{email}</span> : null}
        </span>

        <span className="flex items-center gap-2">
          <Badge tone={hasFullAccess(role) ? "green" : "quiet"}>
            {USER_ROLE_LABELS[role]}
          </Badge>

          {isSelf ? null : (
            <>
              <Select
                aria-label={`Role for ${name}`}
                value={role}
                disabled={isPending}
                onChange={(event) => changeRole(event.target.value as UserRole)}
                className="w-auto py-1.5 text-xs"
              >
                {USER_ROLES.map((option) => (
                  <option key={option} value={option}>
                    {USER_ROLE_LABELS[option]}
                  </option>
                ))}
              </Select>

              {confirmingRemove ? (
                <span className="flex items-center gap-1.5">
                  <Button tone="alert" disabled={isPending} onClick={remove}>
                    Remove for good
                  </Button>
                  <Button
                    tone="ghost"
                    disabled={isPending}
                    onClick={() => setConfirmingRemove(false)}
                  >
                    Keep
                  </Button>
                </span>
              ) : (
                <Button
                  tone="ghost"
                  disabled={isPending}
                  onClick={() => setConfirmingRemove(true)}
                >
                  Remove
                </Button>
              )}
            </>
          )}
        </span>
      </div>

      <div className={cx((notice || error) && "mt-2.5")}>
        <FormNotice message={notice} />
        <FormError message={error} />
      </div>
    </li>
  );
}
