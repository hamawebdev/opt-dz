// Algerian-specific field validators shared by the patient form and CSV import.

/** Mobile/landline: 0[5-7]######## (10 digits) or +213[5-7]######## . */
export const ALG_PHONE = /^(0[5-7]\d{8}|\+213[5-7]\d{8})$/;
/** Algerian national id (NIN): 18 digits. */
export const NIN_18 = /^\d{18}$/;
export const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const isPhone = (v: string) => v === "" || ALG_PHONE.test(v.trim());
export const isNin = (v: string) => v === "" || NIN_18.test(v.trim());
export const isEmail = (v: string) => v === "" || EMAIL.test(v.trim());
