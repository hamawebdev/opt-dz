import path from "node:path";
import { defineConfig } from "vitest/config";

// Standalone rather than merged with vite.config.ts: that config is an async
// factory pulling in the React and Tailwind plugins, none of which these
// node-environment tests need.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    projects: [
      {
        // Pure functions: money math, tax, date ranges, formatting.
        // No database, no Tauri, no stub.
        resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        // Report queries driven against a real SQLite database built from the
        // real migrations. `@tauri-apps/plugin-sql` is aliased to a node:sqlite
        // double so `src/db/*.ts` runs unmodified.
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "./src"),
            "@tauri-apps/plugin-sql": path.resolve(__dirname, "./tests/support/plugin-sql-stub.ts"),
          },
        },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          setupFiles: ["./tests/support/tz-guard.ts"],
          // Each file builds its own in-memory database, but the plugin-sql stub
          // holds one module-level handle, so files must not share a worker.
          fileParallelism: false,
        },
      },
    ],
  },
});
