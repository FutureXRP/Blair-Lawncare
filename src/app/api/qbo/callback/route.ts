import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";

import { getSession } from "@/lib/auth";
import { completeOAuthCallback } from "@/lib/qbo";
import { syncOrgFromQbo } from "@/lib/qbo-sync";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "qbo_oauth_state";

function settingsRedirect(request: NextRequest, message: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("qbo", message);
  return NextResponse.redirect(url);
}

/** Finishes the QuickBooks OAuth flow and runs a first sync. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  if (!session.isOwner) return settingsRedirect(request, "owner_only");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  const state = request.nextUrl.searchParams.get("state");
  const realmId = request.nextUrl.searchParams.get("realmId");
  const error = request.nextUrl.searchParams.get("error");

  if (error) return settingsRedirect(request, "denied");
  if (!state || !expectedState || state !== expectedState) {
    return settingsRedirect(request, "state_mismatch");
  }
  if (!state.startsWith(`${session.org.id}.`)) {
    return settingsRedirect(request, "state_mismatch");
  }
  if (!realmId) return settingsRedirect(request, "no_realm");

  const supabase = await createClient();

  try {
    await completeOAuthCallback(supabase, session.org.id, request.url, realmId);
  } catch (cause) {
    console.error("QuickBooks callback failed", cause);
    return settingsRedirect(request, "token_exchange_failed");
  }

  // Pull a first snapshot so the dashboard has real figures right away.
  await syncOrgFromQbo(supabase, session.org.id);

  return settingsRedirect(request, "connected");
}
