// Field validators shared by the patient/prescription forms and CSV import.

/** Algerian mobile/landline: 0[5-7]######## (10 digits) or +213[5-7]######## . */
export const ALG_PHONE = /^(0[5-7]\d{8}|\+213[5-7]\d{8})$/;
/** A permissive international phone: optional +, 6–15 digits, spaces/dashes allowed. */
export const INTL_PHONE = /^\+?[\d\s-]{6,18}$/;
/** Algerian national id (NIN): 18 digits. */
export const NIN_18 = /^\d{18}$/;
export const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Accepts a local Algerian number OR any plausible international number (tourists,
 * foreign patients) — the strict Algerian form is offered as a soft hint, not a hard
 * gate (audit finding F5). */
export const isPhone = (v: string) =>
  v === "" || ALG_PHONE.test(v.trim()) || INTL_PHONE.test(v.trim());
export const isAlgPhone = (v: string) => v === "" || ALG_PHONE.test(v.trim());
export const isNin = (v: string) => v === "" || NIN_18.test(v.trim());
export const isEmail = (v: string) => v === "" || EMAIL.test(v.trim());

/** Date of birth must be a valid date, not in the future, and within ~120 years. */
export const isPastDate = (v: string) => {
  if (v === "") return true;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const earliest = new Date(now.getFullYear() - 120, 0, 1);
  return d <= now && d >= earliest;
};

// ---- Optical prescription validators (audit finding G1) ----
// All accept empty (fields are optional). Numbers come from form inputs as strings.

const num = (v: string | number | null | undefined) =>
  v === "" || v == null ? null : Number(v);

/** Sphere/cylinder/add: a dioptric power in a sane range and a 0.25 D step. */
export function isDiopterInRange(
  v: string | number | null | undefined,
  min: number,
  max: number,
): boolean {
  const n = num(v);
  if (n == null) return true;
  if (Number.isNaN(n) || n < min || n > max) return false;
  // 0.25 D steps (tolerant of float error).
  return Math.abs(n * 4 - Math.round(n * 4)) < 1e-6;
}

export const isSphere = (v: string | number | null | undefined) =>
  isDiopterInRange(v, -30, 30);
export const isCylinder = (v: string | number | null | undefined) =>
  isDiopterInRange(v, -12, 12);
/** Reading addition is conventionally positive. */
export const isAddition = (v: string | number | null | undefined) =>
  isDiopterInRange(v, 0, 6);

/** Axis: an integer in [0, 180]. */
export const isAxis = (v: string | number | null | undefined) => {
  const n = num(v);
  if (n == null) return true;
  return Number.isInteger(n) && n >= 0 && n <= 180;
};

/** Pupillary distance (mm), single eye or binocular, in a plausible range. */
export const isPd = (v: string | number | null | undefined) => {
  const n = num(v);
  if (n == null) return true;
  return n >= 15 && n <= 80;
};

/** Prism base direction. */
export const PRISM_BASES = ["BU", "BD", "BI", "BO"] as const;
export const isBaseDir = (v: string) =>
  v === "" || PRISM_BASES.includes(v.trim().toUpperCase() as never);
