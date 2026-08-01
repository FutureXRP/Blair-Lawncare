import "server-only";

import OAuthClient from "intuit-oauth";
import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { centsToQboAmount, qboAmountToCents } from "@/lib/money";
import type {
  Database,
  Org,
  OpenInvoice,
  RevenueByItemEntry,
  TableUpdate,
  Uuid,
} from "@/lib/types";

/**
 * The one place the app talks to QuickBooks.
 *
 * Nothing in this file runs in the browser and no other module issues a QBO
 * request. QuickBooks owns the money: the app pushes customers, invoices and
 * mirrored estimates out, and reads payment status, AR aging and revenue back.
 * It never recomputes an accounting figure locally.
 *
 * Amounts cross the boundary only through centsToQboAmount and
 * qboAmountToCents from lib/money.
 */

type Db = SupabaseClient<Database>;

const MINOR_VERSION = "75";
const REFRESH_SKEW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 4;

export class QboNotConnectedError extends Error {
  constructor(message = "QuickBooks is not connected") {
    super(message);
    this.name = "QboNotConnectedError";
  }
}

export class QboError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(message: string, status: number, detail = "") {
    super(message);
    this.name = "QboError";
    this.status = status;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface QboConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: "sandbox" | "production";
}

export function readQboConfig(): QboConfig | null {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const redirectUri = process.env.QBO_REDIRECT_URI;
  const environment = process.env.QBO_ENVIRONMENT === "production" ? "production" : "sandbox";

  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri, environment };
}

function requireQboConfig(): QboConfig {
  const config = readQboConfig();
  if (!config) {
    throw new QboNotConnectedError(
      "QuickBooks is not configured. Set QBO_CLIENT_ID, QBO_CLIENT_SECRET and QBO_REDIRECT_URI.",
    );
  }
  return config;
}

function apiBaseUrl(environment: QboConfig["environment"]): string {
  return environment === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

function createOAuthClient(config: QboConfig): OAuthClient {
  return new OAuthClient({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    environment: config.environment,
    redirectUri: config.redirectUri,
    logging: false,
  });
}

// ---------------------------------------------------------------------------
// OAuth 2.0
// ---------------------------------------------------------------------------

export function buildAuthorizeUrl(state: string): string {
  const config = requireQboConfig();
  return createOAuthClient(config).authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state,
  });
}

interface TokenPayload {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
}

/**
 * Completes the OAuth callback and stores the tokens encrypted. QBO rotates the
 * refresh token on most refreshes, so the newest one is written immediately and
 * the old one is never kept.
 */
export async function completeOAuthCallback(
  db: Db,
  orgId: Uuid,
  callbackUrl: string,
  realmId: string,
): Promise<void> {
  const config = requireQboConfig();
  const client = createOAuthClient(config);

  const authResponse = await client.createToken(callbackUrl);
  const token = authResponse.getJson() as TokenPayload;

  await persistTokens(db, orgId, token, realmId);
}

async function persistTokens(
  db: Db,
  orgId: Uuid,
  token: TokenPayload,
  realmId?: string,
): Promise<{ accessToken: string; realmId: string | null }> {
  if (!token.access_token || !token.refresh_token) {
    throw new QboError("QuickBooks returned a response with no tokens in it", 500);
  }

  const now = Date.now();
  const accessExpiresAt = new Date(now + (token.expires_in ?? 3600) * 1000).toISOString();
  const refreshExpiresAt = new Date(
    now + (token.x_refresh_token_expires_in ?? 8726400) * 1000,
  ).toISOString();

  const update: TableUpdate<"orgs"> = {
    qbo_access_token_encrypted: encryptSecret(token.access_token),
    qbo_refresh_token_encrypted: encryptSecret(token.refresh_token),
    qbo_access_token_expires_at: accessExpiresAt,
    qbo_refresh_token_expires_at: refreshExpiresAt,
  };

  if (realmId) {
    update.qbo_realm_id = realmId;
    update.qbo_connected_at = new Date(now).toISOString();
  }

  const { error } = await db.from("orgs").update(update).eq("id", orgId);
  if (error) throw new QboError(`Could not store QuickBooks tokens: ${error.message}`, 500);

  return { accessToken: token.access_token, realmId: realmId ?? null };
}

export async function disconnectQbo(db: Db, orgId: Uuid): Promise<void> {
  await db
    .from("orgs")
    .update({
      qbo_realm_id: null,
      qbo_connected_at: null,
      qbo_access_token_encrypted: null,
      qbo_refresh_token_encrypted: null,
      qbo_access_token_expires_at: null,
      qbo_refresh_token_expires_at: null,
    })
    .eq("id", orgId);
}

// ---------------------------------------------------------------------------
// Access tokens
// ---------------------------------------------------------------------------

/**
 * In-process guard so two concurrent requests do not both refresh and race each
 * other into storing a refresh token QBO has already rotated away.
 */
const inFlightRefreshes = new Map<Uuid, Promise<string>>();

export interface QboConnection {
  orgId: Uuid;
  realmId: string;
  accessToken: string;
  baseUrl: string;
}

export function isConnected(org: Pick<Org, "qbo_realm_id" | "qbo_refresh_token_encrypted">): boolean {
  return Boolean(org.qbo_realm_id && org.qbo_refresh_token_encrypted);
}

async function loadOrg(db: Db, orgId: Uuid): Promise<Org> {
  const { data, error } = await db.from("orgs").select("*").eq("id", orgId).single();
  if (error || !data) {
    throw new QboNotConnectedError("Could not load the organization record");
  }
  return data;
}

export async function getConnection(db: Db, orgId: Uuid): Promise<QboConnection> {
  const config = requireQboConfig();
  const org = await loadOrg(db, orgId);

  if (!isConnected(org)) {
    throw new QboNotConnectedError("Connect QuickBooks in Settings first");
  }

  const expiresAt = org.qbo_access_token_expires_at
    ? new Date(org.qbo_access_token_expires_at).getTime()
    : 0;
  const stillFresh = org.qbo_access_token_encrypted && expiresAt - REFRESH_SKEW_MS > Date.now();

  const accessToken = stillFresh
    ? decryptSecret(org.qbo_access_token_encrypted!)
    : await refreshAccessToken(db, orgId, org);

  return {
    orgId,
    realmId: org.qbo_realm_id!,
    accessToken,
    baseUrl: apiBaseUrl(config.environment),
  };
}

async function refreshAccessToken(db: Db, orgId: Uuid, org: Org): Promise<string> {
  const existing = inFlightRefreshes.get(orgId);
  if (existing) return existing;

  const refresh = (async () => {
    const config = requireQboConfig();
    const client = createOAuthClient(config);
    const refreshToken = decryptSecret(org.qbo_refresh_token_encrypted!);

    const authResponse = await client.refreshUsingToken(refreshToken);
    const token = authResponse.getJson() as TokenPayload;

    const stored = await persistTokens(db, orgId, token);
    return stored.accessToken;
  })();

  inFlightRefreshes.set(orgId, refresh);
  try {
    return await refresh;
  } finally {
    inFlightRefreshes.delete(orgId);
  }
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

function backoffMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number.parseInt(retryAfterHeader, 10);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 30_000);
  }
  return Math.min(500 * 2 ** attempt, 8_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function qboFetch<T>(
  connection: QboConnection,
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const url = new URL(`${connection.baseUrl}/v3/company/${connection.realmId}${path}`);
  url.searchParams.set("minorversion", MINOR_VERSION);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    url.searchParams.set(key, value);
  }

  let lastError: QboError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    const detail = await response.text();
    lastError = new QboError(
      `QuickBooks returned ${response.status} for ${path}`,
      response.status,
      detail.slice(0, 500),
    );

    // 429 is the rate limiter, 5xx is a transient fault on their side. Anything
    // else is a real error and retrying it would only repeat the mistake.
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS - 1) break;

    await sleep(backoffMs(attempt, response.headers.get("Retry-After")));
  }

  throw lastError ?? new QboError(`QuickBooks request to ${path} failed`, 500);
}

/** Runs a QuickBooks query and returns the named entity array. */
async function qboQuery<T>(
  connection: QboConnection,
  statement: string,
  entity: string,
): Promise<T[]> {
  const result = await qboFetch<{ QueryResponse?: Record<string, unknown> }>(
    connection,
    "/query",
    { query: { query: statement } },
  );
  const rows = result.QueryResponse?.[entity];
  return Array.isArray(rows) ? (rows as T[]) : [];
}

/** QBO string literals are single quoted; a quote inside one is doubled. */
function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

interface QboCustomer {
  Id: string;
  DisplayName: string;
}

/**
 * Returns the QBO customer id for an app customer, creating the QBO record on
 * first use. The app owns operational fields; QBO owns billing fields, so this
 * only ever sets the identity fields needed to invoice.
 */
export async function ensureQboCustomer(
  db: Db,
  connection: QboConnection,
  customerId: Uuid,
): Promise<string> {
  const { data: customer, error } = await db
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .single();

  if (error || !customer) {
    throw new QboError(`Customer ${customerId} was not found`, 404);
  }
  if (customer.qbo_customer_id) return customer.qbo_customer_id;

  const existing = await qboQuery<QboCustomer>(
    connection,
    `select Id, DisplayName from Customer where DisplayName = ${quote(customer.name)}`,
    "Customer",
  );

  let qboCustomerId = existing[0]?.Id ?? null;

  if (!qboCustomerId) {
    const created = await qboFetch<{ Customer: QboCustomer }>(connection, "/customer", {
      method: "POST",
      body: {
        DisplayName: customer.name,
        ...(customer.email
          ? { PrimaryEmailAddr: { Address: customer.email } }
          : {}),
        ...(customer.phone ? { PrimaryPhone: { FreeFormNumber: customer.phone } } : {}),
      },
    });
    qboCustomerId = created.Customer.Id;
  }

  await db.from("customers").update({ qbo_customer_id: qboCustomerId }).eq("id", customerId);
  return qboCustomerId;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

interface QboItem {
  Id: string;
  Name: string;
}

async function findIncomeAccountId(connection: QboConnection): Promise<string> {
  const accounts = await qboQuery<{ Id: string }>(
    connection,
    "select Id from Account where AccountType = 'Income' maxresults 1",
    "Account",
  );
  const accountId = accounts[0]?.Id;
  if (!accountId) {
    throw new QboError(
      "This QuickBooks company has no income account, so a service item cannot be created",
      422,
    );
  }
  return accountId;
}

/** Links an app service to a QBO service item, creating it if needed. */
export async function ensureQboItem(
  db: Db,
  connection: QboConnection,
  serviceId: Uuid,
): Promise<string> {
  const { data: service, error } = await db
    .from("services")
    .select("*")
    .eq("id", serviceId)
    .single();

  if (error || !service) {
    throw new QboError(`Service ${serviceId} was not found`, 404);
  }
  if (service.qbo_item_id) return service.qbo_item_id;

  const existing = await qboQuery<QboItem>(
    connection,
    `select Id, Name from Item where Name = ${quote(service.name)}`,
    "Item",
  );

  let qboItemId = existing[0]?.Id ?? null;

  if (!qboItemId) {
    const created = await qboFetch<{ Item: QboItem }>(connection, "/item", {
      method: "POST",
      body: {
        Name: service.name,
        Type: "Service",
        IncomeAccountRef: { value: await findIncomeAccountId(connection) },
      },
    });
    qboItemId = created.Item.Id;
  }

  await db.from("services").update({ qbo_item_id: qboItemId }).eq("id", serviceId);
  return qboItemId;
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

interface QboInvoice {
  Id: string;
  DocNumber?: string;
  TotalAmt?: number | string;
  Balance?: number | string;
  DueDate?: string;
  CustomerRef?: { value?: string; name?: string };
}

export interface InvoiceLineInput {
  /** integer cents, per unit */
  unitPriceCents: number;
  quantity: number;
  description: string;
  qboItemId: string;
}

/**
 * Creates an invoice in QuickBooks. `amountCents` is the authoritative total
 * from the app side; it is converted to a decimal exactly once, here.
 */
export async function createInvoice(
  connection: QboConnection,
  input: {
    qboCustomerId: string;
    lines: InvoiceLineInput[];
    privateNote?: string;
    /** Stable per source record, so a retry cannot create a second invoice. */
    docNumberHint?: string;
  },
): Promise<{ id: string; docNumber: string | null; totalCents: number }> {
  const body = {
    CustomerRef: { value: input.qboCustomerId },
    Line: input.lines.map((line) => ({
      DetailType: "SalesItemLineDetail",
      Amount: centsToQboAmount(line.unitPriceCents * line.quantity),
      Description: line.description,
      SalesItemLineDetail: {
        ItemRef: { value: line.qboItemId },
        Qty: line.quantity,
        UnitPrice: centsToQboAmount(line.unitPriceCents),
      },
    })),
    ...(input.privateNote ? { PrivateNote: input.privateNote } : {}),
  };

  const created = await qboFetch<{ Invoice: QboInvoice }>(connection, "/invoice", {
    method: "POST",
    body,
  });

  return {
    id: created.Invoice.Id,
    docNumber: created.Invoice.DocNumber ?? null,
    totalCents: qboAmountToCents(created.Invoice.TotalAmt),
  };
}

/**
 * Looks for an invoice this app already created for a given private note. Used
 * as a second guard against duplicate invoices when a write succeeded at QBO
 * but the response never made it back.
 */
export async function findInvoiceByPrivateNote(
  connection: QboConnection,
  privateNote: string,
): Promise<string | null> {
  const rows = await qboQuery<QboInvoice & { PrivateNote?: string }>(
    connection,
    `select Id, PrivateNote from Invoice where PrivateNote = ${quote(privateNote)}`,
    "Invoice",
  );
  return rows[0]?.Id ?? null;
}

// ---------------------------------------------------------------------------
// Estimates (optional mirror of an accepted estimate)
// ---------------------------------------------------------------------------

export async function createEstimateMirror(
  connection: QboConnection,
  input: { qboCustomerId: string; lines: InvoiceLineInput[]; privateNote?: string },
): Promise<{ id: string }> {
  const created = await qboFetch<{ Estimate: { Id: string } }>(connection, "/estimate", {
    method: "POST",
    body: {
      CustomerRef: { value: input.qboCustomerId },
      Line: input.lines.map((line) => ({
        DetailType: "SalesItemLineDetail",
        Amount: centsToQboAmount(line.unitPriceCents * line.quantity),
        Description: line.description,
        SalesItemLineDetail: {
          ItemRef: { value: line.qboItemId },
          Qty: line.quantity,
          UnitPrice: centsToQboAmount(line.unitPriceCents),
        },
      })),
      ...(input.privateNote ? { PrivateNote: input.privateNote } : {}),
    },
  });

  return { id: created.Estimate.Id };
}

// ---------------------------------------------------------------------------
// Reads: payment status, AR aging, revenue by item
// ---------------------------------------------------------------------------

function daysOverdue(dueDate: string | null | undefined): number {
  if (!dueDate) return 0;
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  if (Number.isNaN(due)) return 0;
  const diff = Date.now() - due;
  return diff <= 0 ? 0 : Math.floor(diff / (24 * 60 * 60 * 1000));
}

/** Every open invoice with a balance. Read only; QBO is the source of truth. */
export async function fetchOpenInvoices(connection: QboConnection): Promise<OpenInvoice[]> {
  const rows = await qboQuery<QboInvoice>(
    connection,
    "select Id, DocNumber, TotalAmt, Balance, DueDate, CustomerRef from Invoice " +
      "where Balance > '0' orderby DueDate asc maxresults 200",
    "Invoice",
  );

  return rows.map((row) => ({
    qbo_invoice_id: row.Id,
    doc_number: row.DocNumber ?? null,
    customer_name: row.CustomerRef?.name ?? null,
    qbo_customer_id: row.CustomerRef?.value ?? null,
    balance_cents: qboAmountToCents(row.Balance),
    total_cents: qboAmountToCents(row.TotalAmt),
    due_date: row.DueDate ?? null,
    days_overdue: daysOverdue(row.DueDate),
  }));
}

/** Paid status for the invoices this app created. A zero balance means paid. */
export async function fetchInvoiceBalances(
  connection: QboConnection,
  invoiceIds: string[],
): Promise<Map<string, number>> {
  const balances = new Map<string, number>();
  if (invoiceIds.length === 0) return balances;

  // QBO caps query length, so ids go out in modest batches.
  const batchSize = 40;
  for (let index = 0; index < invoiceIds.length; index += batchSize) {
    const batch = invoiceIds.slice(index, index + batchSize);
    const list = batch.map(quote).join(", ");
    const rows = await qboQuery<QboInvoice>(
      connection,
      `select Id, Balance, TotalAmt from Invoice where Id in (${list})`,
      "Invoice",
    );
    for (const row of rows) {
      balances.set(row.Id, qboAmountToCents(row.Balance));
    }
  }

  return balances;
}

interface QboReport {
  Rows?: { Row?: QboReportRow[] };
  Columns?: { Column?: { ColTitle?: string }[] };
}

interface QboReportRow {
  ColData?: { value?: string; id?: string }[];
  Rows?: { Row?: QboReportRow[] };
  Summary?: { ColData?: { value?: string }[] };
  type?: string;
  group?: string;
}

export interface ArAging {
  current_cents: number;
  bucket_1_30_cents: number;
  bucket_31_60_cents: number;
  bucket_61_90_cents: number;
  bucket_90_plus_cents: number;
  total_cents: number;
}

/**
 * AR aging straight from the QuickBooks Aged Receivables report. The buckets are
 * whatever QBO says they are; the app does not bucket anything itself.
 */
export async function fetchArAging(connection: QboConnection): Promise<ArAging> {
  const report = await qboFetch<QboReport>(connection, "/reports/AgedReceivables", {
    query: { aging_method: "Report_Date" },
  });

  const columns = (report.Columns?.Column ?? []).map((column) => column.ColTitle ?? "");
  const totalRow =
    (report.Rows?.Row ?? []).find((row) => row.Summary)?.Summary?.ColData ??
    (report.Rows?.Row ?? []).find((row) => row.type === "Section")?.Summary?.ColData ??
    [];

  const valueForColumn = (matcher: (title: string) => boolean): number => {
    const index = columns.findIndex((title) => matcher(title.toLowerCase()));
    if (index < 0) return 0;
    return qboAmountToCents(totalRow[index]?.value ?? "0");
  };

  const aging: ArAging = {
    current_cents: valueForColumn((title) => title.includes("current")),
    bucket_1_30_cents: valueForColumn((title) => title.includes("1 - 30") || title.includes("1-30")),
    bucket_31_60_cents: valueForColumn(
      (title) => title.includes("31 - 60") || title.includes("31-60"),
    ),
    bucket_61_90_cents: valueForColumn(
      (title) => title.includes("61 - 90") || title.includes("61-90"),
    ),
    bucket_90_plus_cents: valueForColumn((title) => title.includes("91") || title.includes("90")),
    total_cents: valueForColumn((title) => title.includes("total")),
  };

  return aging;
}

/**
 * Monthly revenue by service item, from the QuickBooks Item Sales report.
 * Returned as cents so it can sit alongside every other figure in the app.
 */
export async function fetchRevenueByItem(
  connection: QboConnection,
  startDate: string,
  endDate: string,
): Promise<RevenueByItemEntry[]> {
  const report = await qboFetch<QboReport>(connection, "/reports/ItemSales", {
    query: { start_date: startDate, end_date: endDate },
  });

  const columns = (report.Columns?.Column ?? []).map((column) =>
    (column.ColTitle ?? "").toLowerCase(),
  );
  const amountIndex = columns.findIndex(
    (title) => title.includes("amount") || title.includes("total"),
  );
  if (amountIndex < 0) return [];

  const entries: RevenueByItemEntry[] = [];

  const walk = (rows: QboReportRow[]) => {
    for (const row of rows) {
      if (row.ColData && row.ColData.length > amountIndex) {
        const name = row.ColData[0]?.value ?? "";
        const rawAmount = row.ColData[amountIndex]?.value ?? "";
        if (name && rawAmount) {
          entries.push({
            item_name: name,
            qbo_item_id: row.ColData[0]?.id ?? null,
            amount_cents: qboAmountToCents(rawAmount),
          });
        }
      }
      if (row.Rows?.Row) walk(row.Rows.Row);
    }
  };

  walk(report.Rows?.Row ?? []);
  return entries;
}
