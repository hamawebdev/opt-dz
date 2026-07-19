import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { runAutoBackupIfDue } from "@/lib/auto-backup";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import { NotificationBell } from "@/components/notification-bell";
import { LockButton } from "@/components/lock-button";

// Maps the first route segment to its nav translation key.
const SEGMENT_TO_NAV_KEY: Record<string, string> = {
  "": "nav.dashboard",
  patients: "nav.patients",
  inventory: "nav.inventory",
  tracking: "nav.tracking",
  suppliers: "nav.suppliers",
  notifications: "nav.notifications",
  sales: "nav.sales",
  pos: "nav.pos",
  jobs: "nav.jobs",
  insurance: "nav.insurance",
  reports: "nav.reports",
  settings: "nav.settings",
};

/** Derives a readable, translated page title from the current route. */
function usePageTitle(): string {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const seg =
    pathname === "/" ? "" : (pathname.split("/").filter(Boolean)[0] ?? "");
  const key = SEGMENT_TO_NAV_KEY[seg];
  return key ? t(key) : seg.charAt(0).toUpperCase() + seg.slice(1);
}

export default function Layout() {
  const title = usePageTitle();
  const { t, i18n } = useTranslation();

  // Run a scheduled database backup once per app session if one is due.
  // Delayed well past startup: the first page's queries and the backup snapshot
  // would otherwise compete for the database at the busiest moment.
  useEffect(() => {
    const id = window.setTimeout(() => void runAutoBackupIfDue(), 45_000);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="bg-background/80 supports-[backdrop-filter]:bg-background/65 sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2.5 border-b px-5 backdrop-blur-xl">
          <SidebarTrigger
            label={t("nav.menu")}
            className="text-muted-foreground hover:text-foreground -ms-1"
          />
          <Separator orientation="vertical" className="me-1 h-5" />
          <h1 className="text-[0.95rem] font-semibold tracking-tight">
            {title}
          </h1>
          <div className="ms-auto flex items-center gap-1">
            <LockButton />
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
      {/* Toasts hug the reading-start corner, so top-left in Arabic (RTL). */}
      <Toaster
        richColors
        position={i18n.dir() === "rtl" ? "top-left" : "top-right"}
      />
    </SidebarProvider>
  );
}
