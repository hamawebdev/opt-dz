import { getSettings, saveSettings } from "@/db/settings";

/**
 * Lightweight manager-PIN gate for sensitive actions (void, large discounts, settings,
 * restore). The PIN is stored as a SHA-256 hash in settings and verified in the webview
 * via Web Crypto — no extra Rust dependency. This is accountability, not hard security:
 * it discourages casual misuse on a shared single-terminal till and pairs with the
 * append-only audit log.
 */

/** Lowercase hex SHA-256 of a string. */
export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Whether a manager PIN has been configured (i.e. the gate is active). */
export async function isManagerPinSet(): Promise<boolean> {
  const s = await getSettings();
  return !!s.manager_pin_hash.trim();
}

/** Sets the manager PIN. An empty string clears the gate. */
export async function setManagerPin(pin: string): Promise<void> {
  const hash = pin.trim() === "" ? "" : await sha256(pin.trim());
  await saveSettings({ manager_pin_hash: hash });
}

/** Verifies a PIN against the stored hash. Returns true when no PIN is configured, so
 * the gate is strictly opt-in. */
export async function verifyManagerPin(pin: string): Promise<boolean> {
  const s = await getSettings();
  const stored = s.manager_pin_hash.trim();
  if (!stored) return true;
  return (await sha256(pin.trim())) === stored;
}
