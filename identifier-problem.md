Root cause
The page wasn't a frontend bug — every data query was failing against the wrong database.

Your POS app opened ~/.config/com.hamawebdev.atelier/app.db, but that file belongs to a separate "atelier" garment-manufacturing app that shares the same Tauri identifier (com.hamawebdev.atelier) and the same sqlite:app.db filename. That app had already migrated the shared file to version 6 with an incompatible schema (employees/models/bundles; settings had business_name/phone, not key/value).

tauri-plugin-sql's migrator only applies migrations newer than the DB's current version, so your POS migrations (versions 1–3) were silently skipped. The POS tables (products, categories, sizes, colors, key/value settings…) never existed, so every query rejected with no such table/column. React Query retried each failure on its default 1s → 2s → 4s backoff, keeping ProductEditPage's loading gate (inv.isLoading || settings.isLoading) permanently true → the spinner never cleared. That retry storm is exactly the repeating SELECT … FROM settings you saw in the logs.

I confirmed this by running your actual binary against a QueryCache error logger, which surfaced the real errors:


["settings"]    :: no such column: key
["categories"]  :: no such table: categories
["sizes"]       :: no such table: sizes   … etc.
The fix
Per your choice, I changed the Tauri identifier so the POS app gets its own config directory and its own database:

src-tauri/tauri.conf.json:5 — com.hamawebdev.atelier → com.hamawebdev.stockmanager
Rebuilt the Rust binary (the identifier is compiled in via generate_context!).
Verified
Launching the rebuilt app created a fresh ~/.config/com.hamawebdev.stockmanager/app.db with migrations 1–3 applied, all POS tables present, and settings(key, value). Routing straight to #/inventory/new, the create-page queries each fired once (categories/sizes/colors/suppliers = 1) with no errors and no retry loop — the form renders instead of hanging.

Notes:

Your old ~/.config/com.hamawebdev.atelier/app.db is left untouched (atelier data preserved).
The new DB starts empty — categories/sizes/colors/suppliers lists will be blank until you add them, which is expected for a fresh install.
All diagnostic instrumentation I added was reverted; the only change in your tree is the one identifier line.
