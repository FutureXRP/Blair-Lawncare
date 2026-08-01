"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { signIn, signUp, type AuthFormState } from "@/app/login/actions";
import { Button, Field, FormError, FormNotice, Input } from "@/components/ui";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Working" : label}
    </Button>
  );
}

export function LoginForm({
  next,
  initialMode,
}: {
  next: string;
  initialMode: "signin" | "signup";
}) {
  const [mode, setMode] = useState(initialMode);
  const action = mode === "signup" ? signUp : signIn;
  const [state, formAction] = useActionState<AuthFormState, FormData>(action, {});

  return (
    <div className="mt-6">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />

        {mode === "signup" ? (
          <Field label="Your name">
            <Input name="name" autoComplete="name" placeholder="Sam Blair" />
          </Field>
        ) : null}

        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>

        <Field
          label="Password"
          hint={mode === "signup" ? "At least 8 characters" : undefined}
        >
          <Input
            name="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
          />
        </Field>

        <FormError message={state.error} />
        <FormNotice message={state.notice} />

        <SubmitButton label={mode === "signup" ? "Create account" : "Sign in"} />
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        {mode === "signup" ? "Already set up?" : "First time here?"}{" "}
        <button
          type="button"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          className="font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.1em] text-cut underline-offset-2 hover:underline"
        >
          {mode === "signup" ? "Sign in" : "Create an account"}
        </button>
      </p>

      {mode === "signup" ? (
        <p className="mt-3 text-center text-xs text-muted">
          The first account to sign up becomes the owner. Everyone after that joins as crew.
        </p>
      ) : null}
    </div>
  );
}
