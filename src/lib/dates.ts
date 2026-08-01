/**
 * Date helpers. Scheduling works in plain calendar dates ("2026-08-01"), never
 * timestamps, so a job never drifts across a day boundary because of a timezone.
 */

export type IsoDate = string;

const DAY_MS = 24 * 60 * 60 * 1000;

export function toIsoDate(date: Date): IsoDate {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromIsoDate(iso: IsoDate): Date {
  const [year, month, day] = iso.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return toIsoDate(new Date(fromIsoDate(iso).getTime() + days * DAY_MS));
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((fromIsoDate(to).getTime() - fromIsoDate(from).getTime()) / DAY_MS);
}

/** 0 = Sunday, matching Postgres `extract(dow)` and JS `getUTCDay`. */
export function dayOfWeek(iso: IsoDate): number {
  return fromIsoDate(iso).getUTCDay();
}

/** Monday of the week containing `iso`. Weeks run Monday to Sunday. */
export function startOfWeek(iso: IsoDate): IsoDate {
  const dow = dayOfWeek(iso);
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDays(iso, offset);
}

export function endOfWeek(iso: IsoDate): IsoDate {
  return addDays(startOfWeek(iso), 6);
}

export function startOfMonth(iso: IsoDate): IsoDate {
  return `${iso.slice(0, 7)}-01`;
}

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const DAY_ABBREVIATIONS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function formatIsoDate(iso: IsoDate): string {
  const date = fromIsoDate(iso);
  const month = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${DAY_ABBREVIATIONS[date.getUTCDay()]} ${month} ${date.getUTCDate()}`;
}

export function formatIsoDateLong(iso: IsoDate): string {
  const date = fromIsoDate(iso);
  const month = date.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return `${DAY_NAMES[date.getUTCDay()]}, ${month} ${date.getUTCDate()}`;
}

/** Clock time for the route list, rendered in mono. */
export function formatClock(timestamp: string | null | undefined): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(" ", " ")
    .toLowerCase();
}

export function formatSyncedAt(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function hoursSince(timestamp: string | null | undefined): number | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return (Date.now() - date.getTime()) / (60 * 60 * 1000);
}

/** Today in the org's operating timezone. Single tenant, so one setting. */
export function today(timeZone = process.env.APP_TIME_ZONE ?? "America/Chicago"): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
}
