/**
 * Fails the run loudly if the suite is not executing at Algeria's UTC+1.
 *
 * The date-boundary tests exist because `sale_date` is a *local* date while
 * `paid_at` / `created_at` are *UTC* timestamps. Under `TZ=UTC` that difference
 * collapses, SQLite's `localtime` modifier becomes a no-op, and every boundary
 * assertion passes for entirely the wrong reason. A silently-green suite that
 * has stopped testing anything is worse than a red one.
 *
 * TZ is set by the npm script (`TZ=Africa/Algiers vitest`) rather than mutated
 * here: mid-process `process.env.TZ` changes are honoured by glibc but not by
 * musl, macOS, or MSVC. On Windows use the POSIX form `TZ=DZA-1` — the MSVC
 * runtime does not understand IANA zone names.
 */
import { DatabaseSync } from "node:sqlite";

const offsetMinutes = -new Date("2026-03-10T12:00:00Z").getTimezoneOffset();
if (offsetMinutes !== 60) {
  throw new Error(
    `Expected a UTC+1 timezone (Africa/Algiers), got UTC${offsetMinutes >= 0 ? "+" : ""}${offsetMinutes / 60}.\n` +
      "Run the integration suite via `npm run test:int`, which sets TZ=Africa/Algiers.",
  );
}

// The JS timezone agreeing is not enough: SQLite resolves `localtime` through
// the C library, so verify the database engine sees the same offset.
{
  const db = new DatabaseSync(":memory:");
  const row = db
    .prepare("SELECT (julianday('now','localtime') - julianday('now')) * 24.0 AS h")
    .get() as { h: number };
  db.close();
  if (Math.abs(row.h - 1) > 0.01) {
    throw new Error(
      `SQLite resolves 'localtime' to UTC${row.h >= 0 ? "+" : ""}${row.h.toFixed(2)}h, ` +
        "but the date-boundary tests require UTC+1.",
    );
  }
}
