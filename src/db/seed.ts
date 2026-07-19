// Production-like demo seed for Opt DZ.
//
// Generates a realistic single-shop Algerian optician dataset: managed taxonomy
// (categories/brands/suppliers + ledgers), a catalog of frames (some with
// colour/size variants), lenses, accessories and services with custom EAV specs,
// third-party payers (CNAS/CASNOS/mutuelles), patients with prescriptions and
// custom tags, appointments, and ~50 sales spread over the last ~6 months that
// exercise every real-world state: outstanding balances + installments, insurance
// claims across their lifecycle, lab jobs flowing ordered→collected, returns
// (cash refunds), and low/expiring stock.
//
// HOW TO RUN — this seeder talks to the live SQLite database through the Tauri
// SQL/command bridge, so it only works inside the running desktop app (not plain
// `node`/`vite`). In a dev build (`npm run tauri dev`) open the devtools console
// and run:
//
//     await seedDatabase()            // refuses if data already exists
//     await seedDatabase({ reset: true })   // wipe seeded tables first, then seed
//     await clearSeedData()           // wipe seeded tables only
//
// Both functions are exposed on `window` only in dev (see src/main.tsx).
//
// All money is integer centimes (see types.ts). Totals/tax/timbre/balance/stock
// are NEVER computed here — sales go through the same `create_sale` /
// `record_payment` / `create_return` commands the UI uses, so the data is exactly
// as consistent as production data.

import { getDb } from "@/lib/db";
import { commands } from "@/lib/bindings";
import { saveSettings } from "@/db/settings";
import { createPayer } from "@/db/payers";
import { createSupplier, addLedgerEntry } from "@/db/suppliers";
import { createCategory, createBrand } from "@/db/taxonomy";
import { createProduct, type ProductInput } from "@/db/products";
import { createVariant } from "@/db/variants";
import { resolveColorId, createColor, addColorAlias } from "@/db/colors";
import {
  setProductValues,
  setPatientValues,
  type AttributeValueInput,
} from "@/db/attributes";
import { createPatient } from "@/db/patients";
import { createPrescription } from "@/db/prescriptions";
import {
  createAppointment,
  setAppointmentStatus,
  linkAppointmentPrescription,
} from "@/db/appointments";
import { updateClaimStatus, recordClaimPayment } from "@/db/claims";
import { updateJobStatus, updateJobDetails } from "@/db/jobs";
import { logActivity } from "@/db/activity";
import type {
  AttributeFieldType,
  ProductCategory,
  ItemType,
  JobStatus,
} from "@/types";

// ── tiny deterministic helpers ──────────────────────────────────────────────
// A fixed-seed PRNG makes the dataset stable across reseeds (easier to demo).

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x5eed1234);
const rand = () => rng();
const randInt = (min: number, max: number) =>
  min + Math.floor(rand() * (max - min + 1));
const chance = (p: number) => rand() < p;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
function sample<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

const da = (dinar: number) => Math.round(dinar * 100); // dinar → centimes
const BIG = 1_000_000_00; // "pay in full" sentinel; create_sale clamps to what's due

// ── date helpers (relative to the real "now") ───────────────────────────────
const DAY = 86_400_000;
const NOW = new Date();
const pad2 = (n: number) => String(n).padStart(2, "0");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * DAY);
const ymd = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const ymdhms = (d: Date) =>
  `${ymd(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
const at = (d: Date, hh: number, mm: number) =>
  `${ymd(d)} ${pad2(hh)}:${pad2(mm)}`;

// ── Algerian name / locale pools ────────────────────────────────────────────
const MALE = [
  "Karim",
  "Sofiane",
  "Yacine",
  "Amine",
  "Bilal",
  "Riad",
  "Mehdi",
  "Walid",
  "Nabil",
  "Hamza",
  "Toufik",
  "Adel",
  "Reda",
  "Lyes",
  "Samir",
  "Farid",
  "Mourad",
  "Djamel",
  "Khaled",
  "Aymen",
];
const FEMALE = [
  "Yasmine",
  "Amina",
  "Sara",
  "Nadia",
  "Lila",
  "Imene",
  "Manel",
  "Hiba",
  "Soraya",
  "Kahina",
  "Meriem",
  "Asma",
  "Wassila",
  "Fatima",
  "Nawel",
  "Lina",
  "Rania",
  "Selma",
  "Dalia",
  "Hayet",
];
const LAST = [
  "Benali",
  "Hamadi",
  "Khelifi",
  "Belkacem",
  "Boudiaf",
  "Bouzid",
  "Cherif",
  "Mansouri",
  "Saadi",
  "Brahimi",
  "Zerrouki",
  "Haddad",
  "Lounis",
  "Meziane",
  "Taleb",
  "Slimani",
  "Ferhat",
  "Ouali",
  "Bensalem",
  "Guerroudj",
  "Rahmani",
  "Lakhdar",
  "Bouchama",
  "Ait Said",
];
const CITIES = [
  "Alger Centre",
  "Hydra, Alger",
  "Bab Ezzouar, Alger",
  "Kouba, Alger",
  "El Biar, Alger",
  "Cheraga, Alger",
  "Dely Ibrahim, Alger",
  "Bir Mourad Raïs, Alger",
  "Birkhadem, Alger",
  "Blida",
  "Boumerdès",
  "Tizi Ouzou",
];
const STREETS = [
  "Rue Didouche Mourad",
  "Bd Mohamed V",
  "Cité 1200 Logements",
  "Rue Larbi Ben M'hidi",
  "Avenue de l'ALN",
  "Cité des Frères Abbad",
  "Rue Hassiba Ben Bouali",
  "Lotissement El Feth",
];
const OPTOMETRISTS = ["Dr. Brahimi", "Dr. Hamidi", "Dr. Cherifi"]; // in-store
const PRESCRIBERS = [
  "Dr. Brahimi (opticien)",
  "Dr. Benmoussa (ophtalmo)",
  "Dr. Ait Said (ophtalmo)",
  "Dr. Hamidi (opticien)",
];
const LABS = [
  "Essilor Algérie (labo)",
  "Novacel Labo",
  "BBGR Labo",
  "Atelier interne",
];

function phone(): string {
  const p = pick(["5", "6", "7"]);
  let rest = "";
  for (let i = 0; i < 8; i++) rest += randInt(0, 9);
  return `+213 0${p}${rest.slice(0, 1)} ${rest.slice(1, 3)} ${rest.slice(3, 5)} ${rest.slice(5, 7)}`;
}
function nin(): string {
  let s = "";
  for (let i = 0; i < 18; i++) s += randInt(0, 9);
  return s;
}
function policyNo(prefix: string): string {
  return `${prefix}-${randInt(100000, 999999)}`;
}

// ── EAV: resolve seeded attribute definitions by key ────────────────────────
type AttrMeta = { id: number; field_type: AttributeFieldType };
async function loadAttributes(): Promise<Map<string, AttrMeta>> {
  const db = await getDb();
  const rows = await db.select<
    { id: number; key: string; field_type: AttributeFieldType }[]
  >("SELECT id, key, field_type FROM attribute_definitions");
  return new Map(
    rows.map((r) => [r.key, { id: r.id, field_type: r.field_type }]),
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CLEAR
// ════════════════════════════════════════════════════════════════════════════

const SEEDED_TABLES = [
  "patient_activity",
  "appointments",
  "credit_note_items",
  "credit_notes",
  "payments",
  "claims",
  "jobs",
  "sale_items",
  "sales",
  "stock_movements",
  "product_attribute_values",
  "patient_attribute_values",
  "product_images",
  "product_variants",
  "products",
  "prescriptions",
  "patients",
  "supplier_ledger",
  "suppliers",
  "brands",
  "categories",
  "payers",
];

/** Wipes every table this seeder populates (FK-safe order) and resets the
 * id sequences + the invoice/client-code counters. Attribute *definitions*
 * (seeded by the Rust migrations) are kept; only their values are removed. */
export async function clearSeedData(): Promise<void> {
  const db = await getDb();
  // No BEGIN/COMMIT or PRAGMA toggling: both are per-connection and the shared
  // pool hands each statement to an arbitrary connection. The deletes are in
  // FK-safe order and the whole wipe is idempotent — re-run it if it fails.
  for (const t of SEEDED_TABLES) await db.execute(`DELETE FROM ${t}`);
  await db.execute(
    `DELETE FROM sqlite_sequence WHERE name IN (${SEEDED_TABLES.map((t) => `'${t}'`).join(",")})`,
  );
  await db.execute(
    "UPDATE settings SET value = '1' WHERE key IN ('invoice_next','client_code_next')",
  );
  console.info("[seed] cleared seeded tables");
}

// ════════════════════════════════════════════════════════════════════════════
// SEED
// ════════════════════════════════════════════════════════════════════════════

export interface SeedOptions {
  /** Wipe seeded tables before inserting (otherwise refuses on a non-empty DB). */
  reset?: boolean;
}

// A sellable line resolved at insert time, with a live stock mirror so we never
// build a sale that create_sale would reject for insufficient stock.
type Kind =
  | "frame_optical"
  | "frame_sun"
  | "lens"
  | "accessory"
  | "contact"
  | "service";
interface Sellable {
  kind: Kind;
  product_id: number;
  variant_id: number | null;
  description: string;
  unit_price: number; // centimes
  category: ProductCategory;
  avail: number; // Infinity for services
}

export async function seedDatabase(opts: SeedOptions = {}): Promise<void> {
  const db = await getDb();
  const existing = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM patients",
  );
  if ((existing[0]?.n ?? 0) > 0) {
    if (!opts.reset) {
      throw new Error(
        "Database already has data. Call seedDatabase({ reset: true }) to wipe and reseed, or clearSeedData() first.",
      );
    }
    await clearSeedData();
  }

  console.info("[seed] starting…");
  const attr = await loadAttributes();

  const setAttrs = async (
    productId: number,
    dict: Record<string, string | number | string[]>,
  ) => {
    const values: AttributeValueInput[] = [];
    for (const [key, value] of Object.entries(dict)) {
      const meta = attr.get(key);
      if (!meta) continue;
      values.push({
        attribute_id: meta.id,
        field_type: meta.field_type,
        value,
      });
    }
    if (values.length) await setProductValues(productId, values);
  };

  // Resolves a free-text colour to a colour id via the alias table; the seeder is a
  // system bootstrap, so (unlike staff) it may create any colour the demo data needs.
  const colorCache = new Map<string, number>();
  const getColorId = async (raw?: string | null): Promise<number | null> => {
    if (!raw || !raw.trim()) return null;
    const key = raw.trim().toLowerCase();
    const cached = colorCache.get(key);
    if (cached != null) return cached;
    let id = await resolveColorId(raw);
    if (id == null) {
      id = await createColor({ name: raw.trim(), name_fr: raw.trim() });
      await addColorAlias(id, raw);
    }
    colorCache.set(key, id);
    return id;
  };

  // ── 1. Shop settings ──────────────────────────────────────────────────────
  await saveSettings({
    shop_name: "Optique El Bassar",
    shop_address: "12 Rue Didouche Mourad, Alger Centre, Alger",
    shop_phone: "+213 21 63 45 78",
    currency_symbol: "DA",
    invoice_footer: "Merci de votre visite — Optique El Bassar",
    invoice_prefix: "FA-2026-",
    invoice_padding: "5",
    tva_rate: "1900",
    timbre_rate: "100",
    timbre_min: "500",
    timbre_max: "250000",
    recall_months: "24",
    expiry_warn_days: "60",
    client_code_prefix: "P-",
    client_code_padding: "4",
  });

  // ── 2. Payers (third-party insurers) ──────────────────────────────────────
  const payerCnas = await createPayer({
    name: "CNAS",
    type: "Sécurité sociale",
    default_coverage_pct: 8000,
    notes: "Salariés — tiers payant optique.",
  });
  const payerCasnos = await createPayer({
    name: "CASNOS",
    type: "Sécurité sociale",
    default_coverage_pct: 7000,
    notes: "Non-salariés / indépendants.",
  });
  const payerMgptt = await createPayer({
    name: "Mutuelle MGPTT",
    type: "Mutuelle",
    default_coverage_pct: 10000,
    notes: "Complémentaire — couvre le reste à charge.",
  });
  const payerSaa = await createPayer({
    name: "Mutuelle SAA",
    type: "Mutuelle",
    default_coverage_pct: 5000,
    notes: "Assurance complémentaire entreprise.",
  });
  const payers = [
    { id: payerCnas, cov: 8000, prefix: "CNAS" },
    { id: payerCasnos, cov: 7000, prefix: "CASNOS" },
    { id: payerMgptt, cov: 10000, prefix: "MGPTT" },
    { id: payerSaa, cov: 5000, prefix: "SAA" },
  ];

  // ── 3. Suppliers + opening ledger movements ───────────────────────────────
  const suppliersDef = [
    {
      name: "Luxottica Algérie",
      email: "contact@luxottica-dz.com",
      note: "Ray-Ban, Oakley, Persol, Vogue.",
    },
    {
      name: "Safilo Distribution",
      email: "ventes@safilo-dz.com",
      note: "Carrera, Police, Tom Ford.",
    },
    {
      name: "Essilor Algérie",
      email: "labo@essilor-dz.com",
      note: "Verres + laboratoire de taillage.",
    },
    {
      name: "Novacel / BBGR",
      email: "commande@novacel-dz.com",
      note: "Verres progressifs et haut indice.",
    },
    {
      name: "Optic Hall Import",
      email: "info@optichall-dz.com",
      note: "Montures maison, accessoires, lentilles.",
    },
  ];
  const supplierIds: Record<string, number> = {};
  for (const s of suppliersDef) {
    const id = await createSupplier({
      name: s.name,
      phone: phone(),
      email: s.email,
      address: `${pick(STREETS)}, ${pick(CITIES)}`,
      notes: s.note,
    });
    supplierIds[s.name] = id;
    // A couple of purchases (we owe more) and a partial payment (we owe less),
    // leaving a realistic outstanding balance for the supplier statement.
    const buy1 = da(randInt(80, 240) * 1000);
    const buy2 = da(randInt(40, 160) * 1000);
    await addLedgerEntry({
      supplierId: id,
      type: "purchase",
      amount: buy1,
      note: "Commande montures/verres",
      ref: `BL-${randInt(1000, 9999)}`,
    });
    await addLedgerEntry({
      supplierId: id,
      type: "purchase",
      amount: buy2,
      note: "Réassort",
      ref: `BL-${randInt(1000, 9999)}`,
    });
    if (chance(0.8)) {
      await addLedgerEntry({
        supplierId: id,
        type: "payment",
        amount: -Math.round((buy1 + buy2) * (0.4 + rand() * 0.4)),
        note: "Versement",
        ref: `VIR-${randInt(1000, 9999)}`,
      });
    }
  }

  // ── 4. Managed merchandising taxonomy ─────────────────────────────────────
  const catDefs = [
    "Optique de vue",
    "Solaires",
    "Verres",
    "Lentilles de contact",
    "Accessoires",
    "Enfants",
  ];
  const categoryIds: Record<string, number> = {};
  for (const c of catDefs) categoryIds[c] = await createCategory(c);

  const brandDefs = [
    "Ray-Ban",
    "Oakley",
    "Persol",
    "Vogue",
    "Carrera",
    "Police",
    "Tom Ford",
    "Guess",
    "Essilor",
    "Zeiss",
    "Hoya",
    "BBGR",
    "Transitions",
    "Acuvue",
    "Biofinity",
    "Bausch+Lomb",
    "El Bassar (maison)",
  ];
  const brandIds: Record<string, number> = {};
  for (const b of brandDefs) brandIds[b] = await createBrand(b);

  // ── 5. Catalog ────────────────────────────────────────────────────────────
  const sellables: Sellable[] = [];
  let barcodeSeed = 1001;

  async function addProduct(args: {
    kind: Kind;
    category: ProductCategory;
    item_type?: ItemType;
    name: string;
    brand?: string;
    reference?: string;
    supplier?: string;
    categoryName?: string;
    purchase: number; // dinar
    selling: number; // dinar
    quantity: number;
    min_stock: number;
    expiry?: Date | null;
    attrs?: Record<string, string | number | string[]>;
    variants?: {
      color: string;
      size?: string;
      qty: number;
      min?: number;
      priceDelta?: number;
    }[];
  }): Promise<number> {
    const isService = (args.item_type ?? "product") === "service";
    const hasVariants = !!args.variants?.length;
    // Simple products carry their colour on the product; variant products carry it
    // per variant row, so the product-level colour stays null.
    const productColorId = hasVariants
      ? null
      : await getColorId(args.attrs?.frame_color as string | undefined);
    const input: ProductInput = {
      category: args.category,
      item_type: args.item_type ?? "product",
      name: args.name,
      brand: args.brand ?? null,
      reference: args.reference ?? null,
      barcode:
        isService || hasVariants ? null : generateEan13Local(barcodeSeed++),
      expiry_date: args.expiry ? ymd(args.expiry) : null,
      purchase_price: da(args.purchase),
      selling_price: da(args.selling),
      quantity: hasVariants ? 0 : args.quantity,
      min_stock: hasVariants ? 0 : args.min_stock,
      supplier: args.supplier ?? null,
      category_id: args.categoryName ? categoryIds[args.categoryName] : null,
      brand_id: args.brand ? brandIds[args.brand] : null,
      supplier_id: args.supplier ? supplierIds[args.supplier] : null,
      color_id: productColorId,
    };
    const productId = await createProduct(input);
    if (args.attrs) await setAttrs(productId, args.attrs);

    if (hasVariants) {
      for (const v of args.variants!) {
        const price = da(args.selling + (v.priceDelta ?? 0));
        const variantId = await createVariant(productId, {
          label: `${v.color}${v.size ? ` / ${v.size}` : ""}`,
          color_id: await getColorId(v.color),
          size: v.size ?? null,
          sku: `${(args.reference ?? args.name).slice(0, 6).toUpperCase().replace(/\s/g, "")}-${v.color.slice(0, 3).toUpperCase()}${v.size ?? ""}`,
          barcode: generateEan13Local(barcodeSeed++),
          quantity: v.qty,
          min_stock: v.min ?? 1,
          selling_price: price,
          purchase_price: da(args.purchase),
        });
        sellables.push({
          kind: args.kind,
          product_id: productId,
          variant_id: variantId,
          description: `${args.brand ? args.brand + " " : ""}${args.name} — ${v.color}${v.size ? ` ${v.size}` : ""}`,
          unit_price: price,
          category: args.category,
          avail: v.qty,
        });
      }
    } else if (!isService) {
      sellables.push({
        kind: args.kind,
        product_id: productId,
        variant_id: null,
        description: `${args.brand ? args.brand + " " : ""}${args.name}`,
        unit_price: da(args.selling),
        category: args.category,
        avail: args.quantity,
      });
    } else {
      sellables.push({
        kind: "service",
        product_id: productId,
        variant_id: null,
        description: args.name,
        unit_price: da(args.selling),
        category: args.category,
        avail: Infinity,
      });
    }
    return productId;
  }

  // Optical frames (mix of simple + variant products).
  await addProduct({
    kind: "frame_optical",
    category: "frame",
    categoryName: "Optique de vue",
    name: "Wayfarer RB5154 Clubmaster",
    brand: "Ray-Ban",
    reference: "RB5154",
    supplier: "Luxottica Algérie",
    purchase: 6500,
    selling: 16500,
    quantity: 0,
    min_stock: 2,
    attrs: {
      frame_material: "acetate",
      frame_shape: "browline",
      frame_rim: "semi-rimless",
      eye_size: 51,
      bridge: 21,
      temple: 145,
      gender: "unisex",
      suitable_for: ["distance", "reading"],
    },
    variants: [
      { color: "Noir", size: "51", qty: 4 },
      { color: "Havane", size: "51", qty: 3 },
      { color: "Écaille", size: "49", qty: 2, priceDelta: 0 },
    ],
  });
  await addProduct({
    kind: "frame_optical",
    category: "frame",
    categoryName: "Optique de vue",
    name: "Vogue VO5234",
    brand: "Vogue",
    reference: "VO5234",
    supplier: "Luxottica Algérie",
    purchase: 3800,
    selling: 9900,
    quantity: 0,
    min_stock: 2,
    attrs: {
      frame_material: "metal",
      frame_shape: "round",
      frame_rim: "full-rim",
      eye_size: 50,
      bridge: 20,
      temple: 140,
      gender: "women",
      suitable_for: ["distance"],
    },
    variants: [
      { color: "Doré", qty: 5 },
      { color: "Rose", qty: 2 },
    ],
  });
  await addProduct({
    kind: "frame_optical",
    category: "frame",
    categoryName: "Optique de vue",
    name: "Carrera 8821",
    brand: "Carrera",
    reference: "CA8821",
    supplier: "Safilo Distribution",
    purchase: 5200,
    selling: 13900,
    quantity: 6,
    min_stock: 2,
    attrs: {
      frame_material: "TR90",
      frame_shape: "rectangle",
      frame_rim: "full-rim",
      frame_color: "Noir mat",
      eye_size: 54,
      bridge: 17,
      temple: 145,
      gender: "men",
      suitable_for: ["distance", "computer"],
    },
  });
  await addProduct({
    kind: "frame_optical",
    category: "frame",
    categoryName: "Optique de vue",
    name: "Police VPLB12",
    brand: "Police",
    reference: "VPLB12",
    supplier: "Safilo Distribution",
    purchase: 4600,
    selling: 12500,
    quantity: 5,
    min_stock: 2,
    attrs: {
      frame_material: "metal",
      frame_shape: "square",
      frame_rim: "full-rim",
      frame_color: "Gunmetal",
      eye_size: 53,
      bridge: 18,
      temple: 145,
      gender: "men",
      suitable_for: ["distance"],
    },
  });
  await addProduct({
    kind: "frame_optical",
    category: "frame",
    categoryName: "Optique de vue",
    name: "Guess GU2745",
    brand: "Guess",
    reference: "GU2745",
    supplier: "Optic Hall Import",
    purchase: 3200,
    selling: 8500,
    quantity: 7,
    min_stock: 2,
    attrs: {
      frame_material: "acetate",
      frame_shape: "cat-eye",
      frame_rim: "full-rim",
      frame_color: "Bordeaux",
      eye_size: 52,
      bridge: 16,
      temple: 140,
      gender: "women",
      suitable_for: ["distance"],
    },
  });
  await addProduct({
    kind: "frame_optical",
    category: "frame",
    categoryName: "Enfants",
    name: "Monture Enfant Flex",
    brand: "El Bassar (maison)",
    reference: "KID-FLEX",
    supplier: "Optic Hall Import",
    purchase: 1200,
    selling: 4500,
    quantity: 10,
    min_stock: 4,
    attrs: {
      frame_material: "TR90",
      frame_shape: "oval",
      frame_rim: "full-rim",
      frame_color: "Bleu",
      eye_size: 44,
      bridge: 15,
      temple: 125,
      gender: "kids",
      suitable_for: ["distance"],
    },
  });
  await addProduct({
    kind: "frame_optical",
    category: "frame",
    categoryName: "Optique de vue",
    name: "Titane Léger T-200",
    brand: "El Bassar (maison)",
    reference: "T200",
    supplier: "Optic Hall Import",
    purchase: 2800,
    selling: 7900,
    quantity: 8,
    min_stock: 3,
    attrs: {
      frame_material: "titanium",
      frame_shape: "rectangle",
      frame_rim: "rimless",
      frame_color: "Argent",
      eye_size: 53,
      bridge: 18,
      temple: 140,
      gender: "unisex",
      suitable_for: ["distance", "computer"],
    },
  });
  await addProduct({
    kind: "frame_optical",
    category: "frame",
    categoryName: "Optique de vue",
    name: "Tom Ford FT5634",
    brand: "Tom Ford",
    reference: "FT5634",
    supplier: "Safilo Distribution",
    purchase: 11000,
    selling: 28000,
    quantity: 3,
    min_stock: 1,
    attrs: {
      frame_material: "acetate",
      frame_shape: "square",
      frame_rim: "full-rim",
      frame_color: "Noir brillant",
      eye_size: 55,
      bridge: 18,
      temple: 145,
      gender: "men",
      suitable_for: ["distance"],
    },
  });

  // Sunglasses (frame_sun).
  await addProduct({
    kind: "frame_sun",
    category: "frame",
    categoryName: "Solaires",
    name: "Aviator RB3025",
    brand: "Ray-Ban",
    reference: "RB3025",
    supplier: "Luxottica Algérie",
    purchase: 7200,
    selling: 18500,
    quantity: 0,
    min_stock: 2,
    attrs: {
      frame_material: "metal",
      frame_shape: "aviator",
      frame_rim: "full-rim",
      eye_size: 58,
      bridge: 14,
      temple: 135,
      gender: "unisex",
      suitable_for: ["sun", "driving"],
    },
    variants: [
      { color: "Or / Vert G15", qty: 4 },
      { color: "Argent / Miroir", qty: 3, priceDelta: 1500 },
    ],
  });
  await addProduct({
    kind: "frame_sun",
    category: "frame",
    categoryName: "Solaires",
    name: "Wayfarer RB2140",
    brand: "Ray-Ban",
    reference: "RB2140",
    supplier: "Luxottica Algérie",
    purchase: 6800,
    selling: 17500,
    quantity: 6,
    min_stock: 2,
    attrs: {
      frame_material: "acetate",
      frame_shape: "square",
      frame_rim: "full-rim",
      frame_color: "Noir",
      eye_size: 50,
      bridge: 22,
      temple: 150,
      gender: "unisex",
      suitable_for: ["sun", "driving"],
    },
  });
  await addProduct({
    kind: "frame_sun",
    category: "frame",
    categoryName: "Solaires",
    name: "Oakley Holbrook OO9102",
    brand: "Oakley",
    reference: "OO9102",
    supplier: "Luxottica Algérie",
    purchase: 8200,
    selling: 21000,
    quantity: 4,
    min_stock: 1,
    attrs: {
      frame_material: "TR90",
      frame_shape: "square",
      frame_rim: "full-rim",
      frame_color: "Noir mat",
      eye_size: 55,
      bridge: 18,
      temple: 137,
      gender: "men",
      suitable_for: ["sun", "sport", "driving"],
    },
  });
  await addProduct({
    kind: "frame_sun",
    category: "frame",
    categoryName: "Solaires",
    name: "Persol PO3007",
    brand: "Persol",
    reference: "PO3007",
    supplier: "Luxottica Algérie",
    purchase: 9000,
    selling: 23500,
    quantity: 3,
    min_stock: 1,
    attrs: {
      frame_material: "acetate",
      frame_shape: "round",
      frame_rim: "full-rim",
      frame_color: "Havane",
      eye_size: 53,
      bridge: 21,
      temple: 145,
      gender: "men",
      suitable_for: ["sun"],
    },
  });

  // Lenses (category 'lens' → auto-creates a lab job when sold).
  await addProduct({
    kind: "lens",
    category: "lens",
    categoryName: "Verres",
    name: "Verres unifocaux 1.5 AR (la paire)",
    brand: "Essilor",
    reference: "UNI-15-AR",
    supplier: "Essilor Algérie",
    purchase: 1800,
    selling: 5500,
    quantity: 40,
    min_stock: 8,
    attrs: {
      lens_material: "CR-39",
      lens_index: 1.5,
      coatings: ["AR", "UV", "scratch-resistant"],
      suitable_for: ["distance"],
    },
  });
  await addProduct({
    kind: "lens",
    category: "lens",
    categoryName: "Verres",
    name: "Verres unifocaux 1.6 AR + anti-lumière bleue",
    brand: "Essilor",
    reference: "EYEZEN-16",
    supplier: "Essilor Algérie",
    purchase: 3200,
    selling: 9800,
    quantity: 30,
    min_stock: 6,
    attrs: {
      lens_material: "high-index 1.67",
      lens_index: 1.6,
      coatings: ["AR", "blue-light", "UV"],
      suitable_for: ["computer", "distance"],
    },
  });
  await addProduct({
    kind: "lens",
    category: "lens",
    categoryName: "Verres",
    name: "Verres progressifs Varilux Comfort 1.5",
    brand: "Essilor",
    reference: "VARILUX-C15",
    supplier: "Essilor Algérie",
    purchase: 9500,
    selling: 28000,
    quantity: 20,
    min_stock: 4,
    attrs: {
      lens_material: "CR-39",
      lens_index: 1.5,
      coatings: ["AR", "UV", "scratch-resistant"],
      suitable_for: ["reading", "distance"],
    },
  });
  await addProduct({
    kind: "lens",
    category: "lens",
    categoryName: "Verres",
    name: "Verres progressifs Zeiss SmartLife 1.6",
    brand: "Zeiss",
    reference: "ZEISS-SL16",
    supplier: "Novacel / BBGR",
    purchase: 14000,
    selling: 39000,
    quantity: 12,
    min_stock: 3,
    attrs: {
      lens_material: "high-index 1.67",
      lens_index: 1.6,
      coatings: ["AR", "blue-light", "UV"],
      suitable_for: ["reading", "distance", "computer"],
    },
  });
  await addProduct({
    kind: "lens",
    category: "lens",
    categoryName: "Verres",
    name: "Verres photochromiques Transitions 1.5",
    brand: "Transitions",
    reference: "TRANS-15",
    supplier: "Novacel / BBGR",
    purchase: 5200,
    selling: 15500,
    quantity: 18,
    min_stock: 4,
    attrs: {
      lens_material: "CR-39",
      lens_index: 1.5,
      coatings: ["AR", "photochromic", "UV"],
      suitable_for: ["distance", "sun"],
    },
  });
  await addProduct({
    kind: "lens",
    category: "lens",
    categoryName: "Verres",
    name: "Verres haut indice 1.67 AR",
    brand: "BBGR",
    reference: "HI-167",
    supplier: "Novacel / BBGR",
    purchase: 4800,
    selling: 14000,
    quantity: 22,
    min_stock: 5,
    attrs: {
      lens_material: "high-index 1.67",
      lens_index: 1.67,
      coatings: ["AR", "UV"],
      suitable_for: ["distance"],
    },
  });
  await addProduct({
    kind: "lens",
    category: "lens",
    categoryName: "Verres",
    name: "Verres polycarbonate enfant 1.59",
    brand: "Hoya",
    reference: "PC-159",
    supplier: "Novacel / BBGR",
    purchase: 2600,
    selling: 7500,
    quantity: 16,
    min_stock: 4,
    attrs: {
      lens_material: "polycarbonate",
      lens_index: 1.59,
      coatings: ["AR", "UV", "scratch-resistant"],
      suitable_for: ["distance", "sport"],
    },
  });

  // Accessories + contact lenses (some near expiry, some low stock).
  await addProduct({
    kind: "accessory",
    category: "accessory",
    categoryName: "Accessoires",
    name: "Étui rigide",
    brand: "El Bassar (maison)",
    supplier: "Optic Hall Import",
    purchase: 200,
    selling: 700,
    quantity: 60,
    min_stock: 10,
  });
  await addProduct({
    kind: "accessory",
    category: "accessory",
    categoryName: "Accessoires",
    name: "Chiffon microfibre",
    brand: "El Bassar (maison)",
    supplier: "Optic Hall Import",
    purchase: 60,
    selling: 300,
    quantity: 4,
    min_stock: 15,
  }); // low stock
  await addProduct({
    kind: "accessory",
    category: "accessory",
    categoryName: "Accessoires",
    name: "Cordon à lunettes",
    brand: "El Bassar (maison)",
    supplier: "Optic Hall Import",
    purchase: 150,
    selling: 600,
    quantity: 25,
    min_stock: 8,
  });
  await addProduct({
    kind: "accessory",
    category: "accessory",
    categoryName: "Accessoires",
    name: "Spray nettoyant 30ml",
    brand: "El Bassar (maison)",
    supplier: "Optic Hall Import",
    purchase: 280,
    selling: 900,
    quantity: 18,
    min_stock: 6,
    expiry: daysAhead(45),
  }); // expiring soon
  await addProduct({
    kind: "accessory",
    category: "accessory",
    categoryName: "Accessoires",
    name: "Kit réparation lunettes",
    brand: "El Bassar (maison)",
    supplier: "Optic Hall Import",
    purchase: 180,
    selling: 750,
    quantity: 12,
    min_stock: 5,
  });
  await addProduct({
    kind: "contact",
    category: "accessory",
    categoryName: "Lentilles de contact",
    name: "Lentilles Acuvue Oasys (boîte 6)",
    brand: "Acuvue",
    reference: "OASYS-6",
    supplier: "Optic Hall Import",
    purchase: 1900,
    selling: 3500,
    quantity: 14,
    min_stock: 6,
    expiry: daysAhead(380),
  });
  await addProduct({
    kind: "contact",
    category: "accessory",
    categoryName: "Lentilles de contact",
    name: "Lentilles Biofinity (boîte 3)",
    brand: "Biofinity",
    reference: "BIO-3",
    supplier: "Optic Hall Import",
    purchase: 1600,
    selling: 3000,
    quantity: 3,
    min_stock: 5,
    expiry: daysAhead(30),
  }); // low + expiring
  await addProduct({
    kind: "contact",
    category: "accessory",
    categoryName: "Lentilles de contact",
    name: "Solution Renu 360ml",
    brand: "Bausch+Lomb",
    reference: "RENU-360",
    supplier: "Optic Hall Import",
    purchase: 700,
    selling: 1400,
    quantity: 22,
    min_stock: 8,
    expiry: daysAhead(120),
  });
  await addProduct({
    kind: "contact",
    category: "accessory",
    categoryName: "Lentilles de contact",
    name: "Gouttes hydratantes 10ml",
    brand: "Bausch+Lomb",
    reference: "DROPS-10",
    supplier: "Optic Hall Import",
    purchase: 320,
    selling: 850,
    quantity: 16,
    min_stock: 6,
    expiry: daysAhead(-10),
  }); // already expired

  // Services (no stock).
  await addProduct({
    kind: "service",
    category: "accessory",
    item_type: "service",
    name: "Examen de vue",
    selling: 1500,
    purchase: 0,
    quantity: 0,
    min_stock: 0,
  });
  await addProduct({
    kind: "service",
    category: "accessory",
    item_type: "service",
    name: "Montage de verres",
    selling: 800,
    purchase: 0,
    quantity: 0,
    min_stock: 0,
  });
  await addProduct({
    kind: "service",
    category: "accessory",
    item_type: "service",
    name: "Réparation monture",
    selling: 1200,
    purchase: 0,
    quantity: 0,
    min_stock: 0,
  });
  await addProduct({
    kind: "service",
    category: "accessory",
    item_type: "service",
    name: "Ajustement / réglage",
    selling: 400,
    purchase: 0,
    quantity: 0,
    min_stock: 0,
  });
  await addProduct({
    kind: "service",
    category: "accessory",
    item_type: "service",
    name: "Adaptation lentilles",
    selling: 1800,
    purchase: 0,
    quantity: 0,
    min_stock: 0,
  });

  const framesOptical = sellables.filter((s) => s.kind === "frame_optical");
  const framesSun = sellables.filter((s) => s.kind === "frame_sun");
  const lenses = sellables.filter((s) => s.kind === "lens");
  const accessories = sellables.filter(
    (s) => s.kind === "accessory" || s.kind === "contact",
  );
  const svcExam = sellables.find(
    (s) => s.kind === "service" && s.description === "Examen de vue",
  )!;
  const svcMontage = sellables.find(
    (s) => s.kind === "service" && s.description === "Montage de verres",
  )!;

  console.info(`[seed] catalog: ${sellables.length} sellable lines`);

  // ── 6. Patients (+ prescriptions, custom tags, activity) ──────────────────
  interface SeedPatient {
    id: number;
    name: string;
    payerId: number | null;
    coverage: number;
    rxIds: number[];
  }
  const patients: SeedPatient[] = [];

  for (let i = 0; i < 30; i++) {
    const isFemale = chance(0.5);
    const fname = isFemale ? pick(FEMALE) : pick(MALE);
    const name = `${fname} ${pick(LAST)}`;
    const birthYear = randInt(1955, 2017); // kids → seniors
    const dob = `${birthYear}-${pad2(randInt(1, 12))}-${pad2(randInt(1, 28))}`;
    const insured = chance(0.5);
    const payer = insured ? pick(payers) : null;
    const createdAt = daysAgo(randInt(20, 400));

    const id = await createPatient({
      full_name: name,
      phone: phone(),
      phone2: chance(0.2) ? phone() : null,
      email: chance(0.4)
        ? `${fname.toLowerCase()}.${randInt(1, 999)}@gmail.com`
        : null,
      address: `${randInt(1, 80)} ${pick(STREETS)}, ${pick(CITIES)}`,
      date_of_birth: dob,
      national_id: chance(0.7) ? nin() : null,
      default_payer_id: payer?.id ?? null,
      default_coverage_pct: payer?.cov ?? 0,
      insurance_policy_no: payer ? policyNo(payer.prefix) : null,
      notes: chance(0.25)
        ? pick([
            "Client fidèle.",
            "Préfère être appelé l'après-midi.",
            "Sensible à la lumière.",
            "Porteur de lentilles depuis 2 ans.",
          ])
        : null,
    });

    // Backdate the created_at so the timeline/aging looks real, and log it.
    await db.execute(
      "UPDATE patients SET created_at = $1, updated_at = $1 WHERE id = $2",
      [ymdhms(createdAt), id],
    );
    await logActivity(id, "created", "Fiche client créée", id).catch(() => {});

    // Custom client tags.
    const tags: string[] = [];
    if (insured) tags.push("Assuré");
    if (chance(0.25)) tags.push("VIP");
    if (chance(0.25)) tags.push("Lentilles");
    if (chance(0.2)) tags.push("À rappeler");
    if (tags.length) {
      const meta = attr.get("client_tags");
      if (meta)
        await setPatientValues(id, [
          { attribute_id: meta.id, field_type: meta.field_type, value: tags },
        ]);
    }

    // Prescriptions for ~70% of adults (kids get one too sometimes).
    const rxIds: number[] = [];
    const age = NOW.getFullYear() - birthYear;
    if (chance(0.75)) {
      const nRx = chance(0.3) ? 2 : 1;
      for (let r = 0; r < nRx; r++) {
        const examDate = daysAgo(randInt(10, 700) - r * 200);
        const presbyope = age >= 45;
        const rxId = await createPrescription(
          makeRx(
            id,
            ymd(examDate < createdAt ? createdAt : examDate),
            presbyope,
          ),
        );
        rxIds.push(rxId);
        await logActivity(
          id,
          "prescription",
          "Ordonnance enregistrée",
          rxId,
        ).catch(() => {});
      }
    }
    patients.push({
      id,
      name,
      payerId: payer?.id ?? null,
      coverage: payer?.cov ?? 0,
      rxIds,
    });
  }

  console.info(`[seed] ${patients.length} patients`);

  // ── 7. Appointments (past history + upcoming schedule) ────────────────────
  for (const p of sample(patients, 22)) {
    // A past, completed exam — link a prescription if the patient has one.
    if (chance(0.7)) {
      const d = daysAgo(randInt(5, 160));
      const apptId = await createAppointment({
        patient_id: p.id,
        starts_at: at(d, randInt(9, 16), pick([0, 30])),
        duration_min: 30,
        optometrist: pick(OPTOMETRISTS),
        reason: "Examen de vue",
      });
      if (p.rxIds.length && chance(0.6))
        await linkAppointmentPrescription(apptId, p.rxIds[0]);
      else
        await setAppointmentStatus(
          apptId,
          pick(["done", "done", "no_show", "cancelled"]),
        );
      await logActivity(p.id, "appointment", "Rendez-vous", apptId).catch(
        () => {},
      );
    }
    // An upcoming booked appointment for some.
    if (chance(0.4)) {
      const d = daysAhead(randInt(1, 25));
      await createAppointment({
        patient_id: p.id,
        starts_at: at(d, randInt(9, 16), pick([0, 30])),
        duration_min: 30,
        optometrist: pick(OPTOMETRISTS),
        reason: pick([
          "Contrôle annuel",
          "Adaptation lentilles",
          "Renouvellement",
          "Examen de vue",
        ]),
      });
    }
  }

  // ── 8. Sales (the heart: exercises every state) ───────────────────────────
  const PAY_METHODS = [
    "cash",
    "cash",
    "cash",
    "card",
    "cheque",
    "transfer",
  ] as const;

  const reserve = (s: Sellable, qty: number): boolean => {
    if (s.avail < qty) return false;
    s.avail -= qty;
    return true;
  };

  interface BuiltItem {
    product_id: number | null;
    variant_id: number | null;
    description: string;
    unit_price: number;
    quantity: number;
    item_discount: number;
  }

  // Tracks created sales so we can later attach returns / store-credit redemption.
  interface CreatedSale {
    saleId: number;
    patientIdx: number;
    date: Date;
    hasLens: boolean;
    method: string;
  }
  const created: CreatedSale[] = [];

  async function makeSale(args: {
    patient: SeedPatient;
    items: BuiltItem[];
    date: Date;
    method: (typeof PAY_METHODS)[number];
    prescriptionId?: number | null;
    discountType?: "amount" | "percent";
    discountValue?: number;
    payAll?: boolean; // pay patient's full part
    payFraction?: number; // else pay this fraction of goods (0 = unpaid)
    payerId?: number | null;
    coverage?: number | null;
    note?: string | null;
  }): Promise<number | null> {
    if (!args.items.length) return null;
    const goods = args.items.reduce(
      (sum, it) =>
        sum + Math.max(0, it.unit_price * it.quantity - it.item_discount),
      0,
    );
    let initial = 0;
    if (args.payAll) initial = BIG;
    else if (args.payFraction != null)
      initial = Math.round(goods * args.payFraction);

    const res = await commands.createSale({
      patient_id: args.patient.id,
      prescription_id: args.prescriptionId ?? null,
      sale_date: ymdhms(args.date),
      discount_type: args.discountType ?? "amount",
      discount_value: args.discountValue ?? 0,
      notes: args.note ?? null,
      items: args.items,
      initial_payment: initial,
      payment_method: args.method,
      payer_id: args.payerId ?? null,
      coverage_pct: args.coverage ?? null,
    });
    if (res.status === "error") {
      console.warn("[seed] sale skipped:", res.error);
      return null;
    }
    const saleId = res.data;
    const hasLens = args.items.some((it) =>
      lenses.some((l) => l.product_id === it.product_id),
    );
    created.push({
      saleId,
      patientIdx: patients.indexOf(args.patient),
      date: args.date,
      hasLens,
      method: args.method,
    });
    await logActivity(
      args.patient.id,
      "sale",
      "Vente enregistrée",
      saleId,
    ).catch(() => {});
    return saleId;
  }

  // Build the standard "pair of glasses" basket from current stock.
  function buildGlasses(sun = false): BuiltItem[] | null {
    const framePool = sun ? framesSun : framesOptical;
    const frame = pick(framePool);
    if (!reserve(frame, 1)) return null;
    const items: BuiltItem[] = [
      {
        product_id: frame.product_id,
        variant_id: frame.variant_id,
        description: frame.description,
        unit_price: frame.unit_price,
        quantity: 1,
        item_discount: chance(0.15) ? da(randInt(3, 10) * 100) : 0,
      },
    ];
    // Optical glasses always get lenses; sunglasses get RX lenses ~30% of the time.
    if (!sun || chance(0.3)) {
      const lens = pick(lenses);
      if (reserve(lens, 1)) {
        items.push({
          product_id: lens.product_id,
          variant_id: null,
          description: lens.description,
          unit_price: lens.unit_price,
          quantity: 1,
          item_discount: 0,
        });
        if (chance(0.6))
          items.push({
            product_id: svcMontage.product_id,
            variant_id: null,
            description: svcMontage.description,
            unit_price: svcMontage.unit_price,
            quantity: 1,
            item_discount: 0,
          });
      }
    }
    if (chance(0.3))
      items.push({
        product_id: svcExam.product_id,
        variant_id: null,
        description: svcExam.description,
        unit_price: svcExam.unit_price,
        quantity: 1,
        item_discount: 0,
      });
    return items;
  }

  function buildAccessory(): BuiltItem[] | null {
    const chosen = sample(accessories, randInt(1, 2));
    const items: BuiltItem[] = [];
    for (const a of chosen) {
      const qty = a.kind === "contact" ? randInt(1, 2) : 1;
      if (reserve(a, qty))
        items.push({
          product_id: a.product_id,
          variant_id: a.variant_id,
          description: a.description,
          unit_price: a.unit_price,
          quantity: qty,
          item_discount: 0,
        });
    }
    return items.length ? items : null;
  }

  // ~50 sales total, biased to cover all the requested states.
  let salesMade = 0;
  let attempts = 0;
  while (salesMade < 46 && attempts < 200) {
    attempts++;
    const patient = pick(patients);
    const roll = rand();
    let items: BuiltItem[] | null;
    let prescriptionId: number | null = null;

    if (roll < 0.55) {
      items = buildGlasses(false);
      prescriptionId = patient.rxIds[0] ?? null;
    } else if (roll < 0.75) {
      items = buildGlasses(true);
    } else {
      items = buildAccessory();
    }
    if (!items) continue;

    const date = daysAgo(randInt(2, 178));
    const method = pick(PAY_METHODS);

    // Insurance: attach the patient's default payer on ~half of their glasses sales.
    const isGlasses = roll < 0.75;
    const useInsurer = isGlasses && patient.payerId != null && chance(0.6);

    // Payment state distribution.
    const stateRoll = rand();
    let payAll = false;
    let payFraction: number | undefined;
    if (stateRoll < 0.55)
      payAll = true; // fully paid
    else if (stateRoll < 0.85)
      payFraction = 0.3 + rand() * 0.4; // partial (outstanding)
    else payFraction = 0; // unpaid

    // Occasional discount.
    let discountType: "amount" | "percent" | undefined;
    let discountValue: number | undefined;
    const dRoll = rand();
    if (dRoll < 0.18) {
      discountType = "percent";
      discountValue = pick([500, 1000, 1500]);
    } else if (dRoll < 0.28) {
      discountType = "amount";
      discountValue = da(randInt(5, 20) * 100);
    }

    const saleId = await makeSale({
      patient,
      items,
      date,
      method,
      prescriptionId,
      discountType,
      discountValue,
      payAll,
      payFraction,
      payerId: useInsurer ? patient.payerId : null,
      coverage: useInsurer ? patient.coverage : null,
      note: chance(0.15)
        ? pick([
            "Livraison sous 7 jours.",
            "Client pressé.",
            "Renouvellement monture.",
          ])
        : null,
    });
    if (saleId == null) continue;
    salesMade++;

    // For partial sales, sometimes add a follow-up installment (payment history).
    if (payFraction != null && payFraction > 0 && chance(0.5)) {
      const pay = await commands.recordPayment(
        saleId,
        da(randInt(10, 40) * 100),
        pick(PAY_METHODS),
        "Acompte",
      );
      if (pay.status === "ok")
        await logActivity(patient.id, "payment", "Acompte reçu", saleId).catch(
          () => {},
        );
    }
  }

  console.info(`[seed] ${salesMade} sales created`);

  // ── 9. Progress lab jobs (auto-created for lens sales) ────────────────────
  const jobRows = await db.select<{ id: number; sale_id: number }[]>(
    "SELECT id, sale_id FROM jobs",
  );
  for (const job of jobRows) {
    const sale = created.find((c) => c.saleId === job.sale_id);
    const ageDays = sale
      ? Math.round((NOW.getTime() - sale.date.getTime()) / DAY)
      : randInt(1, 60);
    // Older orders are further along the pipeline. Walk each job through its
    // intermediate stages so the per-order timeline looks real.
    let path: JobStatus[];
    if (ageDays > 25)
      path = pick<JobStatus[]>([
        ["in_progress", "ready", "delivered"],
        ["in_progress", "ready", "delivered"],
        ["in_progress", "ready"],
      ]);
    else if (ageDays > 12)
      path = pick<JobStatus[]>([
        ["in_progress", "ready"],
        ["in_progress", "ready", "delivered"],
      ]);
    else if (ageDays > 5)
      path = pick<JobStatus[]>([["in_progress"], ["in_progress", "ready"]]);
    else path = pick<JobStatus[]>([[], ["in_progress"]]);

    const orderedAt = sale ? sale.date : daysAgo(ageDays);
    const expected = new Date(orderedAt.getTime() + randInt(5, 12) * DAY);
    await updateJobDetails(job.id, {
      lab: pick(LABS),
      expected_ready: ymd(expected),
      notes: chance(0.2) ? "Verres en rupture côté labo." : null,
    });
    for (const status of path) await updateJobStatus(job.id, status);
  }
  console.info(`[seed] ${jobRows.length} lab jobs progressed`);

  // ── 10. Progress insurance claims (auto-created for payer sales) ──────────
  const claimRows = await db.select<{ id: number; covered_amount: number }[]>(
    "SELECT id, covered_amount FROM claims",
  );
  for (const claim of claimRows) {
    const roll = rand();
    const ref = `SIN-${randInt(100000, 999999)}`;
    if (roll < 0.2) {
      // leave pending
    } else if (roll < 0.45) {
      await updateClaimStatus(claim.id, "submitted", ref);
    } else if (roll < 0.65) {
      await updateClaimStatus(claim.id, "submitted", ref);
      await recordClaimPayment(
        claim.id,
        Math.round(claim.covered_amount * (0.4 + rand() * 0.3)),
      ); // → partial
    } else if (roll < 0.9) {
      await updateClaimStatus(claim.id, "submitted", ref);
      await recordClaimPayment(claim.id, claim.covered_amount); // → paid
    } else {
      await updateClaimStatus(claim.id, "rejected", ref);
    }
  }
  console.info(`[seed] ${claimRows.length} insurance claims progressed`);

  // ── 11. Returns: one refund, one store-credit (+ later redemption) ────────
  await seedReturns(db, created, lenses);

  console.info("[seed] ✅ done");
}

// ── prescription generator ──────────────────────────────────────────────────
function diopter(min: number, max: number): number {
  const steps = Math.round((max - min) / 0.25);
  return Math.round((min + randInt(0, steps) * 0.25) * 100) / 100;
}
function makeRx(patientId: number, examDate: string, presbyope: boolean) {
  const lensType = presbyope
    ? pick(["progressive", "progressive", "bifocal"])
    : pick(["single-vision", "single-vision", "progressive"]);
  const add =
    presbyope || lensType !== "single-vision" ? diopter(0.75, 2.5) : null;
  const exam = new Date(examDate);
  const expiry = new Date(
    exam.getFullYear() + 2,
    exam.getMonth(),
    exam.getDate(),
  );
  const hasCyl = chance(0.6);
  return {
    patient_id: patientId,
    exam_date: examDate,
    r_sphere: diopter(-6, 3),
    r_cylinder: hasCyl ? diopter(-2.5, -0.25) : null,
    r_axis: hasCyl ? randInt(0, 180) : null,
    r_add: add,
    r_pd: randInt(29, 34),
    l_sphere: diopter(-6, 3),
    l_cylinder: hasCyl ? diopter(-2.5, -0.25) : null,
    l_axis: hasCyl ? randInt(0, 180) : null,
    l_add: add,
    l_pd: randInt(29, 34),
    lens_type: lensType,
    r_prism: null,
    r_base: null,
    r_seg_height: lensType === "progressive" ? randInt(14, 20) : null,
    l_prism: null,
    l_base: null,
    l_seg_height: lensType === "progressive" ? randInt(14, 20) : null,
    prescriber: pick(PRESCRIBERS),
    expiry_date: ymd(expiry),
    notes: chance(0.2) ? "Renouvellement, pas de changement majeur." : null,
  };
}

// ── returns helper ──────────────────────────────────────────────────────────
async function seedReturns(
  db: Awaited<ReturnType<typeof getDb>>,
  created: { saleId: number; patientIdx: number; date: Date }[],
  lenses: { product_id: number }[],
): Promise<void> {
  const lensIds = new Set(lenses.map((l) => l.product_id));
  // Pick fully/partly paid sales old enough to have a return, preferring those
  // with a returnable physical (non-lens, non-service) item.
  const candidates = [...created].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  let refundsDone = 0;

  for (const c of candidates) {
    if (refundsDone >= 1) break;
    const items = await db.select<
      {
        id: number;
        product_id: number | null;
        quantity: number;
        item_type: string | null;
      }[]
    >(
      `SELECT si.id, si.product_id, si.quantity, p.item_type
       FROM sale_items si LEFT JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = $1`,
      [c.saleId],
    );
    const returnable = items.find(
      (it) =>
        it.product_id != null &&
        it.item_type !== "service" &&
        !lensIds.has(it.product_id) &&
        it.quantity > 0,
    );
    if (!returnable) continue;

    const r = await commands.createReturn({
      sale_id: c.saleId,
      method: "refund",
      notes: "Monture ne convenait pas — remboursement.",
      items: [{ sale_item_id: returnable.id, quantity: 1 }],
    });
    if (r.status === "ok") refundsDone++;
  }
}

// ── local EAN-13 generator (mirrors src/lib/barcode.ts; kept inline so the seed
// module has no dependency on the canvas-bound barcode renderer) ─────────────
function generateEan13Local(seed: number): string {
  const base = "20" + String(Math.abs(seed) % 1e10).padStart(10, "0");
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = base.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? n : n * 3;
  }
  return base + String((10 - (sum % 10)) % 10);
}
