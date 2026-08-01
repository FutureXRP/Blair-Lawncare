import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Org, Profile } from "@/lib/types";

export interface Session {
  userId: string;
  email: string | null;
  profile: Profile;
  org: Org;
  isOwner: boolean;
}

/** Returns null when nobody is signed in. */
export async function getSession(): Promise<Session | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  const { data: org } = await supabase
    .from("orgs")
    .select("*")
    .eq("id", profile.org_id)
    .single();
  if (!org) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    profile,
    org,
    isOwner: profile.role === "owner",
  };
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Guards the financial screens. Row Level Security already blocks crew from
 * reading the underlying tables; this turns that into a clear redirect instead
 * of an empty page.
 */
export async function requireOwner(): Promise<Session> {
  const session = await requireSession();
  if (!session.isOwner) redirect("/route");
  return session;
}
