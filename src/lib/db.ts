import Database from "@tauri-apps/plugin-sql";
import type { Result } from "@/lib/bindings";

let dbPromise: Promise<Database> | null = null;

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
 *
 * Memoizes the in-flight promise, not the resolved value: at startup dozens of
 * callers race here before the first load resolves, and each unmemoized call
 * would open another connection pool on the same file (lock contention).
 */
export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:app.db").catch((err: unknown) => {
      dbPromise = null; // a failed load must not poison every later call
      throw err;
    });
  }
  return dbPromise;
}
