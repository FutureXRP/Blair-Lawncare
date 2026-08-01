"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button, FormError, FormNotice, cx } from "@/components/ui";

export interface ActionFormState {
  error?: string;
  notice?: string;
}

type ServerAction = (
  state: ActionFormState,
  formData: FormData,
) => Promise<ActionFormState>;

function SubmitButton({ label, tone }: { label: string; tone?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tone={tone} disabled={pending}>
      {pending ? "Saving" : label}
    </Button>
  );
}

/**
 * Wraps a server action with its own pending, error and success state so every
 * form on the site behaves the same way and says what happened.
 */
export function ActionForm({
  action,
  submitLabel,
  submitTone,
  className,
  footer,
  children,
}: {
  action: ServerAction;
  submitLabel: string;
  submitTone?: "primary" | "secondary";
  className?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState<ActionFormState, FormData>(action, {});

  return (
    <form action={formAction} className={cx("flex flex-col gap-4", className)}>
      {children}
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label={submitLabel} tone={submitTone} />
        {footer}
      </div>
    </form>
  );
}
