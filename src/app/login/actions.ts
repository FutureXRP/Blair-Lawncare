"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export interface AuthFormState {
  error?: string;
}

/**
 * Signing in is the only thing this screen does.
 *
 * There is no public signup. Accounts are created by an admin from the Team
 * panel in Settings. Removing the form is not what enforces that: the anon key
 * is public, so anyone could call signUp against the project directly. Signups
 * have to be switched off in the Supabase dashboard as well, under
 * Authentication, Sign In / Providers, Email.
 */
export async function signIn(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!email || !password) {
    return { error: "Enter your email and password" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "That email and password do not match an account" };
  }

  revalidatePath("/", "layout");
  redirect(next.startsWith("/") ? next : "/");
}
