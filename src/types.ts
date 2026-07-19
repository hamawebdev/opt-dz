// Row shapes mirroring the SQLite schema in src-tauri/src/lib.rs.
//
// MONEY CONVENTION: every monetary field below is an integer count of **centimes**
// (1 DZD = 100 centimes), migrated from the original floating-point values in
// migration v2. Convert to/from dinar only at the UI boundary via
// `formatDZD` / `toCentimes` / `fromCentimes` in src/lib/format.ts. The one
// exception is `Sale.discount_value`, which holds centimes when
// `discount_type === 'amount'` and **basis points** when `discount_type === 'percent'`
// (e.g. 1500 = 15.00%).

export type ProductCategory = "frame" | "lens" | "accessory";
export type ItemType = "product" | "service";
export type StockMovementType = "delivery" | "sale" | "adjustment";
export type DiscountType = "amount" | "percent";
export type SaleStatus = "paid" | "partial" | "unpaid" | "void";
export type ClaimStatus =
  | "pending"
  | "submitted"
  | "partial"
  | "paid"
  | "rejected";
export type JobStatus = "ordered" | "in_progress" | "ready" | "delivered";

export interface Patient {
  id: number;
  /** Human-readable client code (e.g. "P-0001"); auto-generated, unique. */
  code: string | null;
  full_name: string;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  address: string | null;
  date_of_birth: string | null;
  national_id: string | null;
  /** Default third-party payer applied to new sales (CNAS/CASNOS/mutuelle…). */
  default_payer_id: number | null;
  /** Default insurer coverage for new sales, basis points (8000 = 80.00%). */
  default_coverage_pct: number;
  /** Insurance policy / affiliation number. */
  insurance_policy_no: string | null;
  /** Base64 data-URI avatar (same approach as the shop logo). */
  photo: string | null;
  notes: string | null;
  /** Soft-delete flag: archived patients are hidden from lists but keep all history. */
  archived: number;
  created_at: string;
  updated_at: string;
}

export type CreditNoteMethod = "refund" | "store_credit" | "balance";

export interface CreditNote {
  id: number;
  sale_id: number | null;
  patient_id: number | null; // null for a walk-in return
  total: number; // centimes credited (customer's net portion)
  /** 'refund' = cash back; 'balance' = applied to the sale's outstanding balance. */
  method: CreditNoteMethod;
  /** Sequential avoir number (e.g. "A000123"). */
  cn_number: string | null;
  notes: string | null;
  created_at: string;
}

export interface Prescription {
  id: number;
  patient_id: number;
  exam_date: string;
  r_sphere: number | null;
  r_cylinder: number | null;
  r_axis: number | null;
  r_add: number | null;
  r_pd: number | null;
  l_sphere: number | null;
  l_cylinder: number | null;
  l_axis: number | null;
  l_add: number | null;
  l_pd: number | null;
  lens_type: string | null; // single-vision | bifocal | progressive
  r_prism: number | null;
  r_base: string | null; // base direction, e.g. BU/BD/BI/BO
  r_seg_height: number | null;
  l_prism: number | null;
  l_base: string | null;
  l_seg_height: number | null;
  /** Contact-lens parameters (base curve + diameter, mm), per eye. */
  r_bc: number | null;
  l_bc: number | null;
  r_dia: number | null;
  l_dia: number | null;
  prescriber: string | null;
  expiry_date: string | null;
  notes: string | null;
  archived: number;
  created_at: string;
}

export interface Product {
  id: number;
  /** Optical "type" (frame/lens/accessory) — drives lab-job automation. For
   * services this carries the 'accessory' placeholder and is hidden in the UI. */
  category: ProductCategory;
  /** Distinguishes stocked products from non-physical services. */
  item_type: ItemType;
  name: string;
  brand: string | null;
  reference: string | null;
  /** Auto-generated or manually entered barcode value (unique when set). */
  barcode: string | null;
  /** ISO date (products only); feeds expiry tracking + alerts. */
  expiry_date: string | null;
  purchase_price: number;
  selling_price: number;
  quantity: number;
  min_stock: number;
  /** Legacy free-text supplier name; kept as a denormalized mirror of supplier_id. */
  supplier: string | null;
  category_id: number | null;
  brand_id: number | null;
  supplier_id: number | null;
  /** Centralized colour reference (simple products). Variant products carry colour
   * per row on product_variants instead. */
  color_id: number | null;
  /** Soft-delete flag: archived products are hidden from catalogs/POS but keep history. */
  archived: number;
  created_at: string;
  updated_at: string;
}

/** A centrally-managed colour in the shared colour vocabulary. Backs both the
 * product-level and variant-level colour pickers. */
export interface Color {
  id: number;
  /** Canonical / admin label (e.g. "Black"). */
  name: string;
  name_fr: string | null;
  name_ar: string | null;
  /** '#RRGGBB' swatch, or null for colours with no single swatch (multi/clear). */
  hex: string | null;
  is_builtin: number;
  sort_order: number;
  archived: number;
  created_at: string;
  updated_at: string;
}

/** A leftover free-text colour value queued by the v18 migration for one-time
 * admin mapping into the colour vocabulary. */
export interface ColorReviewRow {
  id: number;
  source: "product" | "variant";
  source_id: number;
  raw_value: string;
  resolved: number;
  created_at: string;
}

/** Managed taxonomy: user-defined merchandising category (distinct from the fixed
 * optical `category`/type). */
export interface Category {
  id: number;
  name: string;
  archived: number;
  created_at: string;
}

export interface Brand {
  id: number;
  name: string;
  archived: number;
  created_at: string;
}

export interface Supplier {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  archived: number;
  created_at: string;
}

export type SupplierLedgerType = "purchase" | "payment" | "debt" | "adjustment";

/** One signed entry in a supplier's running ledger (centimes): purchases/debts
 * positive (we owe more), payments negative. Balance owed = SUM(amount). */
export interface SupplierLedgerEntry {
  id: number;
  supplier_id: number;
  type: SupplierLedgerType;
  amount: number;
  note: string | null;
  ref: string | null;
  created_at: string;
}

export interface StockMovement {
  id: number;
  product_id: number;
  type: StockMovementType;
  quantity_change: number;
  note: string | null;
  created_at: string;
}

/** A sellable variant of a product (e.g. a frame in a specific colour/size), with its
 * own stock, barcode and optional price overrides. */
export interface ProductVariant {
  id: number;
  product_id: number;
  label: string | null;
  /** Centralized colour reference. */
  color_id: number | null;
  /** Legacy free-text colour; kept as a denormalized mirror of color_id (canonical name). */
  color: string | null;
  size: string | null;
  sku: string | null;
  barcode: string | null;
  quantity: number;
  min_stock: number;
  selling_price: number | null; // centimes; null = use the product's price
  purchase_price: number | null;
  archived: number;
  created_at: string;
  updated_at: string;
  /** Joined from `colors` by some queries (sales picker); not a stored column. */
  color_name?: string | null;
  color_name_fr?: string | null;
  color_name_ar?: string | null;
  color_hex?: string | null;
}

export interface ProductImage {
  id: number;
  product_id: number;
  variant_id: number | null;
  path: string;
  is_primary: number;
  sort_order: number;
  created_at: string;
}

export interface Sale {
  id: number;
  patient_id: number | null; // null for walk-in / quick sales
  prescription_id: number | null;
  sale_date: string;
  subtotal: number;
  discount_type: DiscountType;
  discount_value: number;
  total: number; // goods total (TTC), centimes
  tax_rate: number; // TVA rate in basis points (1900 = 19.00%)
  tax_amount: number; // TVA portion extracted from `total`, centimes
  timbre_amount: number; // droit de timbre added on cash sales, centimes
  invoice_number: string | null; // legal sequential number
  amount_paid: number;
  balance: number; // (total + timbre) - amount_paid, centimes
  status: SaleStatus;
  notes: string | null;
  created_at: string;
  /** Set when the invoice is voided (retained, never deleted). */
  voided_at: string | null;
  void_reason: string | null;
}

export interface SaleItem {
  id: number;
  sale_id: number;
  product_id: number | null;
  description: string;
  unit_price: number;
  quantity: number;
  item_discount: number;
  line_total: number;
  /** COGS snapshot at sale time (centimes), for margin reports. */
  unit_cost: number;
}

export interface Payment {
  id: number;
  sale_id: number;
  amount: number;
  paid_at: string;
  method: string | null;
  note: string | null;
}

// A sale joined with the patient name, used in list views.
// `patient_name` is null for walk-in / quick sales (no registered customer).
export interface SaleWithPatient extends Sale {
  patient_name: string | null;
}

export interface Payer {
  id: number;
  name: string;
  type: string | null;
  default_coverage_pct: number; // basis points (8000 = 80.00%)
  notes: string | null;
  created_at: string;
}

export interface Claim {
  id: number;
  sale_id: number;
  payer_id: number;
  covered_amount: number; // centimes the insurer is to reimburse
  status: ClaimStatus;
  claim_ref: string | null;
  paid_amount: number; // centimes the insurer has reimbursed so far
  submitted_at: string | null;
  paid_at: string | null;
  created_at: string;
}

// A claim joined with payer + sale/patient context for list views.
export interface ClaimRow extends Claim {
  payer_name: string;
  invoice_number: string | null;
  patient_name: string;
  sale_date: string;
}

export interface Job {
  id: number;
  sale_id: number | null;
  /** NULL for walk-in lens orders (v19). */
  patient_id: number | null;
  prescription_id: number | null;
  lab: string | null;
  status: JobStatus;
  expected_ready: string | null;
  delivered_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// A job joined with patient name/phone + sale invoice number for list views.
export interface JobRow extends Job {
  patient_name: string | null;
  patient_phone: string | null;
  invoice_number: string | null;
  /** 1 when not delivered and the expected-ready date has passed. */
  overdue?: number;
}

/** One stage change in a lab job's history. */
export interface JobEvent {
  id: number;
  job_id: number;
  status: JobStatus;
  note: string | null;
  created_at: string;
}

export type StaffRole =
  | "owner"
  | "optometrist"
  | "optician"
  | "cashier"
  | "staff";

/** A staff member (lightweight accountability). `pin_hash` gates protected actions. */
export interface Staff {
  id: number;
  name: string;
  role: StaffRole;
  pin_hash: string | null;
  active: number;
  created_at: string;
}

/** One append-only audit-trail entry (who did what, when). */
export interface AuditLogEntry {
  id: number;
  staff_id: number | null;
  staff_name: string | null;
  action: string;
  entity: string | null;
  entity_id: number | null;
  detail: string | null;
  created_at: string;
}

export type ActivityType =
  | "created"
  | "edited"
  | "sale"
  | "payment"
  | "appointment"
  | "prescription";

export interface PatientActivity {
  id: number;
  patient_id: number;
  type: ActivityType;
  description: string | null;
  ref_id: number | null;
  created_at: string;
}

export type AppointmentStatus =
  | "booked"
  | "arrived"
  | "done"
  | "no_show"
  | "cancelled";

export interface Appointment {
  id: number;
  patient_id: number;
  starts_at: string; // 'YYYY-MM-DD HH:MM'
  duration_min: number;
  optometrist: string | null;
  reason: string | null;
  status: AppointmentStatus;
  prescription_id: number | null;
  notes: string | null;
  created_at: string;
}

/** An appointment joined with patient name/code for schedule + check-in views. */
export interface AppointmentRow extends Appointment {
  patient_name: string;
  patient_code: string | null;
}

export type AttributeFieldType = "text" | "number" | "select" | "multiselect";

/** A custom/dynamic product attribute definition (EAV). `options` is a JSON array
 * of strings for (multi)select types. */
export interface AttributeDefinition {
  id: number;
  key: string;
  label: string;
  field_type: AttributeFieldType;
  unit: string | null;
  options: string | null;
  is_filterable: number;
  is_builtin: number;
  sort_order: number;
  archived: number;
  created_at: string;
}

export type AttributeTargetKind = "type" | "category" | "global" | "patient";

export interface AttributeTarget {
  id: number;
  attribute_id: number;
  target_kind: AttributeTargetKind;
  target_value: string | null;
}

/** A stored attribute value for one product (one of value_text/value_num/value_options
 * is populated depending on the definition's field_type). */
export interface ProductAttributeValue {
  id: number;
  product_id: number;
  attribute_id: number;
  value_text: string | null;
  value_num: number | null;
  value_options: string | null;
}

/** A stored attribute value for one patient (custom client fields, mirrors
 * ProductAttributeValue). */
export interface PatientAttributeValue {
  id: number;
  patient_id: number;
  attribute_id: number;
  value_text: string | null;
  value_num: number | null;
  value_options: string | null;
}

/** A definition joined with the product's current value, used to render the form
 * and the specs view. `value` is normalized: string | number | string[] | null. */
export interface ResolvedAttribute extends AttributeDefinition {
  value: string | number | string[] | null;
}

export interface ShopSettings {
  shop_name: string;
  shop_address: string;
  shop_phone: string;
  shop_logo: string;
  currency_symbol: string;
  invoice_footer: string;
  // Remembered destination folder for manual database backups (empty = ask).
  backup_dir: string;
  // Tax & invoicing config (stored as text; numeric values in their base units).
  tva_rate: string; // TVA rate, basis points (1900 = 19.00%)
  timbre_rate: string; // droit de timbre rate, basis points (100 = 1.00%)
  timbre_min: string; // minimum timbre, centimes
  timbre_max: string; // maximum timbre, centimes (0 = no cap)
  invoice_prefix: string; // optional invoice-number prefix
  invoice_padding: string; // zero-pad width for the sequence
  // Credit-note (avoir) numbering, mirroring the invoice sequence.
  credit_note_prefix: string;
  credit_note_padding: string;
  credit_note_next: string;
  // Thermal receipt printer.
  receipt_target: string; // device path / queue (e.g. /dev/usb/lp0); empty = disabled
  receipt_width: string; // characters per line (80mm ≈ 48)
  // Patient recall reminder interval, in months.
  recall_months: string;
  // Days before expiry to flag a product as "expiring soon".
  expiry_warn_days: string;
  // Client-code generation: prefix, zero-pad width, and the next sequence number.
  client_code_prefix: string;
  client_code_padding: string;
  client_code_next: string;
  // JSON blob (see ReceiptConfig) controlling which blocks print on receipts/invoices.
  receipt_config: string;
  // JSON array of named label-designer templates (see LabelTemplate).
  label_templates: string;
  // The one shop-wide password gating Inventory, Reports and Settings, and the
  // one-time recovery code that clears it. Both are PBKDF2 records produced by
  // src/lib/auth.ts (empty = not set); see that file for the format.
  manager_password_hash: string;
  manager_recovery_hash: string;
  // Scheduled automatic backups.
  auto_backup_enabled: string; // "0" | "1"
  auto_backup_interval_days: string;
  auto_backup_keep: string; // how many backup files to retain
  last_auto_backup: string; // ISO datetime of the last successful auto-backup
}

/** Parsed shape of `ShopSettings.receipt_config` (stored as JSON text). */
export interface ReceiptConfig {
  show_logo: boolean;
  show_address: boolean;
  show_phone: boolean;
  header_text: string;
  footer_text: string;
  show_tax: boolean;
  show_timbre: boolean;
  show_qty: boolean;
  show_unit_price: boolean;
  show_discount: boolean;
  /** Attribute keys to print under each product line. */
  item_attribute_keys: string[];
  paper: "a4" | "thermal";
}
