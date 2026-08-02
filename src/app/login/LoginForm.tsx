"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signIn, type AuthFormState } from "@/app/login/actions";
import { Button, Field, FormError, Input } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Signing in" : "Sign in"}
    </Button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(signIn, {});

  return (
    <div className="mt-6">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />

        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>

        <Field label="Password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>

        <FormError message={state.error} />

        <SubmitButton />
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        Accounts are set up by an admin. Ask them to add you, or to reset your password.
      </p>
    </div>
  );
}
