/**
 * Row shapes for the Postgres schema in supabase/migrations.
 *
 * Hand written rather than generated so the money columns can be documented
 * where they are declared: every `_cents` field below is an integer.
 */

export type Uuid = string;
export type Timestamp = string;
export type DateString = string;

export type UserRole = "owner" | "crew";
export type CustomerStatus = "lead" | "estimate" | "active" | "paused" | "churned";
export type PricingUnit = "flat" | "per_visit" | "per_sqft";
export type Frequency = "weekly" | "biweekly" | "monthly";
export type JobStatus =
  | "scheduled"
  | "en_route"
  | "in_progress"
  | "complete"
  | "skipped"
  | "rain_delay";
export type EstimateStatus = "draft" | "sent" | "viewed" | "accepted" | "declined";
export type EquipmentCategory =
  | "mower"
  | "trimmer"
  | "blower"
  | "truck"
  | "trailer"
  | "other";
export type InvoicingMode = "per_job" | "monthly";

export type Org = {
  id: Uuid;
  name: string;
  branding: Record<string, unknown>;
  qbo_realm_id: string | null;
  qbo_connected_at: Timestamp | null;
  qbo_access_token_encrypted: string | null;
  qbo_refresh_token_encrypted: string | null;
  qbo_access_token_expires_at: Timestamp | null;
  qbo_refresh_token_expires_at: Timestamp | null;
  invoicing_mode: InvoicingMode;
  /** integer cents */
  weekly_revenue_target_cents: number;
  rain_risk: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type Profile = {
  id: Uuid;
  org_id: Uuid;
  name: string;
  role: UserRole;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type Customer = {
  id: Uuid;
  org_id: Uuid;
  name: string;
  email: string | null;
  phone: string | null;
  status: CustomerStatus;
  qbo_customer_id: string | null;
  notes: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type Property = {
  id: Uuid;
  org_id: Uuid;
  customer_id: Uuid;
  label: string;
  address: string;
  city: string | null;
  lat: number | null;
  lng: number | null;
  lot_sqft: number | null;
  gate_code: string | null;
  notes: string | null;
  photos: unknown[];
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type Service = {
  id: Uuid;
  org_id: Uuid;
  name: string;
  /** integer cents */
  default_price_cents: number;
  pricing_unit: PricingUnit;
  qbo_item_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type RecurringJob = {
  id: Uuid;
  org_id: Uuid;
  property_id: Uuid;
  service_id: Uuid;
  frequency: Frequency;
  day_of_week: number;
  /** integer cents */
  price_cents: number;
  active: boolean;
  season_start: DateString | null;
  season_end: DateString | null;
  anchor_date: DateString;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type Job = {
  id: Uuid;
  org_id: Uuid;
  property_id: Uuid;
  recurring_job_id: Uuid | null;
  service_id: Uuid;
  scheduled_date: DateString;
  route_order: number;
  status: JobStatus;
  /** integer cents */
  price_cents: number;
  assigned_crew: Uuid[];
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  completion_notes: string | null;
  photos: unknown[];
  qbo_invoice_id: string | null;
  qbo_invoice_error: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type EstimateLineItem = {
  service_id: Uuid | null;
  description: string;
  /** whole units only */
  qty: number;
  /** integer cents, per unit */
  price_cents: number;
};

export type Estimate = {
  id: Uuid;
  org_id: Uuid;
  customer_id: Uuid;
  property_id: Uuid | null;
  status: EstimateStatus;
  line_items: EstimateLineItem[];
  /** integer cents */
  total_cents: number;
  sent_at: Timestamp | null;
  viewed_at: Timestamp | null;
  decided_at: Timestamp | null;
  qbo_estimate_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type Equipment = {
  id: Uuid;
  org_id: Uuid;
  name: string;
  category: EquipmentCategory;
  engine_hours: number;
  last_service_at: Timestamp | null;
  last_service_hours: number | null;
  service_interval_hours: number | null;
  notes: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type MaintenanceLogEntry = {
  id: Uuid;
  org_id: Uuid;
  equipment_id: Uuid;
  performed_at: Timestamp;
  description: string;
  /** integer cents */
  cost_cents: number;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type ActivityLogEntry = {
  id: Uuid;
  org_id: Uuid;
  actor: Uuid | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: Timestamp;
  updated_at: Timestamp;
};

/** One open invoice as cached from QuickBooks. Amounts are integer cents. */
export type OpenInvoice = {
  qbo_invoice_id: string;
  doc_number: string | null;
  customer_name: string | null;
  qbo_customer_id: string | null;
  balance_cents: number;
  total_cents: number;
  due_date: DateString | null;
  days_overdue: number;
};

export type RevenueByItemEntry = {
  item_name: string;
  qbo_item_id: string | null;
  /** integer cents */
  amount_cents: number;
};

export type QboSyncState = {
  id: Uuid;
  org_id: Uuid;
  last_sync_at: Timestamp | null;
  last_sync_status: "ok" | "error" | null;
  last_sync_error: string | null;
  last_good_sync_at: Timestamp | null;
  cursor: Record<string, unknown>;
  ar_current_cents: number | null;
  ar_1_30_cents: number | null;
  ar_31_60_cents: number | null;
  ar_61_90_cents: number | null;
  ar_90_plus_cents: number | null;
  ar_total_cents: number | null;
  open_invoices: OpenInvoice[];
  revenue_by_item: Record<string, RevenueByItemEntry[]>;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type Writable<Row> = {
  [Column in Exclude<keyof Row, "created_at" | "updated_at">]?: Row[Column];
};

/**
 * Foreign keys, in the shape PostgREST needs to resolve an embedded select.
 * The names match Postgres defaults for the constraints in
 * supabase/migrations/0001_init.sql, which is `<table>_<column>_fkey`.
 */
type ForeignKey<Table extends string, Column extends string, Referenced extends string> = {
  foreignKeyName: `${Table}_${Column}_fkey`;
  columns: [Column];
  isOneToOne: false;
  referencedRelation: Referenced;
  referencedColumns: ["id"];
};

type TableDefinition<Row, Relationships extends readonly unknown[] = []> = {
  Row: Row;
  Insert: Writable<Row>;
  Update: Writable<Row>;
  Relationships: Relationships;
};

export type Database = {
  public: {
    Tables: {
      orgs: TableDefinition<Org>;
      profiles: TableDefinition<Profile, [ForeignKey<"profiles", "org_id", "orgs">]>;
      customers: TableDefinition<Customer, [ForeignKey<"customers", "org_id", "orgs">]>;
      properties: TableDefinition<
        Property,
        [
          ForeignKey<"properties", "org_id", "orgs">,
          ForeignKey<"properties", "customer_id", "customers">,
        ]
      >;
      services: TableDefinition<Service, [ForeignKey<"services", "org_id", "orgs">]>;
      recurring_jobs: TableDefinition<
        RecurringJob,
        [
          ForeignKey<"recurring_jobs", "org_id", "orgs">,
          ForeignKey<"recurring_jobs", "property_id", "properties">,
          ForeignKey<"recurring_jobs", "service_id", "services">,
        ]
      >;
      jobs: TableDefinition<
        Job,
        [
          ForeignKey<"jobs", "org_id", "orgs">,
          ForeignKey<"jobs", "property_id", "properties">,
          ForeignKey<"jobs", "recurring_job_id", "recurring_jobs">,
          ForeignKey<"jobs", "service_id", "services">,
        ]
      >;
      estimates: TableDefinition<
        Estimate,
        [
          ForeignKey<"estimates", "org_id", "orgs">,
          ForeignKey<"estimates", "customer_id", "customers">,
          ForeignKey<"estimates", "property_id", "properties">,
        ]
      >;
      equipment: TableDefinition<Equipment, [ForeignKey<"equipment", "org_id", "orgs">]>;
      maintenance_log: TableDefinition<
        MaintenanceLogEntry,
        [
          ForeignKey<"maintenance_log", "org_id", "orgs">,
          ForeignKey<"maintenance_log", "equipment_id", "equipment">,
        ]
      >;
      activity_log: TableDefinition<
        ActivityLogEntry,
        [ForeignKey<"activity_log", "org_id", "orgs">]
      >;
      qbo_sync_state: TableDefinition<
        QboSyncState,
        [ForeignKey<"qbo_sync_state", "org_id", "orgs">]
      >;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type TableName = keyof Database["public"]["Tables"];

/** Payload shape for an update on `Name`. */
export type TableUpdate<Name extends TableName> =
  Database["public"]["Tables"][Name]["Update"];

/** Payload shape for an insert into `Name`. */
export type TableInsert<Name extends TableName> =
  Database["public"]["Tables"][Name]["Insert"];

// ---------------------------------------------------------------------------
// Composed shapes used by the UI
// ---------------------------------------------------------------------------

export type RouteStop = Job & {
  property: Pick<
    Property,
    "id" | "label" | "address" | "city" | "gate_code" | "notes" | "lot_sqft"
  >;
  customer: Pick<Customer, "id" | "name" | "phone">;
  service: Pick<Service, "id" | "name">;
};
