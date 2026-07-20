import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, redirect, RouterProvider } from "react-router-dom";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { error as logError } from "@tauri-apps/plugin-log";
import i18n from "@/lib/i18n";
import { describeError, isDatabaseBusy, notifyError } from "@/lib/errors";
import { ThemeProvider } from "@/components/theme-provider";
import { LocaleProvider } from "@/components/locale-provider";
import { Onboarding } from "@/components/onboarding";
import { RequireUnlock } from "@/components/require-unlock";
import Layout from "@/components/layout";
import "@/lib/i18n";
import HomePage from "@/pages/home";
import PatientsListPage from "@/pages/patients-list";
import PatientFormPage from "@/pages/patient-form";
import PatientDetailPage from "@/pages/patient-detail";
import PatientsImportPage from "@/pages/patients-import";
import PatientStatementPrintPage from "@/pages/patient-statement-print";
import InventoryListPage from "@/pages/inventory-list";
import ProductFormPage from "@/pages/product-form";
import TrackingProductsPage from "@/pages/tracking-products";
import NotificationsPage from "@/pages/notifications";
import SalesListPage from "@/pages/sales-list";
import PosPage from "@/pages/pos";
import SaleDetailPage from "@/pages/sale-detail";
import SalePrintPage from "@/pages/sale-print";
import JobsPage from "@/pages/jobs";
import JobDetailPage from "@/pages/job-detail";
import AppointmentsPage from "@/pages/appointments";
import InsurancePage from "@/pages/insurance";
import SuppliersPage from "@/pages/suppliers";
import ReportsPage from "@/pages/reports";
import ExpensesPage from "@/pages/expenses";
import SettingsPage from "@/pages/settings";
import AttributeTemplatesPage from "@/pages/attribute-templates";
import ColorsManagerPage from "@/pages/colors-manager";
import ReceiptDesignerPage from "@/pages/receipt-designer";
import { RouteErrorPage, NotFoundPage } from "@/pages/error-page";
import "@/index.css";

/** Plain-language message for a failed query/mutation: transient database
 * contention gets a calmer "busy, try again" than the generic fallback. */
function globalErrorMessage(error: unknown, fallbackKey: string): string {
  return i18n.t(isDatabaseBusy(error) ? "problem.databaseBusy" : fallbackKey);
}

// Global safety net: every failed query/mutation surfaces as a calm, translated
// toast (and a log entry) unless the owning hook opted out with
// `meta.silenceGlobal` because all of its callers already handle errors.
// Guarantees no action ever fails silently and no raw exception reaches the UI.
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.silenceGlobal) return;
      notifyError(error, globalErrorMessage(error, "problem.loadFailed"));
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.silenceGlobal) return;
      notifyError(error, globalErrorMessage(error, "problem.saveFailed"));
    },
  }),
});

// Unhandled promise rejections (e.g. fire-and-forget background writes) are
// logged for support but never shown to the user.
window.addEventListener("unhandledrejection", (event) => {
  void logError(`unhandled rejection :: ${describeError(event.reason)}`).catch(
    () => {},
  );
});

// Dev-only: expose the demo-data seeder on the console (window.seedDatabase /
// window.clearSeedData). Stripped from production builds. See src/db/seed.ts.
if (import.meta.env.DEV) {
  void import("@/db/seed").then((m) => {
    (window as unknown as Record<string, unknown>).seedDatabase =
      m.seedDatabase;
    (window as unknown as Record<string, unknown>).clearSeedData =
      m.clearSeedData;
  });
}

// HashRouter avoids deep-link 404s when the app is served from tauri://localhost.
const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    // Catches render errors thrown anywhere in the layout/page tree so a crash
    // shows a recoverable screen instead of a blank tauri:// window.
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "patients", element: <PatientsListPage /> },
      { path: "patients/new", element: <PatientFormPage /> },
      { path: "patients/import", element: <PatientsImportPage /> },
      { path: "patients/:id", element: <PatientDetailPage /> },
      { path: "patients/:id/edit", element: <PatientFormPage /> },
      { path: "tracking", element: <TrackingProductsPage /> },
      { path: "notifications", element: <NotificationsPage /> },
      { path: "sales", element: <SalesListPage /> },
      { path: "pos", element: <PosPage /> },
      {
        // Legacy route: the advanced sale form was merged into the POS. The
        // query (?patient=&prescription=) is kept so the prefill still works.
        path: "sales/new",
        loader: ({ request }) => redirect(`/pos${new URL(request.url).search}`),
      },
      { path: "sales/:id", element: <SaleDetailPage /> },
      { path: "jobs", element: <JobsPage /> },
      { path: "jobs/:id", element: <JobDetailPage /> },
      { path: "appointments", element: <AppointmentsPage /> },
      { path: "insurance", element: <InsurancePage /> },
      { path: "suppliers", element: <SuppliersPage /> },
      // Manager-gated sections, behind the shop password when one is set. A
      // pathless layout route, so the gate renders in place inside <Layout>: the
      // URL never changes, a deep link survives the unlock, and the hash
      // router's history is untouched. Wrapping each element individually would
      // repeat the guard eight times; a redirect would strand the Back button.
      {
        element: <RequireUnlock />,
        children: [
          { path: "inventory", element: <InventoryListPage /> },
          { path: "inventory/new", element: <ProductFormPage /> },
          { path: "inventory/:id/edit", element: <ProductFormPage /> },
          { path: "reports", element: <ReportsPage /> },
          { path: "expenses", element: <ExpensesPage /> },
          { path: "settings", element: <SettingsPage /> },
          { path: "settings/attributes", element: <AttributeTemplatesPage /> },
          { path: "settings/colors", element: <ColorsManagerPage /> },
          { path: "settings/receipt", element: <ReceiptDesignerPage /> },
        ],
      },
      // Unknown routes keep the app chrome and show a branded 404.
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  // Standalone print routes (rendered without the app chrome for clean printing).
  // Each carries its own errorElement: they live outside the Layout tree, so
  // without one a render crash would leave a blank tauri:// window.
  {
    path: "/sales/:id/print",
    element: <SalePrintPage />,
    errorElement: <RouteErrorPage />,
  },
  {
    path: "/patients/:id/statement/print",
    element: <PatientStatementPrintPage />,
    errorElement: <RouteErrorPage />,
  },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LocaleProvider>
          <Onboarding />
          <RouterProvider router={router} />
        </LocaleProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
