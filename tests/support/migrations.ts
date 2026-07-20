/**
 * Loads the app's real migrations by shelling out to the Rust binary that owns
 * them (`cargo run --bin dump-migrations`).
 *
 * Deliberately not a checked-in `.sql` file: a generated artifact drifts the
 * moment someone adds a migration and forgets to regenerate it, and catching
 * exactly that class of drift is why this suite exists. The cost is a hard
 * dependency on the Rust toolchain — which must fail loudly rather than skip,
 * because a silently-skipped integration suite is worse than no suite.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

export interface AppMigration {
  version: number;
  description: string;
  sql: string;
}

const ROOT = path.resolve(__dirname, "../..");
const LIB_RS = path.join(ROOT, "src-tauri/src/lib.rs");
const CACHE_DIR = path.join(ROOT, "node_modules/.cache/optdz");
const CACHE = path.join(CACHE_DIR, "migrations.json");

let memo: AppMigration[] | null = null;

export function loadMigrations(): AppMigration[] {
  if (memo) return memo;

  // Cache keyed on lib.rs's mtime: migrations live inside it, so any edit
  // invalidates. The cache is under node_modules/ so it can never be committed.
  const stamp = String(statSync(LIB_RS).mtimeMs);
  try {
    const cached = JSON.parse(readFileSync(CACHE, "utf8"));
    if (cached.stamp === stamp) return (memo = cached.migrations);
  } catch {
    // no usable cache; fall through and regenerate
  }

  let out: string;
  try {
    out = execFileSync(
      "cargo",
      ["run", "--quiet", "--bin", "dump-migrations", "--manifest-path", "src-tauri/Cargo.toml"],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (e) {
    throw new Error(
      "Could not load migrations: `cargo run --bin dump-migrations` failed.\n" +
        "The integration suite builds its schema from the Rust source of truth, so it " +
        "needs a working Rust toolchain. It fails rather than skipping on purpose.",
      { cause: e },
    );
  }

  const migrations: AppMigration[] = JSON.parse(out);
  migrations.sort((a, b) => a.version - b.version);
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE, JSON.stringify({ stamp, migrations }));
  return (memo = migrations);
}

/**
 * Applies every migration in version order.
 *
 * Uses `exec()` (i.e. `sqlite3_exec`) rather than splitting on `;` — migration
 * v3 defines triggers whose bodies contain semicolons, and a naive splitter
 * truncates them into invalid SQL that fails in a completely unrelated place.
 */
export function applyMigrations(db: DatabaseSync): void {
  for (const m of loadMigrations()) {
    try {
      db.exec(m.sql);
    } catch (e) {
      throw new Error(`migration v${m.version} (${m.description}) failed`, { cause: e });
    }
  }
}
