//! Prints the app's SQLite migrations as JSON on stdout, so the TypeScript test
//! harness can build a real schema from the *same* source the app runs.
//!
//! Deliberately not a checked-in `.sql` artifact: a generated file drifts the
//! moment someone adds a migration and forgets to regenerate it, and catching
//! that class of drift is the whole point of the integration suite.
//!
//! Usage: `cargo run --quiet --bin dump-migrations`

use tauri_plugin_sql::MigrationKind;

fn main() {
    let mut migrations = opt_dz_lib::migrations();
    migrations.sort_by_key(|m| m.version);

    let items: Vec<serde_json::Value> = migrations
        .iter()
        .filter(|m| matches!(m.kind, MigrationKind::Up))
        .map(|m| {
            serde_json::json!({
                "version": m.version,
                "description": m.description,
                "sql": m.sql,
            })
        })
        .collect();

    println!(
        "{}",
        serde_json::to_string(&items).expect("failed to serialise migrations")
    );
}
