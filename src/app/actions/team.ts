"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { USER_ROLES, type UserRole } from "@/lib/types";
import type { FormState } from "@/app/actions/customers";

/**
 * Team accounts are created here, by an admin, not by anyone signing themselves
 * up. Creating an auth user needs the service role key, so all of this runs
 * server side against the admin client.
 *
 * The role travels in the new user's metadata and the handle_new_user trigger
 * turns it into their profile row, which means the role is set atomically with
 * the account rather than in a second write that could fail on its own.
 */

function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as string[]).includes(value);
}

export async function createTeamMember(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "staff");

  if (!email) return { error: "Enter an email address" };
  if (!name) return { error: "Enter a name" };
  if (password.length < 8) {
    return { error: "Set a starting password of at least 8 characters" };
  }
  if (!isUserRole(role)) return { error: "Pick a role" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      error:
        "SUPABASE_SERVICE_ROLE_KEY is not set, so accounts cannot be created from here",
    };
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    // Created by an admin who already knows who this is, so there is nothing to
    // confirm and no email has to be delivered for them to sign in.
    email_confirm: true,
    user_metadata: { name, role },
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("already") || message.includes("registered")) {
      return { error: "That email already has an account" };
    }
    return { error: error.message };
  }

  const supabase = await createClient();
  await supabase.from("activity_log").insert({
    org_id: session.org.id,
    actor: session.userId,
    event_type: "team.member_added",
    payload: { email, role },
  });

  revalidatePath("/settings");
  return {
    notice: `${name} can sign in now with the password you set. Pass it on to them directly.`,
  };
}

/**
 * Changes someone's role, including handing admin to another account. An admin
 * cannot change their own role, which is what guarantees the org never ends up
 * with nobody who can administer it.
 */
export async function setTeamRole(userId: string, role: UserRole): Promise<FormState> {
  const session = await requireAdmin();

  if (!isUserRole(role)) return { error: "That is not a role" };
  if (userId === session.userId) {
    return {
      error: "You cannot change your own role. Ask another admin to change it for you.",
    };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .eq("org_id", session.org.id);

  if (error) return { error: error.message };

  // Keep the auth metadata in step so the role survives a future rebuild of the
  // profile row from the trigger.
  try {
    await createAdminClient().auth.admin.updateUserById(userId, {
      user_metadata: { role },
    });
  } catch {
    // The profile row is the source of truth, so this is a best effort tidy up.
  }

  await supabase.from("activity_log").insert({
    org_id: session.org.id,
    actor: session.userId,
    event_type: "team.role_changed",
    payload: { user_id: userId, role },
  });

  revalidatePath("/settings");
  return { notice: `Role updated to ${role}` };
}

/** Removes someone's access entirely. Their history stays on the records. */
export async function removeTeamMember(userId: string): Promise<FormState> {
  const session = await requireAdmin();

  if (userId === session.userId) {
    return { error: "You cannot remove your own account" };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "SUPABASE_SERVICE_ROLE_KEY is not set, so accounts cannot be removed" };
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  const supabase = await createClient();
  await supabase.from("activity_log").insert({
    org_id: session.org.id,
    actor: session.userId,
    event_type: "team.member_removed",
    payload: { user_id: userId },
  });

  revalidatePath("/settings");
  return { notice: "Account removed" };
}
