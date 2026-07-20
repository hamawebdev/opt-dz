/**
 * Test double for `@tauri-apps/plugin-sql`, backed by `node:sqlite`.
 *
 * `vitest.config.ts` aliases the real plugin to this module, so every
 * `src/db/*.ts` report function runs **unmodified production code** — including
 * `getDb()`'s memoization — against a real SQLite database built from the real
 * migrations. Nothing in `src/` needs a test-only seam.
 *
 * Two plugin-sql behaviours this must reproduce exactly, both verified against
 * Node 24's `node:sqlite`:
 *
 * 1. **`$n` parameters are *named*, not positional.** `node:sqlite` treats `$1`
 *    as a parameter literally named `"$1"`; passing values positionally throws
 *    "column index out of range". So bind an object, never an array. No SQL
 *    rewriting is involved.
 * 2. **Rows come back null-prototype.** Vitest's `toEqual` fails against plain
 *    object literals unless they are spread into ordinary objects.
 */
import { DatabaseSync } from "node:sqlite";

/** The database the next `Database.load()` will hand out. */
let current: DatabaseSync | null = null;

/** Point the stub at a database built by the test harness. */
export function __setTestDb(db: DatabaseSync | null): void {
  current = db;
}

/** plugin-sql's `QueryResult`. `src/db/*.ts` reads `lastInsertId` after inserts. */
export interface QueryResult {
  rowsAffected: number;
  lastInsertId: number;
}

function bind(params: unknown[] = []): Record<string, unknown> {
  return Object.fromEntries(params.map((v, i) => [`$${i + 1}`, v]));
}

export default class Database {
  constructor(readonly path: string) {}

  static async load(path: string): Promise<Database> {
    if (!current) {
      throw new Error(
        "plugin-sql stub: no test database registered. Call __setTestDb() (the " +
          "scenario helper does this for you) before exercising src/db code.",
      );
    }
    return new Database(path);
  }

  private get db(): DatabaseSync {
    if (!current) throw new Error("plugin-sql stub: test database was closed");
    return current;
  }

  async select<T>(sql: string, bindValues: unknown[] = []): Promise<T> {
    const rows = this.db.prepare(sql).all(bind(bindValues));
    // Strip the null prototype so deep-equality assertions behave.
    return rows.map((r) => ({ ...r })) as T;
  }

  async execute(sql: string, bindValues: unknown[] = []): Promise<QueryResult> {
    const r = this.db.prepare(sql).run(bind(bindValues));
    return {
      rowsAffected: Number(r.changes),
      lastInsertId: Number(r.lastInsertRowid),
    };
  }

  async close(): Promise<boolean> {
    return true;
  }
}
