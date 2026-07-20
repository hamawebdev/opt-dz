//! In-crate test suite.
//!
//! These live inside the crate (rather than `src-tauri/tests/`) because the
//! `*_tx` functions that hold all the money logic are private — an external
//! integration test could not reach them without widening the crate's API.

use super::*;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

pub mod support;

mod money_invariants;
mod payments;
mod sales_create;
mod stock;
mod void_and_returns;

/// A fresh, fully-migrated in-memory database.
///
/// Two non-obvious requirements, both of which fail confusingly if dropped:
///
/// * `max_connections(1)` — an in-memory SQLite database belongs to a single
///   connection. A larger pool would hand later queries a *different*, empty
///   database, and the failure looks like "my inserts vanished".
/// * `foreign_keys(true)` — `PRAGMA foreign_keys = ON` in migration v1 is
///   connection-scoped, so it does not survive into the app's pooled
///   connections. Tests deliberately run with FKs enforced; see
///   `foreign_keys_are_not_enforced_by_migration_v1` for the production gap.
pub async fn test_pool() -> SqlitePool {
    let opts = SqliteConnectOptions::new()
        .filename(":memory:")
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
        .expect("failed to open in-memory sqlite");
    apply_migrations(&pool).await;
    pool
}

/// Applies every `Up` migration, in version order, from the same `migrations()`
/// the app ships.
///
/// Uses `raw_sql` rather than splitting on `;`: migration v3 defines triggers
/// whose bodies contain `;`, and a naive splitter silently truncates them.
pub async fn apply_migrations(pool: &SqlitePool) {
    let mut ms = migrations();
    ms.sort_by_key(|m| m.version);
    for m in ms.iter().filter(|m| matches!(m.kind, MigrationKind::Up)) {
        sqlx::raw_sql(m.sql)
            .execute(pool)
            .await
            .unwrap_or_else(|e| panic!("migration v{} ({}) failed: {e}", m.version, m.description));
    }
}

/// Opens a transaction the same way every production command does.
pub async fn begin(pool: &SqlitePool) -> Transaction<'_, Sqlite> {
    pool.begin_with("BEGIN IMMEDIATE")
        .await
        .expect("failed to begin transaction")
}

/// The date-boundary tests only mean anything at UTC+1 (Algeria). If the suite
/// is run without `TZ`, SQLite's `localtime` becomes a no-op and every boundary
/// assertion silently passes for the wrong reason — so fail loudly instead.
#[tokio::test]
async fn tz_guard() {
    let pool = test_pool().await;
    let offset: f64 = sqlx::query_scalar(
        "SELECT (julianday('now','localtime') - julianday('now')) * 24.0",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(
        (offset - 1.0).abs() < 0.01,
        "expected a UTC+1 local timezone, got {offset:+.2}h. \
         Run the suite via `npm run test:rust` (which sets TZ=Africa/Algiers); \
         a UTC run turns every date-boundary test into a false green."
    );
}

/// Foreign keys really are enforced in production — but *not* for the reason
/// the schema suggests.
///
/// `PRAGMA foreign_keys = ON` in migration v1 is connection-scoped and so does
/// nothing for the app's other pooled connections. What actually enforces them
/// is sqlx, which sets the pragma on every connection it opens by default, and
/// `tauri-plugin-sql` opens its pool with `Pool::connect(url)` (i.e. defaults).
///
/// This test pins that dependency: if a future change passes explicit connect
/// options and drops the default, referential integrity would silently
/// disappear across the whole app, and this test is the tripwire.
#[tokio::test]
async fn foreign_keys_are_enforced_by_sqlx_defaults() {
    // Deliberately *not* calling `.foreign_keys(true)` — relying on the default,
    // exactly as tauri-plugin-sql's `Pool::connect(url)` does.
    let opts = SqliteConnectOptions::new().filename(":memory:");
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
        .unwrap();
    apply_migrations(&pool).await;

    let on: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(on, 1, "sqlx no longer enables foreign_keys by default");

    let orphan = sqlx::query("INSERT INTO sale_items (sale_id, description) VALUES (99999, 'x')")
        .execute(&pool)
        .await;
    assert!(orphan.is_err(), "an orphan sale_item should be rejected");
}

/// Generates `src/lib/bindings.ts`. Ignored by default because it *writes* into
/// the working tree; a test that mutates checked-in files should never run as a
/// side effect of `cargo test`. Run it via `npm run bindings`.
#[test]
#[ignore = "writes src/lib/bindings.ts; run via `npm run bindings`"]
fn export_bindings() {
    super::export_bindings(&specta_builder());
}

#[test]
fn escpos_has_init_and_cut() {
    let lines = vec![ReceiptLine {
        text: "Opt DZ".into(),
        align: "center".into(),
        bold: true,
        big: true,
    }];
    let bytes = build_escpos(&lines);
    assert_eq!(&bytes[0..2], &[0x1B, 0x40], "starts with ESC @ init");
    assert!(
        bytes.windows(2).any(|w| w == [0x1B, 0x61]),
        "contains an alignment command"
    );
    assert!(
        bytes.windows(4).any(|w| w == [0x1D, 0x56, 0x42, 0x00]),
        "ends with a partial cut"
    );
    assert!(
        bytes.windows(6).any(|w| w == "Opt DZ".as_bytes()),
        "contains the line text"
    );
}
