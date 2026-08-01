import { NextResponse, type NextRequest } from "next/server";

import { syncOrgFromQbo } from "@/lib/qbo-sync";
import { generateJobs } from "@/lib/schedule";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled sync. Vercel cron calls this every 30 minutes during business hours
 * (see vercel.json). It pulls payment status, AR aging and revenue by item from
 * QuickBooks, and tops the schedule back up to two weeks out.
 *
 * Runs with no user, so it uses the service role client and is protected by
 * CRON_SECRET rather than a session.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authorization = request.headers.get("authorization");
    if (authorization !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "CRON_SECRET is not set, refusing to run unauthenticated" },
      { status: 500 },
    );
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Supabase is not configured" },
      { status: 500 },
    );
  }

  const { data: orgs, error } = await supabase.from("orgs").select("id, qbo_realm_id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = [];

  for (const org of orgs ?? []) {
    const schedule = await generateJobs(supabase, org.id).catch((cause: unknown) => ({
      created: 0,
      error: cause instanceof Error ? cause.message : "Schedule generation failed",
    }));

    const sync = org.qbo_realm_id
      ? await syncOrgFromQbo(supabase, org.id)
      : { status: "skipped" as const, reason: "QuickBooks is not connected" };

    results.push({ org_id: org.id, schedule, sync });
  }

  return NextResponse.json({ ran_at: new Date().toISOString(), results });
}
