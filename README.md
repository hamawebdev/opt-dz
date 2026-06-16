# Opt DZ

A desktop app built with **Tauri 2 + React 19 + TypeScript + Vite**.

- **App identifier:** `com.hamawebdev.optdz` — keys the OS app-data folder
  (e.g. `~/.config/com.hamawebdev.optdz/`), so the SQLite database is isolated
  from any other Tauri app.
- **Database:** `sqlite:app.db`, stored under that identifier's data folder.

## Stack

| Area          | Choice                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------- |
| Shell         | [Tauri 2](https://tauri.app)                                                             |
| UI            | React 19, [Tailwind CSS v4](https://tailwindcss.com), [shadcn/ui](https://ui.shadcn.com) |
| Routing       | React Router (hash router)                                                               |
| State         | [Zustand](https://github.com/pmndrs/zustand) (persisted)                                 |
| Data fetching | [TanStack Query](https://tanstack.com/query)                                             |
| Database      | SQLite via `@tauri-apps/plugin-sql` (migrations in Rust)                                 |
| Rust ↔ TS     | [tauri-specta](https://github.com/specta-rs/tauri-specta) typed bindings                 |
| Tooling       | ESLint, Prettier, EditorConfig                                                           |
| CI/CD         | GitHub Actions (lint + clippy on PR, cross-platform release on tag)                      |

### Bundled Tauri plugins

`store`, `sql`, `dialog`, `fs`, `notification`, `log`, `os`, `opener`, plus
desktop-only `single-instance`, `window-state`, `updater`, and `process`.

## Getting started

```bash
npm install
npm run tauri dev
```

The first `npm run tauri dev` (or `cargo test export_bindings` in `src-tauri/`)
generates `src/lib/bindings.ts` — the typed client for your Rust commands.
It regenerates automatically on every dev build.

## Project layout

```
src/                     React frontend
  components/            layout, theme provider, ui/ (shadcn)
  pages/                 route components
  store/                 Zustand stores
  lib/                   utils, db helpers, generated bindings.ts
src-tauri/
  src/lib.rs             plugin registration, commands, SQL migrations
  capabilities/          per-window permission sets
  tauri.conf.json        app + bundle config
```

## Common scripts

| Command               | Description                     |
| --------------------- | ------------------------------- |
| `npm run tauri dev`   | Run the desktop app in dev mode |
| `npm run tauri build` | Build production installers     |
| `npm run lint`        | ESLint                          |
| `npm run format`      | Prettier (write)                |

## Adding a Rust command

1. Write the function in `src-tauri/src/lib.rs` with `#[tauri::command]` and
   `#[specta::specta]`.
2. Add it to `collect_commands![...]` in `specta_builder()`.
3. Run `npm run tauri dev` to regenerate `src/lib/bindings.ts`.
4. Call it from the frontend: `import { commands } from "@/lib/bindings"`.

## Adding a shadcn component

```bash
npx shadcn@latest add <component>
```

## Database migrations

Edit the `migrations()` vec in `src-tauri/src/lib.rs`, bumping `version` for
each new migration. They run automatically against `sqlite:app.db` on startup.

## Auto-updates

The `updater` plugin is registered but not configured. To enable releases:

1. `npm run tauri signer generate` to create signing keys.
2. Add the public key under `plugins.updater` in `tauri.conf.json` and set the
   `endpoints`.
3. Uncomment the signing-key env vars in `.github/workflows/release.yml` and add
   them as repository secrets.

## Renaming for a new project

Update: `name`/`productName`/`identifier` in `tauri.conf.json`, `name` in
`src-tauri/Cargo.toml` (and the `_lib` name), `name` in `package.json`, the
window `title`, and this README.


## Notes

To reuse as a template for a new project
Rename in tauri.conf.json (productName/identifier), Cargo.toml (name + _lib), and package.json.

For auto-updates: npm run tauri signer generate, add the pubkey/endpoints under plugins.updater, and uncomment the signing secrets in the release workflow.
