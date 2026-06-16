import Database from "@tauri-apps/plugin-sql";
import type { Result } from "@/lib/bindings";

let db: Database | null = null;

/**
 * Unwraps a tauri-specta command `Result`, throwing the error string on failure so
 * callers (and React Query) can handle it like any rejected promise.
 */
export function unwrap<T>(res: Result<T, string>): T {
  if (res.status === "error") throw new Error(res.error);
  return res.data;
}

/**
 * Returns a lazily-initialized connection to the bundled SQLite database.
 * Migrations are defined in `src-tauri/src/lib.rs` and run automatically on load.
 */
export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:app.db");
  }
  return db;
}
