# Opt DZ

A desktop application for managing optical stores, built with **Tauri 2 + React 19 + TypeScript + Vite**.

## The Problem

Optical shops in Algeria struggle with fragmented tools for daily operations: tracking inventory (frames, lenses, accessories), managing patient prescriptions, handling sales with insurance claims, monitoring lab jobs, and processing appointments. Opt DZ consolidates these workflows into a single offline-first desktop app that works without internet, handles local currency formatting (DZD), and supports Arabic/French bilingual interfaces.

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

### Key Features

- **Patient Management**: Store patient records, prescriptions, and appointment history
- **Inventory**: Track frames, lenses, accessories with barcode scanning and expiry alerts
- **Sales**: Process sales, payments, and insurance claims (CNAS/CASNOS/mutuelle)
- **Lab Jobs**: Manage eyewear orders through the production workflow (ordered → ready)
- **Reports**: Revenue analytics, stock alerts, and recall notifications
- **Multilingual**: Arabic and French support with proper RTL handling

## Getting Started

```bash
npm install
npm run tauri dev
```

## License

MIT
