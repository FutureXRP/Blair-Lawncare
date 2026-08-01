"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth";
import { DEFAULT_HORIZON_DAYS, generateJobs } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/app/actions/customers";

/**
 * Fills the schedule two weeks out. Idempotent, so pressing it twice in a row
 * is harmless and says so.
 */
export async function generateSchedule(
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const session = await requireOwner();
  const supabase = await createClient();

  try {
    const result = await generateJobs(supabase, session.org.id, {
      horizonDays: DEFAULT_HORIZON_DAYS,
    });

    revalidatePath("/schedule");
    revalidatePath("/route");
    revalidatePath("/");

    if (result.created === 0) {
      return {
        notice:
          result.skippedExisting > 0
            ? "The schedule is already filled through the next two weeks"
            : "No active recurring services, so there was nothing to schedule",
      };
    }

    return {
      notice: `Added ${result.created} ${result.created === 1 ? "stop" : "stops"} through ${result.windowEnd}`,
    };
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause.message : "Could not generate the schedule",
    };
  }
}
