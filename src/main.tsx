import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { LocaleProvider } from "@/components/locale-provider";
import { Onboarding } from "@/components/onboarding";
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
import SaleFormPage from "@/pages/sale-form";
import SaleDetailPage from "@/pages/sale-detail";
import SalePrintPage from "@/pages/sale-print";
import LabelPrintPage from "@/pages/label-print";
import JobsPage from "@/pages/jobs";
import AppointmentsPage from "@/pages/appointments";
import InsurancePage from "@/pages/insurance";
import SuppliersPage from "@/pages/suppliers";
import ReportsPage from "@/pages/reports";
import SettingsPage from "@/pages/settings";
import AttributeTemplatesPage from "@/pages/attribute-templates";
import ColorsManagerPage from "@/pages/colors-manager";
import ReceiptDesignerPage from "@/pages/receipt-designer";
import { RouteErrorPage, NotFoundPage } from "@/pages/error-page";
import "@/index.css";

const queryClient = new QueryClient();

// Dev-only: expose the demo-data seeder on the console (window.seedDatabase /
// window.clearSeedData). Stripped from production builds. See src/db/seed.ts.
if (import.meta.env.DEV) {
  void import("@/db/seed").then((m) => {
    (window as unknown as Record<string, unknown>).seedDatabase = m.seedDatabase;
    (window as unknown as Record<string, unknown>).clearSeedData = m.clearSeedData;
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
      { path: "inventory", element: <InventoryListPage /> },
      { path: "inventory/new", element: <ProductFormPage /> },
      { path: "inventory/:id/edit", element: <ProductFormPage /> },
      { path: "tracking", element: <TrackingProductsPage /> },
      { path: "notifications", element: <NotificationsPage /> },
      { path: "sales", element: <SalesListPage /> },
      { path: "sales/new", element: <SaleFormPage /> },
      { path: "sales/:id", element: <SaleDetailPage /> },
      { path: "jobs", element: <JobsPage /> },
      { path: "appointments", element: <AppointmentsPage /> },
      { path: "insurance", element: <InsurancePage /> },
      { path: "suppliers", element: <SuppliersPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "settings/attributes", element: <AttributeTemplatesPage /> },
      { path: "settings/colors", element: <ColorsManagerPage /> },
      { path: "settings/receipt", element: <ReceiptDesignerPage /> },
      // Unknown routes keep the app chrome and show a branded 404.
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  // Standalone print routes (rendered without the app chrome for clean printing).
  { path: "/sales/:id/print", element: <SalePrintPage /> },
  { path: "/patients/:id/statement/print", element: <PatientStatementPrintPage /> },
  { path: "/label/print", element: <LabelPrintPage /> },
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
