import "@tanstack/react-query";

// Typed `meta` for React Query. `silenceGlobal: true` on a mutation/query opts it
// out of the global error toasts in main.tsx — set it ONLY on hooks whose every
// caller already surfaces failures itself (via notifyError in a try/catch).
declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: { silenceGlobal?: boolean };
    mutationMeta: { silenceGlobal?: boolean };
  }
}
