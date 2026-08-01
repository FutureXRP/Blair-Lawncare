import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";

import { getSession } from "@/lib/auth";
import { isEncryptionConfigured } from "@/lib/crypto";
import { buildAuthorizeUrl, readQboConfig } from "@/lib/qbo";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "qbo_oauth_state";

function settingsRedirect(request: NextRequest, message: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("qbo", message);
  return NextResponse.redirect(url);
}

/** Starts the QuickBooks OAuth flow. Owner only. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  if (!session.isOwner) return settingsRedirect(request, "owner_only");

  if (!readQboConfig()) return settingsRedirect(request, "not_configured");
  if (!isEncryptionConfigured()) return settingsRedirect(request, "no_encryption_key");

  // The state ties the callback back to this browser and this org.
  const nonce = randomBytes(16).toString("base64url");
  const state = `${session.org.id}.${nonce}`;

  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return NextResponse.redirect(buildAuthorizeUrl(state));
}
