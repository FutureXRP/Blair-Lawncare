/**
 * Money is integer cents. Everywhere.
 *
 * No float arithmetic touches a dollar amount in this app. Values are stored as
 * integers, added as integers, and multiplied by integer quantities. Decimals
 * exist in exactly two places: `centsToQboAmount` and `qboAmountToCents`, which
 * sit on the QuickBooks boundary because the QBO API speaks decimal dollars.
 */

/** Thrown when a value that must be integer cents is not. */
export class MoneyError extends Error {}

export function assertCents(value: number, label = "amount"): number {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} must be integer cents, received ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} is outside the safe integer range`);
  }
  return value;
}

/** Sum a list of cent amounts. Integer addition only. */
export function sumCents(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total += assertCents(value);
  }
  return total;
}

/** Multiply a unit price in cents by an integer quantity. */
export function multiplyCents(unitCents: number, quantity: number): number {
  assertCents(unitCents, "unit price");
  if (!Number.isInteger(quantity)) {
    throw new MoneyError(`quantity must be an integer, received ${quantity}`);
  }
  return unitCents * quantity;
}

/**
 * Parse user input like "85", "85.50", "$1,250.00" into integer cents.
 * Returns null when the input is not a valid money string. Purely string and
 * integer arithmetic: the input is never handed to parseFloat.
 */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (cleaned === "") return null;

  const match = /^(-)?(\d*)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;

  const [, sign, wholePart, fractionPart] = match;
  if (wholePart === "" && (fractionPart === undefined || fractionPart === "")) {
    return null;
  }

  const whole = wholePart === "" ? 0 : Number.parseInt(wholePart, 10);
  const fraction = Number.parseInt((fractionPart ?? "").padEnd(2, "0") || "0", 10);
  const cents = whole * 100 + fraction;
  return sign === "-" ? -cents : cents;
}

/** "1234567" cents renders as "$12,345.67". */
export function formatCents(cents: number): string {
  assertCents(cents);
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const whole = Math.trunc(absolute / 100);
  const fraction = absolute % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${grouped}.${String(fraction).padStart(2, "0")}`;
}

/** "1234567" cents renders as "$12,346". For KPI tiles where cents are noise. */
export function formatCentsCompact(cents: number): string {
  assertCents(cents);
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  // Round half up to the nearest dollar using integer math.
  const dollars = Math.trunc((absolute + 50) / 100);
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${grouped}`;
}

/** Editable form value for a cents amount: "8550" becomes "85.50". */
export function centsToInputValue(cents: number): string {
  assertCents(cents);
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const whole = Math.trunc(absolute / 100);
  const fraction = absolute % 100;
  return `${negative ? "-" : ""}${whole}.${String(fraction).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// QuickBooks boundary. The only decimals in the codebase live below this line.
// ---------------------------------------------------------------------------

/**
 * Convert integer cents to the decimal dollar amount QBO expects in its JSON
 * payloads. The decimal string is built by integer math and only then handed to
 * Number, so no rounding error can be introduced on the way out.
 */
export function centsToQboAmount(cents: number): number {
  assertCents(cents);
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const whole = Math.trunc(absolute / 100);
  const fraction = absolute % 100;
  const decimalString = `${negative ? "-" : ""}${whole}.${String(fraction).padStart(2, "0")}`;
  return Number(decimalString);
}

/**
 * Convert a decimal dollar amount returned by QBO into integer cents. The
 * amount is stringified first and parsed digit by digit, so a value that
 * arrives as 85.29999999999999 still becomes 8530 rather than 8529.
 */
export function qboAmountToCents(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined || amount === "") return 0;

  const raw = typeof amount === "number" ? amount.toFixed(3) : String(amount).trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(raw.replace(/[$,\s]/g, ""));
  if (!match) {
    throw new MoneyError(`Unparseable QBO amount: ${String(amount)}`);
  }

  const [, sign, wholePart, fractionPart = ""] = match;
  const padded = fractionPart.padEnd(3, "0");
  const whole = Number.parseInt(wholePart, 10);
  const centsDigits = Number.parseInt(padded.slice(0, 2), 10);
  const thousandthsDigit = Number.parseInt(padded.slice(2, 3), 10);

  // Round half up on the third decimal place.
  let cents = whole * 100 + centsDigits + (thousandthsDigit >= 5 ? 1 : 0);
  if (sign === "-") cents = -cents;
  return cents;
}
