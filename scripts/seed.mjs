// Standalone, app-independent demo seeder for Opt DZ.
//
// Writes directly to the SQLite database the desktop app already created
// (schema = the Rust migrations), so it needs NO Tauri permissions and NO
// rebuild. It replicates the exact server-side math from src-tauri/src/lib.rs
// (`create_sale` / `create_return`): centimes money, TVA extracted from the TTC
// total, droit de timbre on cash sales, insurer-covered claims kept OUT of the
// patient balance, gap-free invoice numbers, stock movements, lab jobs for lens
// sales, returns + store credit. Unlike the in-app commands it can backdate every
// timestamp, so payments/claims/jobs land on realistic historical dates.
//
// Usage (app should be CLOSED so the new data shows on next open):
//   node scripts/seed.mjs            # refuses if patients already exist
//   node scripts/seed.mjs --reset    # wipe seeded tables, then seed
//   node scripts/seed.mjs --clear    # wipe seeded tables only
//
// DB path resolves to the Tauri app-config dir for identifier com.hamawebdev.optdz.

import { DatabaseSync } from "node:sqlite";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

// ── locate the database ─────────────────────────────────────────────────────
const IDENT = "com.hamawebdev.optdz";
function dbPath() {
  const home = homedir();
  if (process.env.OPTDZ_DB) return process.env.OPTDZ_DB;
  if (platform() === "darwin") return join(home, "Library", "Application Support", IDENT, "app.db");
  if (platform() === "win32") return join(process.env.APPDATA || join(home, "AppData", "Roaming"), IDENT, "app.db");
  return join(home, ".config", IDENT, "app.db"); // linux
}
const DB_FILE = dbPath();
if (!existsSync(DB_FILE)) {
  console.error(`Database not found at ${DB_FILE}. Launch the app once so the migrations create it, then re-run.`);
  process.exit(1);
}

const MODE = process.argv.includes("--reset") ? "reset" : process.argv.includes("--clear") ? "clear" : "seed";

// ── deterministic helpers ───────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0x5eed1234);
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));
const chance = (p) => rand() < p;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
function sample(arr, n) {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  return c.slice(0, Math.min(n, c.length));
}
const da = (dinar) => Math.round(dinar * 100);

const DAY = 86_400_000;
const NOW = new Date();
const p2 = (n) => String(n).padStart(2, "0");
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY);
const daysAhead = (n) => new Date(NOW.getTime() + n * DAY);
const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const ymdhms = (d) => `${ymd(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
const at = (d, hh, mm) => `${ymd(d)} ${p2(hh)}:${p2(mm)}`;

// ── locale pools ────────────────────────────────────────────────────────────
const MALE = ["Karim","Sofiane","Yacine","Amine","Bilal","Riad","Mehdi","Walid","Nabil","Hamza","Toufik","Adel","Reda","Lyes","Samir","Farid","Mourad","Djamel","Khaled","Aymen"];
const FEMALE = ["Yasmine","Amina","Sara","Nadia","Lila","Imene","Manel","Hiba","Soraya","Kahina","Meriem","Asma","Wassila","Fatima","Nawel","Lina","Rania","Selma","Dalia","Hayet"];
const LAST = ["Benali","Hamadi","Khelifi","Belkacem","Boudiaf","Bouzid","Cherif","Mansouri","Saadi","Brahimi","Zerrouki","Haddad","Lounis","Meziane","Taleb","Slimani","Ferhat","Ouali","Bensalem","Guerroudj","Rahmani","Lakhdar","Bouchama","Ait Said"];
const CITIES = ["Alger Centre","Hydra, Alger","Bab Ezzouar, Alger","Kouba, Alger","El Biar, Alger","Cheraga, Alger","Dely Ibrahim, Alger","Bir Mourad Raïs, Alger","Birkhadem, Alger","Blida","Boumerdès","Tizi Ouzou"];
const STREETS = ["Rue Didouche Mourad","Bd Mohamed V","Cité 1200 Logements","Rue Larbi Ben M'hidi","Avenue de l'ALN","Cité des Frères Abbad","Rue Hassiba Ben Bouali","Lotissement El Feth"];
const OPTOMETRISTS = ["Dr. Brahimi","Dr. Hamidi","Dr. Cherifi"];
const PRESCRIBERS = ["Dr. Brahimi (opticien)","Dr. Benmoussa (ophtalmo)","Dr. Ait Said (ophtalmo)","Dr. Hamidi (opticien)"];
const LABS = ["Essilor Algérie (labo)","Novacel Labo","BBGR Labo","Atelier interne"];
const phone = () => { const p = pick(["5","6","7"]); let r = ""; for (let i=0;i<8;i++) r += randInt(0,9); return `+213 0${p}${r.slice(0,1)} ${r.slice(1,3)} ${r.slice(3,5)} ${r.slice(5,7)}`; };
const nin = () => { let s = ""; for (let i=0;i<18;i++) s += randInt(0,9); return s; };
const policyNo = (pre) => `${pre}-${randInt(100000,999999)}`;

function ean13(seed) {
  const base = "20" + String(Math.abs(seed) % 1e10).padStart(10, "0");
  let sum = 0;
  for (let i = 0; i < 12; i++) { const n = base.charCodeAt(i) - 48; sum += i % 2 === 0 ? n : n * 3; }
  return base + String((10 - (sum % 10)) % 10);
}
function diopter(min, max) { const steps = Math.round((max - min) / 0.25); return Math.round((min + randInt(0, steps) * 0.25) * 100) / 100; }

// ── open DB ─────────────────────────────────────────────────────────────────
const db = new DatabaseSync(DB_FILE);
db.exec("PRAGMA busy_timeout = 8000");
db.exec("PRAGMA journal_mode = WAL");
const get1 = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);
const lastId = (sql, ...a) => Number(db.prepare(sql).run(...a).lastInsertRowid);

const SEEDED_TABLES = [
  "patient_activity","appointments","credit_note_items","credit_notes","payments","claims","jobs",
  "sale_items","sales","stock_movements","product_attribute_values","patient_attribute_values",
  "product_images","product_variants","products","prescriptions","patients",
  "supplier_ledger","suppliers","brands","categories","payers",
];

function clearSeeded() {
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  for (const t of SEEDED_TABLES) db.exec(`DELETE FROM ${t}`);
  db.exec(`DELETE FROM sqlite_sequence WHERE name IN (${SEEDED_TABLES.map((t) => `'${t}'`).join(",")})`);
  run("UPDATE settings SET value='1' WHERE key IN ('invoice_next','client_code_next')");
  db.exec("COMMIT");
  db.exec("PRAGMA foreign_keys = ON");
  console.log("• cleared seeded tables");
}

if (MODE === "clear") { clearSeeded(); db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); db.close(); console.log("✅ cleared"); process.exit(0); }

const patientCount = Number(get1("SELECT COUNT(*) AS n FROM patients").n);
if (patientCount > 0 && MODE !== "reset") {
  console.error("Database already has patients. Re-run with --reset to wipe and reseed, or --clear to wipe only.");
  process.exit(1);
}
if (MODE === "reset") clearSeeded();

console.log(`• seeding ${DB_FILE}`);
db.exec("PRAGMA foreign_keys = ON");
db.exec("BEGIN");

// ── attribute id/type map (migration-seeded definitions) ────────────────────
const attr = new Map(all("SELECT id, key, field_type FROM attribute_definitions").map((r) => [r.key, { id: Number(r.id), field_type: r.field_type }]));
function setProductAttrs(productId, dict) {
  for (const [key, value] of Object.entries(dict)) {
    const m = attr.get(key); if (!m || value == null) continue;
    let text = null, num = null, opts = null;
    if (m.field_type === "number") num = Number(value);
    else if (m.field_type === "multiselect") opts = JSON.stringify(value);
    else text = String(value);
    run("INSERT INTO product_attribute_values (product_id, attribute_id, value_text, value_num, value_options) VALUES (?,?,?,?,?)", productId, m.id, text, num, opts);
  }
}
function setPatientTags(patientId, tags) {
  const m = attr.get("client_tags"); if (!m || !tags.length) return;
  run("INSERT INTO patient_attribute_values (patient_id, attribute_id, value_text, value_num, value_options) VALUES (?,?,?,?,?)", patientId, m.id, null, null, JSON.stringify(tags));
}

// ── settings ────────────────────────────────────────────────────────────────
const upsert = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
for (const [k, v] of Object.entries({
  shop_name: "Optique El Bassar", shop_address: "12 Rue Didouche Mourad, Alger Centre, Alger", shop_phone: "+213 21 63 45 78",
  currency_symbol: "DA", invoice_footer: "Merci de votre visite — Optique El Bassar",
  invoice_prefix: "FA-2026-", invoice_padding: "5", tva_rate: "1900", timbre_rate: "100", timbre_min: "500", timbre_max: "250000",
  recall_months: "24", expiry_warn_days: "60", client_code_prefix: "P-", client_code_padding: "4",
})) upsert.run(k, v);

const setI = (key, def) => { const r = get1("SELECT value FROM settings WHERE key=?", key); const n = r ? parseInt(r.value, 10) : NaN; return Number.isFinite(n) ? n : def; };
const setS = (key, def) => { const r = get1("SELECT value FROM settings WHERE key=?", key); return r && r.value != null ? r.value : def; };
const TVA = setI("tva_rate", 1900), TIMBRE_RATE = setI("timbre_rate", 100), TIMBRE_MIN = setI("timbre_min", 0), TIMBRE_MAX = setI("timbre_max", 0);
const INV_PREFIX = setS("invoice_prefix", ""), INV_PAD = Math.max(1, setI("invoice_padding", 6));
let invoiceNext = setI("invoice_next", 1);

// ── payers ──────────────────────────────────────────────────────────────────
const mkPayer = (name, type, cov, notes) => lastId("INSERT INTO payers (name,type,default_coverage_pct,notes) VALUES (?,?,?,?)", name, type, cov, notes);
const payers = [
  { id: mkPayer("CNAS", "Sécurité sociale", 8000, "Salariés — tiers payant optique."), cov: 8000, prefix: "CNAS" },
  { id: mkPayer("CASNOS", "Sécurité sociale", 7000, "Non-salariés / indépendants."), cov: 7000, prefix: "CASNOS" },
  { id: mkPayer("Mutuelle MGPTT", "Mutuelle", 10000, "Complémentaire — couvre le reste à charge."), cov: 10000, prefix: "MGPTT" },
  { id: mkPayer("Mutuelle SAA", "Mutuelle", 5000, "Assurance complémentaire entreprise."), cov: 5000, prefix: "SAA" },
];

// ── suppliers + ledger ──────────────────────────────────────────────────────
const supplierDefs = [
  { name: "Luxottica Algérie", email: "contact@luxottica-dz.com", note: "Ray-Ban, Oakley, Persol, Vogue." },
  { name: "Safilo Distribution", email: "ventes@safilo-dz.com", note: "Carrera, Police, Tom Ford." },
  { name: "Essilor Algérie", email: "labo@essilor-dz.com", note: "Verres + laboratoire de taillage." },
  { name: "Novacel / BBGR", email: "commande@novacel-dz.com", note: "Verres progressifs et haut indice." },
  { name: "Optic Hall Import", email: "info@optichall-dz.com", note: "Montures maison, accessoires, lentilles." },
];
const supplierIds = {};
for (const s of supplierDefs) {
  const id = lastId("INSERT INTO suppliers (name,phone,email,address,notes) VALUES (?,?,?,?,?)", s.name, phone(), s.email, `${pick(STREETS)}, ${pick(CITIES)}`, s.note);
  supplierIds[s.name] = id;
  const buy1 = da(randInt(80,240)*1000), buy2 = da(randInt(40,160)*1000);
  const led = (type, amt, note, ref, when) => run("INSERT INTO supplier_ledger (supplier_id,type,amount,note,ref,created_at) VALUES (?,?,?,?,?,?)", id, type, amt, note, ref, ymdhms(when));
  led("purchase", buy1, "Commande montures/verres", `BL-${randInt(1000,9999)}`, daysAgo(randInt(120,200)));
  led("purchase", buy2, "Réassort", `BL-${randInt(1000,9999)}`, daysAgo(randInt(30,110)));
  if (chance(0.8)) led("payment", -Math.round((buy1+buy2)*(0.4+rand()*0.4)), "Versement", `VIR-${randInt(1000,9999)}`, daysAgo(randInt(10,60)));
}

// ── taxonomy ────────────────────────────────────────────────────────────────
const categoryIds = {}; for (const c of ["Optique de vue","Solaires","Verres","Lentilles de contact","Accessoires","Enfants"]) categoryIds[c] = lastId("INSERT INTO categories (name) VALUES (?)", c);
const brandIds = {}; for (const b of ["Ray-Ban","Oakley","Persol","Vogue","Carrera","Police","Tom Ford","Guess","Essilor","Zeiss","Hoya","BBGR","Transitions","Acuvue","Biofinity","Bausch+Lomb","El Bassar (maison)"]) brandIds[b] = lastId("INSERT INTO brands (name) VALUES (?)", b);

// ── catalog ─────────────────────────────────────────────────────────────────
const sellables = []; // {kind, product_id, variant_id, description, unit_price, category, avail}
let barcodeSeed = 1001;
function addProduct(a) {
  const isService = (a.item_type ?? "product") === "service";
  const hasVariants = !!(a.variants && a.variants.length);
  const productId = lastId(
    `INSERT INTO products (category,item_type,name,brand,reference,barcode,expiry_date,purchase_price,selling_price,quantity,min_stock,supplier,category_id,brand_id,supplier_id,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    a.category, a.item_type ?? "product", a.name, a.brand ?? null, a.reference ?? null,
    isService || hasVariants ? null : ean13(barcodeSeed++),
    a.expiry ? ymd(a.expiry) : null, da(a.purchase), da(a.selling),
    hasVariants ? 0 : a.quantity, hasVariants ? 0 : a.min_stock,
    a.supplier ?? null, a.categoryName ? categoryIds[a.categoryName] : null,
    a.brand ? brandIds[a.brand] : null, a.supplier ? supplierIds[a.supplier] : null,
    ymdhms(daysAgo(randInt(120, 260))), ymdhms(daysAgo(randInt(120, 260))),
  );
  if (a.attrs) setProductAttrs(productId, a.attrs);
  if (!hasVariants && !isService && a.quantity > 0)
    run("INSERT INTO stock_movements (product_id,type,quantity_change,note,created_at) VALUES (?,?,?,?,?)", productId, "delivery", a.quantity, "Initial stock", ymdhms(daysAgo(randInt(120,260))));

  if (hasVariants) {
    for (const v of a.variants) {
      const price = da(a.selling + (v.priceDelta ?? 0));
      const variantId = lastId(
        "INSERT INTO product_variants (product_id,label,color,size,sku,barcode,quantity,min_stock,selling_price,purchase_price) VALUES (?,?,?,?,?,?,?,?,?,?)",
        productId, `${v.color}${v.size ? ` / ${v.size}` : ""}`, v.color, v.size ?? null,
        `${(a.reference ?? a.name).slice(0,6).toUpperCase().replace(/\s/g,"")}-${v.color.slice(0,3).toUpperCase()}${v.size ?? ""}`,
        ean13(barcodeSeed++), v.qty, v.min ?? 1, price, da(a.purchase),
      );
      sellables.push({ kind: a.kind, product_id: productId, variant_id: variantId, description: `${a.brand ? a.brand + " " : ""}${a.name} — ${v.color}${v.size ? ` ${v.size}` : ""}`, unit_price: price, category: a.category, avail: v.qty });
    }
  } else if (!isService) {
    sellables.push({ kind: a.kind, product_id: productId, variant_id: null, description: `${a.brand ? a.brand + " " : ""}${a.name}`, unit_price: da(a.selling), category: a.category, avail: a.quantity });
  } else {
    sellables.push({ kind: "service", product_id: productId, variant_id: null, description: a.name, unit_price: da(a.selling), category: a.category, avail: Infinity });
  }
  return productId;
}

// frames (optical)
addProduct({ kind:"frame_optical", category:"frame", categoryName:"Optique de vue", name:"Wayfarer RB5154 Clubmaster", brand:"Ray-Ban", reference:"RB5154", supplier:"Luxottica Algérie", purchase:6500, selling:16500, min_stock:2, attrs:{frame_material:"acetate",frame_shape:"browline",frame_rim:"semi-rimless",eye_size:51,bridge:21,temple:145,gender:"unisex",suitable_for:["distance","reading"]}, variants:[{color:"Noir",size:"51",qty:4},{color:"Havane",size:"51",qty:3},{color:"Écaille",size:"49",qty:2}] });
addProduct({ kind:"frame_optical", category:"frame", categoryName:"Optique de vue", name:"Vogue VO5234", brand:"Vogue", reference:"VO5234", supplier:"Luxottica Algérie", purchase:3800, selling:9900, min_stock:2, attrs:{frame_material:"metal",frame_shape:"round",frame_rim:"full-rim",eye_size:50,bridge:20,temple:140,gender:"women",suitable_for:["distance"]}, variants:[{color:"Doré",qty:5},{color:"Rose",qty:2}] });
addProduct({ kind:"frame_optical", category:"frame", categoryName:"Optique de vue", name:"Carrera 8821", brand:"Carrera", reference:"CA8821", supplier:"Safilo Distribution", purchase:5200, selling:13900, quantity:6, min_stock:2, attrs:{frame_material:"TR90",frame_shape:"rectangle",frame_rim:"full-rim",frame_color:"Noir mat",eye_size:54,bridge:17,temple:145,gender:"men",suitable_for:["distance","computer"]} });
addProduct({ kind:"frame_optical", category:"frame", categoryName:"Optique de vue", name:"Police VPLB12", brand:"Police", reference:"VPLB12", supplier:"Safilo Distribution", purchase:4600, selling:12500, quantity:5, min_stock:2, attrs:{frame_material:"metal",frame_shape:"square",frame_rim:"full-rim",frame_color:"Gunmetal",eye_size:53,bridge:18,temple:145,gender:"men",suitable_for:["distance"]} });
addProduct({ kind:"frame_optical", category:"frame", categoryName:"Optique de vue", name:"Guess GU2745", brand:"Guess", reference:"GU2745", supplier:"Optic Hall Import", purchase:3200, selling:8500, quantity:7, min_stock:2, attrs:{frame_material:"acetate",frame_shape:"cat-eye",frame_rim:"full-rim",frame_color:"Bordeaux",eye_size:52,bridge:16,temple:140,gender:"women",suitable_for:["distance"]} });
addProduct({ kind:"frame_optical", category:"frame", categoryName:"Enfants", name:"Monture Enfant Flex", brand:"El Bassar (maison)", reference:"KID-FLEX", supplier:"Optic Hall Import", purchase:1200, selling:4500, quantity:10, min_stock:4, attrs:{frame_material:"TR90",frame_shape:"oval",frame_rim:"full-rim",frame_color:"Bleu",eye_size:44,bridge:15,temple:125,gender:"kids",suitable_for:["distance"]} });
addProduct({ kind:"frame_optical", category:"frame", categoryName:"Optique de vue", name:"Titane Léger T-200", brand:"El Bassar (maison)", reference:"T200", supplier:"Optic Hall Import", purchase:2800, selling:7900, quantity:8, min_stock:3, attrs:{frame_material:"titanium",frame_shape:"rectangle",frame_rim:"rimless",frame_color:"Argent",eye_size:53,bridge:18,temple:140,gender:"unisex",suitable_for:["distance","computer"]} });
addProduct({ kind:"frame_optical", category:"frame", categoryName:"Optique de vue", name:"Tom Ford FT5634", brand:"Tom Ford", reference:"FT5634", supplier:"Safilo Distribution", purchase:11000, selling:28000, quantity:3, min_stock:1, attrs:{frame_material:"acetate",frame_shape:"square",frame_rim:"full-rim",frame_color:"Noir brillant",eye_size:55,bridge:18,temple:145,gender:"men",suitable_for:["distance"]} });
// sunglasses
addProduct({ kind:"frame_sun", category:"frame", categoryName:"Solaires", name:"Aviator RB3025", brand:"Ray-Ban", reference:"RB3025", supplier:"Luxottica Algérie", purchase:7200, selling:18500, min_stock:2, attrs:{frame_material:"metal",frame_shape:"aviator",frame_rim:"full-rim",eye_size:58,bridge:14,temple:135,gender:"unisex",suitable_for:["sun","driving"]}, variants:[{color:"Or / Vert G15",qty:4},{color:"Argent / Miroir",qty:3,priceDelta:1500}] });
addProduct({ kind:"frame_sun", category:"frame", categoryName:"Solaires", name:"Wayfarer RB2140", brand:"Ray-Ban", reference:"RB2140", supplier:"Luxottica Algérie", purchase:6800, selling:17500, quantity:6, min_stock:2, attrs:{frame_material:"acetate",frame_shape:"square",frame_rim:"full-rim",frame_color:"Noir",eye_size:50,bridge:22,temple:150,gender:"unisex",suitable_for:["sun","driving"]} });
addProduct({ kind:"frame_sun", category:"frame", categoryName:"Solaires", name:"Oakley Holbrook OO9102", brand:"Oakley", reference:"OO9102", supplier:"Luxottica Algérie", purchase:8200, selling:21000, quantity:4, min_stock:1, attrs:{frame_material:"TR90",frame_shape:"square",frame_rim:"full-rim",frame_color:"Noir mat",eye_size:55,bridge:18,temple:137,gender:"men",suitable_for:["sun","sport","driving"]} });
addProduct({ kind:"frame_sun", category:"frame", categoryName:"Solaires", name:"Persol PO3007", brand:"Persol", reference:"PO3007", supplier:"Luxottica Algérie", purchase:9000, selling:23500, quantity:3, min_stock:1, attrs:{frame_material:"acetate",frame_shape:"round",frame_rim:"full-rim",frame_color:"Havane",eye_size:53,bridge:21,temple:145,gender:"men",suitable_for:["sun"]} });
// lenses (trigger lab jobs)
addProduct({ kind:"lens", category:"lens", categoryName:"Verres", name:"Verres unifocaux 1.5 AR (la paire)", brand:"Essilor", reference:"UNI-15-AR", supplier:"Essilor Algérie", purchase:1800, selling:5500, quantity:40, min_stock:8, attrs:{lens_material:"CR-39",lens_index:1.5,coatings:["AR","UV","scratch-resistant"],suitable_for:["distance"]} });
addProduct({ kind:"lens", category:"lens", categoryName:"Verres", name:"Verres unifocaux 1.6 AR + anti-lumière bleue", brand:"Essilor", reference:"EYEZEN-16", supplier:"Essilor Algérie", purchase:3200, selling:9800, quantity:30, min_stock:6, attrs:{lens_material:"high-index 1.67",lens_index:1.6,coatings:["AR","blue-light","UV"],suitable_for:["computer","distance"]} });
addProduct({ kind:"lens", category:"lens", categoryName:"Verres", name:"Verres progressifs Varilux Comfort 1.5", brand:"Essilor", reference:"VARILUX-C15", supplier:"Essilor Algérie", purchase:9500, selling:28000, quantity:20, min_stock:4, attrs:{lens_material:"CR-39",lens_index:1.5,coatings:["AR","UV","scratch-resistant"],suitable_for:["reading","distance"]} });
addProduct({ kind:"lens", category:"lens", categoryName:"Verres", name:"Verres progressifs Zeiss SmartLife 1.6", brand:"Zeiss", reference:"ZEISS-SL16", supplier:"Novacel / BBGR", purchase:14000, selling:39000, quantity:12, min_stock:3, attrs:{lens_material:"high-index 1.67",lens_index:1.6,coatings:["AR","blue-light","UV"],suitable_for:["reading","distance","computer"]} });
addProduct({ kind:"lens", category:"lens", categoryName:"Verres", name:"Verres photochromiques Transitions 1.5", brand:"Transitions", reference:"TRANS-15", supplier:"Novacel / BBGR", purchase:5200, selling:15500, quantity:18, min_stock:4, attrs:{lens_material:"CR-39",lens_index:1.5,coatings:["AR","photochromic","UV"],suitable_for:["distance","sun"]} });
addProduct({ kind:"lens", category:"lens", categoryName:"Verres", name:"Verres haut indice 1.67 AR", brand:"BBGR", reference:"HI-167", supplier:"Novacel / BBGR", purchase:4800, selling:14000, quantity:22, min_stock:5, attrs:{lens_material:"high-index 1.67",lens_index:1.67,coatings:["AR","UV"],suitable_for:["distance"]} });
addProduct({ kind:"lens", category:"lens", categoryName:"Verres", name:"Verres polycarbonate enfant 1.59", brand:"Hoya", reference:"PC-159", supplier:"Novacel / BBGR", purchase:2600, selling:7500, quantity:16, min_stock:4, attrs:{lens_material:"polycarbonate",lens_index:1.59,coatings:["AR","UV","scratch-resistant"],suitable_for:["distance","sport"]} });
// accessories + contacts (low stock + expiry edge cases)
addProduct({ kind:"accessory", category:"accessory", categoryName:"Accessoires", name:"Étui rigide", brand:"El Bassar (maison)", supplier:"Optic Hall Import", purchase:200, selling:700, quantity:60, min_stock:10 });
addProduct({ kind:"accessory", category:"accessory", categoryName:"Accessoires", name:"Chiffon microfibre", brand:"El Bassar (maison)", supplier:"Optic Hall Import", purchase:60, selling:300, quantity:4, min_stock:15 });
addProduct({ kind:"accessory", category:"accessory", categoryName:"Accessoires", name:"Cordon à lunettes", brand:"El Bassar (maison)", supplier:"Optic Hall Import", purchase:150, selling:600, quantity:25, min_stock:8 });
addProduct({ kind:"accessory", category:"accessory", categoryName:"Accessoires", name:"Spray nettoyant 30ml", brand:"El Bassar (maison)", supplier:"Optic Hall Import", purchase:280, selling:900, quantity:18, min_stock:6, expiry:daysAhead(45) });
addProduct({ kind:"accessory", category:"accessory", categoryName:"Accessoires", name:"Kit réparation lunettes", brand:"El Bassar (maison)", supplier:"Optic Hall Import", purchase:180, selling:750, quantity:12, min_stock:5 });
addProduct({ kind:"contact", category:"accessory", categoryName:"Lentilles de contact", name:"Lentilles Acuvue Oasys (boîte 6)", brand:"Acuvue", reference:"OASYS-6", supplier:"Optic Hall Import", purchase:1900, selling:3500, quantity:14, min_stock:6, expiry:daysAhead(380) });
addProduct({ kind:"contact", category:"accessory", categoryName:"Lentilles de contact", name:"Lentilles Biofinity (boîte 3)", brand:"Biofinity", reference:"BIO-3", supplier:"Optic Hall Import", purchase:1600, selling:3000, quantity:3, min_stock:5, expiry:daysAhead(30) });
addProduct({ kind:"contact", category:"accessory", categoryName:"Lentilles de contact", name:"Solution Renu 360ml", brand:"Bausch+Lomb", reference:"RENU-360", supplier:"Optic Hall Import", purchase:700, selling:1400, quantity:22, min_stock:8, expiry:daysAhead(120) });
addProduct({ kind:"contact", category:"accessory", categoryName:"Lentilles de contact", name:"Gouttes hydratantes 10ml", brand:"Bausch+Lomb", reference:"DROPS-10", supplier:"Optic Hall Import", purchase:320, selling:850, quantity:16, min_stock:6, expiry:daysAhead(-10) });
// services
addProduct({ kind:"service", category:"accessory", item_type:"service", name:"Examen de vue", selling:1500, purchase:0, quantity:0, min_stock:0 });
addProduct({ kind:"service", category:"accessory", item_type:"service", name:"Montage de verres", selling:800, purchase:0, quantity:0, min_stock:0 });
addProduct({ kind:"service", category:"accessory", item_type:"service", name:"Réparation monture", selling:1200, purchase:0, quantity:0, min_stock:0 });
addProduct({ kind:"service", category:"accessory", item_type:"service", name:"Ajustement / réglage", selling:400, purchase:0, quantity:0, min_stock:0 });
addProduct({ kind:"service", category:"accessory", item_type:"service", name:"Adaptation lentilles", selling:1800, purchase:0, quantity:0, min_stock:0 });

const framesOptical = sellables.filter((s) => s.kind === "frame_optical");
const framesSun = sellables.filter((s) => s.kind === "frame_sun");
const lenses = sellables.filter((s) => s.kind === "lens");
const lensIds = new Set(lenses.map((l) => l.product_id));
const accessories = sellables.filter((s) => s.kind === "accessory" || s.kind === "contact");
const svcExam = sellables.find((s) => s.kind === "service" && s.description === "Examen de vue");
const svcMontage = sellables.find((s) => s.kind === "service" && s.description === "Montage de verres");
console.log(`• catalog: ${sellables.length} sellable lines`);

// ── patients (+ prescriptions, tags, activity) ──────────────────────────────
const logAct = (pid, type, desc, refId, when) => run("INSERT INTO patient_activity (patient_id,type,description,ref_id,created_at) VALUES (?,?,?,?,?)", pid, type, desc, refId ?? null, ymdhms(when));
const patients = [];
let codeNext = 1;
for (let i = 0; i < 30; i++) {
  const isF = chance(0.5);
  const fname = isF ? pick(FEMALE) : pick(MALE);
  const name = `${fname} ${pick(LAST)}`;
  const birthYear = randInt(1955, 2017);
  const dob = `${birthYear}-${p2(randInt(1,12))}-${p2(randInt(1,28))}`;
  const insured = chance(0.5);
  const payer = insured ? pick(payers) : null;
  const createdAt = daysAgo(randInt(20, 400));
  const code = `P-${String(codeNext++).padStart(4, "0")}`;
  const id = lastId(
    `INSERT INTO patients (code,full_name,phone,phone2,email,address,date_of_birth,national_id,default_payer_id,default_coverage_pct,insurance_policy_no,notes,store_credit,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    code, name, phone(), chance(0.2) ? phone() : null, chance(0.4) ? `${fname.toLowerCase()}.${randInt(1,999)}@gmail.com` : null,
    `${randInt(1,80)} ${pick(STREETS)}, ${pick(CITIES)}`, dob, chance(0.7) ? nin() : null,
    payer ? payer.id : null, payer ? payer.cov : 0, payer ? policyNo(payer.prefix) : null,
    chance(0.25) ? pick(["Client fidèle.","Préfère être appelé l'après-midi.","Sensible à la lumière.","Porteur de lentilles depuis 2 ans."]) : null,
    0, ymdhms(createdAt), ymdhms(createdAt),
  );
  logAct(id, "created", "Fiche client créée", id, createdAt);
  const tags = [];
  if (insured) tags.push("Assuré");
  if (chance(0.25)) tags.push("VIP");
  if (chance(0.25)) tags.push("Lentilles");
  if (chance(0.2)) tags.push("À rappeler");
  if (tags.length) setPatientTags(id, tags);

  const rxIds = [];
  const age = NOW.getFullYear() - birthYear;
  if (chance(0.75)) {
    const nRx = chance(0.3) ? 2 : 1;
    for (let r = 0; r < nRx; r++) {
      let exam = daysAgo(randInt(10, 700) - r * 200);
      if (exam < createdAt) exam = createdAt;
      const presbyope = age >= 45;
      const lensType = presbyope ? pick(["progressive","progressive","bifocal"]) : pick(["single-vision","single-vision","progressive"]);
      const add = presbyope || lensType !== "single-vision" ? diopter(0.75, 2.5) : null;
      const hasCyl = chance(0.6);
      const expiry = new Date(exam.getFullYear() + 2, exam.getMonth(), exam.getDate());
      const rxId = lastId(
        `INSERT INTO prescriptions (patient_id,exam_date,r_sphere,r_cylinder,r_axis,r_add,r_pd,l_sphere,l_cylinder,l_axis,l_add,l_pd,lens_type,r_seg_height,l_seg_height,prescriber,expiry_date,notes,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id, ymd(exam), diopter(-6,3), hasCyl ? diopter(-2.5,-0.25) : null, hasCyl ? randInt(0,180) : null, add, randInt(29,34),
        diopter(-6,3), hasCyl ? diopter(-2.5,-0.25) : null, hasCyl ? randInt(0,180) : null, add, randInt(29,34),
        lensType, lensType === "progressive" ? randInt(14,20) : null, lensType === "progressive" ? randInt(14,20) : null,
        pick(PRESCRIBERS), ymd(expiry), chance(0.2) ? "Renouvellement, pas de changement majeur." : null, ymdhms(exam),
      );
      rxIds.push(rxId);
      logAct(id, "prescription", "Ordonnance enregistrée", rxId, exam);
    }
  }
  patients.push({ id, name, payerId: payer ? payer.id : null, coverage: payer ? payer.cov : 0, rxIds });
}
console.log(`• ${patients.length} patients`);

// ── appointments ────────────────────────────────────────────────────────────
for (const pt of sample(patients, 22)) {
  if (chance(0.7)) {
    const d = daysAgo(randInt(5, 160));
    let status = "done", rxLink = null;
    if (pt.rxIds.length && chance(0.6)) { rxLink = pt.rxIds[0]; status = "done"; }
    else status = pick(["done","done","no_show","cancelled"]);
    const apptId = lastId("INSERT INTO appointments (patient_id,starts_at,duration_min,optometrist,reason,status,prescription_id,created_at) VALUES (?,?,?,?,?,?,?,?)",
      pt.id, at(d, randInt(9,16), pick([0,30])), 30, pick(OPTOMETRISTS), "Examen de vue", status, rxLink, ymdhms(d));
    logAct(pt.id, "appointment", "Rendez-vous", apptId, d);
  }
  if (chance(0.4)) {
    const d = daysAhead(randInt(1, 25));
    run("INSERT INTO appointments (patient_id,starts_at,duration_min,optometrist,reason,status) VALUES (?,?,?,?,?, 'booked')",
      pt.id, at(d, randInt(9,16), pick([0,30])), 30, pick(OPTOMETRISTS), pick(["Contrôle annuel","Adaptation lentilles","Renouvellement","Examen de vue"]));
  }
}

// ── sales engine (ports create_sale from lib.rs) ────────────────────────────
const PAY_METHODS = ["cash","cash","cash","card","cheque","transfer"];
const reserve = (s, qty) => { if (s.avail < qty) return false; s.avail -= qty; return true; };
const createdSales = []; // {saleId, patientId, date, hasLens, payerId, covered, claimId, jobId}

function createSale(o) {
  const items = o.items;
  const subtotal = items.reduce((s, it) => s + Math.max(0, it.unit_price * it.quantity - it.item_discount), 0);
  const discount = o.discountType === "percent" ? Math.floor((subtotal * o.discountValue) / 10000) : (o.discountValue || 0);
  const total = Math.max(subtotal - discount, 0);
  const tax_amount = TVA > 0 && total > 0 ? total - Math.floor((total * 10000) / (10000 + TVA)) : 0;
  let timbre = 0;
  if (o.method === "cash" && TIMBRE_RATE > 0 && total > 0) {
    timbre = Math.floor((total * TIMBRE_RATE) / 10000);
    if (timbre < TIMBRE_MIN) timbre = TIMBRE_MIN;
    if (TIMBRE_MAX > 0 && timbre > TIMBRE_MAX) timbre = TIMBRE_MAX;
  }
  const covered = o.payerId ? Math.min(Math.max(Math.floor((total * o.coverage) / 10000), 0), total) : 0;
  const patientDue = total - covered + timbre;
  const cashPaid = Math.min(Math.max(o.initialPayment || 0, 0), patientDue);
  let creditUsed = 0;
  if (o.storeCreditUsed > 0) {
    const avail = Number(get1("SELECT store_credit FROM patients WHERE id=?", o.patientId)?.store_credit ?? 0);
    creditUsed = Math.min(Math.max(o.storeCreditUsed, 0), Math.min(avail, patientDue - cashPaid));
  }
  const paid = cashPaid + creditUsed;
  const balance = Math.max(patientDue - paid, 0);
  const status = paid <= 0 ? "unpaid" : paid >= patientDue ? "paid" : "partial";
  const invoiceNumber = `${INV_PREFIX}${String(invoiceNext).padStart(INV_PAD, "0")}`;
  invoiceNext += 1;
  const when = ymdhms(o.date);

  const saleId = lastId(
    `INSERT INTO sales (patient_id,prescription_id,sale_date,subtotal,discount_type,discount_value,total,tax_rate,tax_amount,timbre_amount,invoice_number,amount_paid,balance,status,notes,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    o.patientId, o.prescriptionId ?? null, when, subtotal, o.discountType ?? "amount", o.discountValue ?? 0,
    total, TVA, tax_amount, timbre, invoiceNumber, paid, balance, status, o.note ?? null, when);

  let claimId = null;
  if (o.payerId) claimId = lastId("INSERT INTO claims (sale_id,payer_id,covered_amount,status,created_at) VALUES (?,?,?, 'pending', ?)", saleId, o.payerId, covered, when);

  const hasLens = items.some((it) => lensIds.has(it.product_id));
  let jobId = null;
  if (hasLens) jobId = lastId("INSERT INTO jobs (sale_id,patient_id,prescription_id,status,created_at,updated_at) VALUES (?,?,?, 'ordered', ?, ?)", saleId, o.patientId, o.prescriptionId ?? null, when, when);

  for (const it of items) {
    const lineTotal = Math.max(it.unit_price * it.quantity - it.item_discount, 0);
    run("INSERT INTO sale_items (sale_id,product_id,variant_id,description,unit_price,quantity,item_discount,line_total) VALUES (?,?,?,?,?,?,?,?)",
      saleId, it.product_id ?? null, it.variant_id ?? null, it.description, it.unit_price, it.quantity, it.item_discount, lineTotal);
    if (it.variant_id) {
      run("UPDATE product_variants SET quantity = quantity - ?, updated_at = ? WHERE id = ?", it.quantity, when, it.variant_id);
      run("INSERT INTO stock_movements (product_id,variant_id,type,quantity_change,note,created_at) VALUES (?,?, 'sale', ?, ?, ?)", it.product_id ?? null, it.variant_id, -it.quantity, `Sale #${saleId}`, when);
    } else if (it.product_id && !it.isService) {
      run("UPDATE products SET quantity = quantity - ?, updated_at = ? WHERE id = ?", it.quantity, when, it.product_id);
      run("INSERT INTO stock_movements (product_id,type,quantity_change,note,created_at) VALUES (?, 'sale', ?, ?, ?)", it.product_id, -it.quantity, `Sale #${saleId}`, when);
    }
  }

  if (cashPaid > 0) run("INSERT INTO payments (sale_id,amount,method,note,paid_at) VALUES (?,?,?, 'Initial payment', ?)", saleId, cashPaid, o.method, when);
  if (creditUsed > 0) {
    run("INSERT INTO payments (sale_id,amount,method,note,paid_at) VALUES (?,?, 'store_credit', 'Store credit redeemed', ?)", saleId, creditUsed, when);
    run("UPDATE patients SET store_credit = store_credit - ? WHERE id = ?", creditUsed, o.patientId);
  }
  logAct(o.patientId, "sale", "Vente enregistrée", saleId, o.date);
  createdSales.push({ saleId, patientId: o.patientId, date: o.date, hasLens, payerId: o.payerId, covered, claimId, jobId });
  return saleId;
}

function buildGlasses(sun) {
  const frame = pick(sun ? framesSun : framesOptical);
  if (!reserve(frame, 1)) return null;
  const items = [{ product_id: frame.product_id, variant_id: frame.variant_id, description: frame.description, unit_price: frame.unit_price, quantity: 1, item_discount: chance(0.15) ? da(randInt(3,10)*100) : 0 }];
  if (!sun || chance(0.3)) {
    const lens = pick(lenses);
    if (reserve(lens, 1)) {
      items.push({ product_id: lens.product_id, variant_id: null, description: lens.description, unit_price: lens.unit_price, quantity: 1, item_discount: 0 });
      if (chance(0.6)) items.push({ product_id: svcMontage.product_id, variant_id: null, description: svcMontage.description, unit_price: svcMontage.unit_price, quantity: 1, item_discount: 0, isService: true });
    }
  }
  if (chance(0.3)) items.push({ product_id: svcExam.product_id, variant_id: null, description: svcExam.description, unit_price: svcExam.unit_price, quantity: 1, item_discount: 0, isService: true });
  return items;
}
function buildAccessory() {
  const items = [];
  for (const a of sample(accessories, randInt(1, 2))) {
    const qty = a.kind === "contact" ? randInt(1, 2) : 1;
    if (reserve(a, qty)) items.push({ product_id: a.product_id, variant_id: a.variant_id, description: a.description, unit_price: a.unit_price, quantity: qty, item_discount: 0 });
  }
  return items.length ? items : null;
}

let salesMade = 0, attempts = 0;
while (salesMade < 46 && attempts < 200) {
  attempts++;
  const pt = pick(patients);
  const roll = rand();
  let items, prescriptionId = null;
  if (roll < 0.55) { items = buildGlasses(false); prescriptionId = pt.rxIds[0] ?? null; }
  else if (roll < 0.75) items = buildGlasses(true);
  else items = buildAccessory();
  if (!items) continue;

  const date = daysAgo(randInt(2, 178));
  const method = pick(PAY_METHODS);
  const isGlasses = roll < 0.75;
  const useInsurer = isGlasses && pt.payerId != null && chance(0.6);

  const goods = items.reduce((s, it) => s + Math.max(0, it.unit_price * it.quantity - it.item_discount), 0);
  let discountType, discountValue = 0;
  const dRoll = rand();
  if (dRoll < 0.18) { discountType = "percent"; discountValue = pick([500,1000,1500]); }
  else if (dRoll < 0.28) { discountType = "amount"; discountValue = da(randInt(5,20)*100); }

  const stateRoll = rand();
  let initialPayment;
  if (stateRoll < 0.55) initialPayment = 1e12;            // paid in full
  else if (stateRoll < 0.85) initialPayment = Math.round(goods * (0.3 + rand()*0.4)); // partial
  else initialPayment = 0;                                 // unpaid

  const saleId = createSale({ patientId: pt.id, prescriptionId, items, date, method, discountType, discountValue,
    initialPayment, payerId: useInsurer ? pt.payerId : null, coverage: useInsurer ? pt.coverage : 0,
    note: chance(0.15) ? pick(["Livraison sous 7 jours.","Client pressé.","Renouvellement monture."]) : null });
  salesMade++;

  // follow-up installment on some partials (properly dated after the sale)
  if (stateRoll >= 0.55 && stateRoll < 0.85 && chance(0.5)) {
    const s = get1("SELECT balance FROM sales WHERE id=?", saleId);
    const bal = Number(s.balance);
    if (bal > 0) {
      const pay = Math.min(bal, da(randInt(10,40)*100));
      const payDate = new Date(date.getTime() + randInt(5, 40) * DAY);
      run("INSERT INTO payments (sale_id,amount,method,note,paid_at) VALUES (?,?,?, 'Acompte', ?)", saleId, pay, pick(PAY_METHODS), ymdhms(payDate < NOW ? payDate : NOW));
      run("UPDATE sales SET amount_paid = amount_paid + ?, balance = balance - ?, status = CASE WHEN balance - ? <= 0 THEN 'paid' ELSE 'partial' END WHERE id = ?", pay, pay, pay, saleId);
      logAct(pt.id, "payment", "Acompte reçu", saleId, payDate < NOW ? payDate : NOW);
    }
  }
}
console.log(`• ${salesMade} sales created`);

// ── progress lab jobs (backdated) ───────────────────────────────────────────
let jobsN = 0;
for (const c of createdSales) {
  if (!c.jobId) continue;
  jobsN++;
  const ageDays = Math.round((NOW.getTime() - c.date.getTime()) / DAY);
  let status;
  if (ageDays > 25) status = pick(["collected","collected","ready"]);
  else if (ageDays > 12) status = pick(["ready","edging","collected"]);
  else if (ageDays > 5) status = pick(["edging","at_lab"]);
  else status = pick(["ordered","at_lab"]);
  const expected = new Date(c.date.getTime() + randInt(5, 12) * DAY);
  const updatedAt = new Date(Math.min(NOW.getTime(), c.date.getTime() + randInt(2, 18) * DAY));
  const delivered = status === "collected" ? ymdhms(updatedAt) : null;
  run("UPDATE jobs SET lab=?, expected_ready=?, notes=?, status=?, delivered_at=?, updated_at=? WHERE id=?",
    pick(LABS), ymd(expected), chance(0.2) ? "Verres en rupture côté labo." : null, status, delivered, ymdhms(updatedAt), c.jobId);
}
console.log(`• ${jobsN} lab jobs progressed`);

// ── progress claims (backdated) ─────────────────────────────────────────────
let claimsN = 0;
for (const c of createdSales) {
  if (!c.claimId) continue;
  claimsN++;
  const ref = `SIN-${randInt(100000,999999)}`;
  const submittedAt = new Date(Math.min(NOW.getTime(), c.date.getTime() + randInt(2, 10) * DAY));
  const paidAt = new Date(Math.min(NOW.getTime(), submittedAt.getTime() + randInt(10, 45) * DAY));
  const roll = rand();
  if (roll < 0.2) { /* pending */ }
  else if (roll < 0.45) run("UPDATE claims SET status='submitted', claim_ref=?, submitted_at=? WHERE id=?", ref, ymdhms(submittedAt), c.claimId);
  else if (roll < 0.65) { const part = Math.round(c.covered * (0.4 + rand()*0.3)); run("UPDATE claims SET status='partial', claim_ref=?, submitted_at=?, paid_amount=? WHERE id=?", ref, ymdhms(submittedAt), part, c.claimId); }
  else if (roll < 0.9) run("UPDATE claims SET status='paid', claim_ref=?, submitted_at=?, paid_amount=?, paid_at=? WHERE id=?", ref, ymdhms(submittedAt), c.covered, ymdhms(paidAt), c.claimId);
  else run("UPDATE claims SET status='rejected', claim_ref=?, submitted_at=? WHERE id=?", ref, ymdhms(submittedAt), c.claimId);
}
console.log(`• ${claimsN} insurance claims progressed`);

// ── returns (refund + store credit) and a store-credit redemption ───────────
let refundsDone = 0, creditDone = false, creditPatientId = null;
const ordered = [...createdSales].sort((a, b) => a.date - b.date);
for (const c of ordered) {
  if (refundsDone >= 1 && creditDone) break;
  const item = get1(
    `SELECT si.id, si.product_id, si.quantity, si.line_total, p.item_type
     FROM sale_items si LEFT JOIN products p ON p.id = si.product_id
     WHERE si.sale_id = ? AND si.product_id IS NOT NULL AND p.item_type <> 'service' AND si.quantity > 0
       AND si.product_id NOT IN (${[...lensIds].join(",") || "0"}) LIMIT 1`, c.saleId);
  if (!item) continue;
  const method = refundsDone < 1 ? "refund" : "store_credit";
  if (method === "store_credit" && creditDone) continue;
  const perUnit = Math.floor(Number(item.line_total) / Number(item.quantity));
  const cnDate = new Date(Math.min(NOW.getTime(), c.date.getTime() + randInt(3, 20) * DAY));
  const cnId = lastId("INSERT INTO credit_notes (sale_id,patient_id,total,method,notes,created_at) VALUES (?,?,?,?,?,?)",
    c.saleId, c.patientId, perUnit, method, method === "refund" ? "Monture ne convenait pas — remboursement." : "Échange — avoir client.", ymdhms(cnDate));
  run("INSERT INTO credit_note_items (credit_note_id,sale_item_id,product_id,description,quantity,line_total) VALUES (?,?,?,?,?,?)",
    cnId, item.id, item.product_id, "Retour article", 1, perUnit);
  // restock
  run("UPDATE products SET quantity = quantity + 1, updated_at = ? WHERE id = ?", ymdhms(cnDate), item.product_id);
  run("INSERT INTO stock_movements (product_id,type,quantity_change,note,created_at) VALUES (?, 'adjustment', 1, ?, ?)", item.product_id, `Return — sale #${c.saleId}`, ymdhms(cnDate));
  if (method === "store_credit") { run("UPDATE patients SET store_credit = store_credit + ? WHERE id = ?", perUnit, c.patientId); creditDone = true; creditPatientId = c.patientId; }
  else refundsDone++;
}

// redeem some store credit on a later small accessory sale
if (creditPatientId != null) {
  const avail = Number(get1("SELECT store_credit FROM patients WHERE id=?", creditPatientId)?.store_credit ?? 0);
  const acc = accessories.find((a) => a.avail > 0);
  if (avail > 0 && acc && reserve(acc, 1)) {
    createSale({ patientId: creditPatientId, prescriptionId: null,
      items: [{ product_id: acc.product_id, variant_id: acc.variant_id, description: acc.description, unit_price: acc.unit_price, quantity: 1, item_discount: 0 }],
      date: daysAgo(1), method: "cash", initialPayment: 0, payerId: null, coverage: 0,
      storeCreditUsed: Math.min(avail, acc.unit_price), note: "Réglé en partie avec l'avoir client." });
  }
}
console.log(`• returns: ${refundsDone} refund(s), ${creditDone ? 1 : 0} store-credit`);

// ── finalize counters ───────────────────────────────────────────────────────
upsert.run("invoice_next", String(invoiceNext));
upsert.run("client_code_next", String(codeNext));

db.exec("COMMIT");
db.exec("PRAGMA wal_checkpoint(TRUNCATE)");

// ── verification summary ────────────────────────────────────────────────────
const c = (t) => Number(get1(`SELECT COUNT(*) AS n FROM ${t}`).n);
const sum = (sql) => Number(get1(sql)?.v ?? 0);
console.log("\n── seeded ──");
for (const t of ["patients","prescriptions","appointments","products","product_variants","sales","sale_items","payments","claims","jobs","credit_notes","stock_movements","supplier_ledger"]) console.log(`  ${t.padEnd(18)} ${c(t)}`);
console.log("── integrity checks ──");
console.log("  sales by status:", JSON.stringify(all("SELECT status, COUNT(*) AS n FROM sales GROUP BY status")));
console.log("  claims by status:", JSON.stringify(all("SELECT status, COUNT(*) AS n FROM claims GROUP BY status")));
console.log("  jobs by status:", JSON.stringify(all("SELECT status, COUNT(*) AS n FROM jobs GROUP BY status")));
console.log("  negative product stock:", sum("SELECT COUNT(*) AS v FROM products WHERE quantity < 0"));
console.log("  negative variant stock:", sum("SELECT COUNT(*) AS v FROM product_variants WHERE quantity < 0"));
console.log("  sales w/ wrong balance:", sum("SELECT COUNT(*) AS v FROM sales s WHERE s.balance <> MAX(s.total + s.timbre_amount - COALESCE((SELECT covered_amount FROM claims WHERE sale_id=s.id),0) - s.amount_paid, 0)"));
console.log("  patients w/ store credit:", sum("SELECT COUNT(*) AS v FROM patients WHERE store_credit > 0"));
console.log("  total outstanding (DA):", (sum("SELECT COALESCE(SUM(balance),0) AS v FROM sales")/100).toLocaleString());
db.close();
console.log("\n✅ done — reopen (or reload) the app to see the data.");
