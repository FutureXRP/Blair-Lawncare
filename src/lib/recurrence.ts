import { addDays, dayOfWeek, daysBetween, fromIsoDate } from "@/lib/dates";
import type { RecurringJob } from "@/lib/types";

/**
 * When a recurring job falls due.
 *
 * Pure calendar arithmetic, kept apart from the database so the cadence rules
 * can be reasoned about and tested on their own.
 */

type IsoDate = string;

/** Which occurrence of its weekday a date is within its month. 1 to 5. */
function weekdayOrdinal(iso: IsoDate): number {
  const dayOfMonth = fromIsoDate(iso).getUTCDate();
  return Math.floor((dayOfMonth - 1) / 7) + 1;
}

/** The last date in the same month with the same weekday. */
function lastWeekdayOfMonth(iso: IsoDate): IsoDate {
  let candidate = iso;
  const month = iso.slice(0, 7);
  while (addDays(candidate, 7).slice(0, 7) === month) {
    candidate = addDays(candidate, 7);
  }
  return candidate;
}

/** Shifts the anchor forward to the first date matching `targetDayOfWeek`. */
function alignAnchor(anchor: IsoDate, targetDayOfWeek: number): IsoDate {
  const offset = (targetDayOfWeek - dayOfWeek(anchor) + 7) % 7;
  return addDays(anchor, offset);
}

export function occurrencesInWindow(
  recurring: Pick<
    RecurringJob,
    "frequency" | "day_of_week" | "anchor_date" | "season_start" | "season_end"
  >,
  windowStart: IsoDate,
  windowEnd: IsoDate,
): IsoDate[] {
  const anchor = alignAnchor(recurring.anchor_date, recurring.day_of_week);

  // First candidate on or after the window start that lands on the right day.
  const startOffset = (recurring.day_of_week - dayOfWeek(windowStart) + 7) % 7;
  let candidate = addDays(windowStart, startOffset);

  const dates: IsoDate[] = [];

  while (candidate <= windowEnd) {
    if (isInSeason(candidate, recurring.season_start, recurring.season_end)) {
      switch (recurring.frequency) {
        case "weekly": {
          dates.push(candidate);
          break;
        }
        case "biweekly": {
          // Both dates share a weekday, so the gap is always a multiple of 7.
          if (Math.abs(daysBetween(anchor, candidate)) % 14 === 0) dates.push(candidate);
          break;
        }
        case "monthly": {
          const target = weekdayOrdinal(anchor);
          const ordinal = weekdayOrdinal(candidate);
          const isFallbackForShortMonth =
            ordinal < target && lastWeekdayOfMonth(candidate) === candidate;
          if (ordinal === target || isFallbackForShortMonth) dates.push(candidate);
          break;
        }
      }
    }
    candidate = addDays(candidate, 7);
  }

  return dates;
}

function isInSeason(
  iso: IsoDate,
  seasonStart: string | null,
  seasonEnd: string | null,
): boolean {
  if (seasonStart && iso < seasonStart) return false;
  if (seasonEnd && iso > seasonEnd) return false;
  return true;
}
