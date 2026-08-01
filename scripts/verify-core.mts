/**
 * Checks the two pieces of logic that have to be right before anything else
 * matters: the integer cents money path, and the recurring schedule cadence.
 *
 * Run with: npm run verify
 */

import {
  centsToInputValue,
  centsToQboAmount,
  formatCents,
  formatCentsCompact,
  multiplyCents,
  parseDollarsToCents,
  qboAmountToCents,
  sumCents,
} from "../src/lib/money.ts";
import { addDays, endOfWeek, startOfWeek } from "../src/lib/dates.ts";
import { occurrencesInWindow } from "../src/lib/recurrence.ts";

let failures = 0;
let checks = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  checks += 1;
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  if (!same) {
    failures += 1;
    console.error(`FAIL  ${label}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
  }
}

function throws(label: string, run: () => unknown): void {
  checks += 1;
  try {
    run();
    failures += 1;
    console.error(`FAIL  ${label}\n      expected it to throw`);
  } catch {
    // Expected.
  }
}

// --- Money -----------------------------------------------------------------

check("parse whole dollars", parseDollarsToCents("85"), 8500);
check("parse dollars and cents", parseDollarsToCents("85.50"), 8550);
check("parse one decimal place", parseDollarsToCents("85.5"), 8550);
check("parse with symbols", parseDollarsToCents("$1,250.00"), 125000);
check("parse leading decimal", parseDollarsToCents(".99"), 99);
check("parse negative", parseDollarsToCents("-12.34"), -1234);
check("reject empty", parseDollarsToCents(""), null);
check("reject words", parseDollarsToCents("free"), null);
check("reject three decimals", parseDollarsToCents("10.005"), null);

check("format", formatCents(1234567), "$12,345.67");
check("format under a dollar", formatCents(7), "$0.07");
check("format zero", formatCents(0), "$0.00");
check("format negative", formatCents(-8550), "-$85.50");
check("format compact rounds half up", formatCentsCompact(1234550), "$12,346");
check("format compact rounds down", formatCentsCompact(1234549), "$12,345");
check("input value", centsToInputValue(8505), "85.05");

check("sum", sumCents([5500, 6500, 8500]), 20500);
check("multiply", multiplyCents(900, 300), 270000);
throws("sum rejects a float", () => sumCents([55.5]));
throws("multiply rejects a fractional quantity", () => multiplyCents(900, 1.5));

// The QBO boundary, both directions.
check("cents to QBO amount", centsToQboAmount(8550), 85.5);
check("cents to QBO amount, sub dollar", centsToQboAmount(7), 0.07);
check("QBO amount to cents", qboAmountToCents(85.5), 8550);
check("QBO amount to cents from string", qboAmountToCents("85.50"), 8550);
check("QBO float noise rounds correctly", qboAmountToCents(85.29999999999999), 8530);
check("QBO third decimal rounds half up", qboAmountToCents("10.005"), 1001);
check("QBO null is zero", qboAmountToCents(null), 0);

// A full round trip on a realistic week must not drift by a single cent.
const weekPrices = [5500, 6500, 8500, 5500, 7250, 4995, 12000];
const weekTotal = sumCents(weekPrices);
const roundTripped = sumCents(
  weekPrices.map((price) => qboAmountToCents(centsToQboAmount(price))),
);
check("week round trips through QBO exactly", roundTripped, weekTotal);

// --- Dates -----------------------------------------------------------------

check("week starts Monday", startOfWeek("2026-08-01"), "2026-07-27");
check("Sunday belongs to the week before", startOfWeek("2026-08-02"), "2026-07-27");
check("week ends Sunday", endOfWeek("2026-08-01"), "2026-08-02");
check("add days crosses a month", addDays("2026-08-31", 1), "2026-09-01");

// --- Recurrence ------------------------------------------------------------

const base = {
  day_of_week: 2, // Tuesday
  anchor_date: "2026-08-04",
  season_start: null,
  season_end: null,
};

check(
  "weekly fills every Tuesday in the window",
  occurrencesInWindow({ ...base, frequency: "weekly" }, "2026-08-01", "2026-08-14"),
  ["2026-08-04", "2026-08-11"],
);

check(
  "biweekly keeps to the anchor's Tuesday",
  occurrencesInWindow({ ...base, frequency: "biweekly" }, "2026-08-01", "2026-09-01"),
  ["2026-08-04", "2026-08-18", "2026-09-01"],
);

check(
  "monthly keeps the same ordinal weekday",
  occurrencesInWindow({ ...base, frequency: "monthly" }, "2026-08-01", "2026-11-30"),
  ["2026-08-04", "2026-09-01", "2026-10-06", "2026-11-03"],
);

check(
  "season start clips the window",
  occurrencesInWindow(
    { ...base, frequency: "weekly", season_start: "2026-08-10" },
    "2026-08-01",
    "2026-08-14",
  ),
  ["2026-08-11"],
);

check(
  "season end clips the window",
  occurrencesInWindow(
    { ...base, frequency: "weekly", season_end: "2026-08-05" },
    "2026-08-01",
    "2026-08-14",
  ),
  ["2026-08-04"],
);

check(
  "a window with no matching weekday yields nothing",
  occurrencesInWindow({ ...base, frequency: "weekly" }, "2026-08-05", "2026-08-10"),
  [],
);

// --- Result ----------------------------------------------------------------

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`All ${checks} checks passed`);
