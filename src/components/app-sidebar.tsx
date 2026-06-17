import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  Zap,
  Hammer,
  ShieldCheck,
  BarChart3,
  Settings,
  Glasses,
  Truck,
  Hourglass,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useSettings } from "@/hooks/use-settings";
import { useSimpleMode } from "@/store/use-app-store";

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  end?: boolean;
  /** Hidden in simple mode. */
  advanced?: boolean;
}

// The handful of things a daily user touches — kept first and always visible.
const dailyItems: NavItem[] = [
  { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard, end: true },
  { to: "/pos", labelKey: "nav.pos", icon: Zap },
  { to: "/patients", labelKey: "nav.patients", icon: Users },
  { to: "/sales", labelKey: "nav.sales", icon: ShoppingCart },
  { to: "/appointments", labelKey: "nav.appointments", icon: CalendarDays },
  { to: "/jobs", labelKey: "nav.jobs", icon: Hammer },
  { to: "/inventory", labelKey: "nav.inventory", icon: Package },
];

// Advanced / back-office areas. `Hourglass` (not a second calendar) keeps
// Tracking visually distinct from Appointments.
const manageItems: NavItem[] = [
  {
    to: "/tracking",
    labelKey: "nav.tracking",
    icon: Hourglass,
    advanced: true,
  },
  { to: "/suppliers", labelKey: "nav.suppliers", icon: Truck, advanced: true },
  {
    to: "/insurance",
    labelKey: "nav.insurance",
    icon: ShieldCheck,
    advanced: true,
  },
  { to: "/reports", labelKey: "nav.reports", icon: BarChart3, advanced: true },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
];

function NavSection({ items, label }: { items: NavItem[]; label: string }) {
  const { t } = useTranslation();
  if (!items.length) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-sidebar-foreground/60 px-2 text-[0.7rem] font-medium tracking-[0.08em] uppercase">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(({ to, labelKey, icon: Icon, end }) => {
            const itemLabel = t(labelKey);
            return (
              <SidebarMenuItem key={to}>
                <NavLink to={to} end={end}>
                  {({ isActive }) => (
                    <SidebarMenuButton tooltip={itemLabel} isActive={isActive}>
                      <Icon />
                      <span>{itemLabel}</span>
                    </SidebarMenuButton>
                  )}
                </NavLink>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const simpleMode = useSimpleMode();
  const shopName = settings?.shop_name || "Opt DZ";

  // In simple mode, advanced back-office items are hidden; Settings stays so
  // the mode can always be turned off again.
  const visibleManage = simpleMode
    ? manageItems.filter((i) => !i.advanced)
    : manageItems;

  return (
    // `offcanvas` (not `icon`): the sidebar is never reduced to icons-only,
    // which would be a memory test with hover-only tooltips for our users.
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              className="hover:bg-sidebar-accent/60 data-[active=true]:before:hidden"
            >
              <NavLink to="/">
                <div className="from-primary to-primary/80 text-primary-foreground ring-primary/20 flex aspect-square size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm ring-1 group-data-[collapsible=icon]:size-8">
                  <Glasses className="size-5" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold tracking-tight">
                    {shopName}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {t("nav.appTagline")}
                  </span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavSection items={dailyItems} label={t("nav.daily")} />
        <NavSection items={visibleManage} label={t("nav.manage")} />
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
