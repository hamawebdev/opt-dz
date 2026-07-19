import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DollarSign,
  Receipt,
  AlertTriangle,
  Wallet,
  LockKeyhole,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Hammer,
  ShoppingCart,
  UserPlus,
  CalendarDays,
  CreditCard,
} from "lucide-react";
import { PaymentDialog } from "@/components/payment-dialog";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/error-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useDashboardStats,
  usePendingPayments,
  useRevenueByDay,
  useDueRecalls,
} from "@/hooks/use-reports";
import { useLowStock } from "@/hooks/use-inventory";
import { useJobs, useJobStageCounts } from "@/hooks/use-jobs";
import { useSettings } from "@/hooks/use-settings";
import { formatDZD, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSimpleMode } from "@/store/use-app-store";
import { useUnlockStore } from "@/store/use-unlock-store";
import { isPasswordSet } from "@/lib/auth";
import { JobStatusPill, StatusPill } from "@/components/status-pill";

export default function HomePage() {
  const { t } = useTranslation();
  const simpleMode = useSimpleMode();
  const { data: stats, isLoading } = useDashboardStats();
  const revenueQuery = useRevenueByDay(14);
  const { data: revenue } = revenueQuery;
  const lowStockQuery = useLowStock();
  const { data: lowStock } = lowStockQuery;
  const pendingQuery = usePendingPayments(6);
  const { data: pending } = pendingQuery;
  const { data: settings } = useSettings();
  const symbol = settings?.currency_symbol;
  const recallMonths = Number(settings?.recall_months ?? 24) || 24;
  const recallsQuery = useDueRecalls(recallMonths);
  const { data: recalls } = recallsQuery;
  const jobsQuery = useJobs({ activeOnly: true });
  const { data: activeJobs } = jobsQuery;
  const { data: jobCounts } = useJobStageCounts();
  // Takings and margins belong to the manager sections, so they follow the same
  // lock. The dashboard itself stays open — gating the landing page would put a
  // password prompt in front of every app launch.
  const unlocked = useUnlockStore((s) => s.unlocked);
  const canSeeMoney = !isPasswordSet(settings) || unlocked;
  // Take a payment straight from the pending-payments list (no trek through
  // sales → sale detail).
  const [paySale, setPaySale] = useState<{
    id: number;
    balance: number;
  } | null>(null);

  // Notify once per app session about recalls due.
  const notified = useRef(false);
  useEffect(() => {
    if (notified.current || !recalls || recalls.length === 0) return;
    notified.current = true;
    (async () => {
      try {
        let granted = await isPermissionGranted();
        if (!granted) granted = (await requestPermission()) === "granted";
        if (granted) {
          sendNotification({
            title: t("home.recallNotifTitle"),
            body: t("home.recallNotifBody", { count: recalls.length }),
          });
        }
      } catch {
        // Notifications unavailable — the dashboard widget still shows recalls.
      }
    })();
  }, [recalls, t]);

  const chartData =
    revenue?.map((r) => ({ label: r.day.slice(5), revenue: r.revenue })) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <QuickActions />

      {!simpleMode && !canSeeMoney && (
        <Card>
          <CardContent className="text-muted-foreground flex items-center gap-3 py-6 text-sm">
            <LockKeyhole className="size-5 shrink-0" />
            {t("auth.figuresLocked")}
          </CardContent>
        </Card>
      )}

      {!simpleMode && canSeeMoney && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title={t("home.todaysSales")}
            value={formatDZD(stats?.todaySalesTotal, symbol)}
            sub={t("home.collectedToday", {
              amount: formatDZD(stats?.todayCollected, symbol),
            })}
            icon={<DollarSign className="size-5" />}
            loading={isLoading}
          />
          <StatCard
            title={t("home.invoicesToday")}
            value={String(stats?.todayInvoiceCount ?? 0)}
            icon={<Receipt className="size-5" />}
            loading={isLoading}
          />
          <StatCard
            title={t("home.lowStockItems")}
            value={String(stats?.lowStockCount ?? 0)}
            icon={<AlertTriangle className="size-5" />}
            accent={stats && stats.lowStockCount > 0 ? "warning" : undefined}
            loading={isLoading}
          />
          <StatCard
            title={t("home.outstandingBalance")}
            value={formatDZD(stats?.outstandingTotal, symbol)}
            icon={<Wallet className="size-5" />}
            loading={isLoading}
          />
        </div>
      )}

      {!simpleMode && canSeeMoney && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>{t("home.revenueLast14")}</CardTitle>
          </CardHeader>
          <CardContent>
            {revenueQuery.isError ? (
              <ErrorState
                className="border-0"
                onRetry={() => revenueQuery.refetch()}
              />
            ) : chartData.every((d) => d.revenue === 0) ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                {t("home.noSalesYet")}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="revenueFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="var(--primary)"
                        stopOpacity={0.95}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--primary)"
                        stopOpacity={0.55}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="2 6"
                    vertical={false}
                    stroke="var(--border)"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                  />
                  <YAxis
                    width={48}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => {
                      const d = Number(v) / 100; // centimes -> dinar
                      return d >= 1000 ? `${d / 1000}k` : String(d);
                    }}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--accent)", opacity: 0.5, radius: 6 }}
                    formatter={(value) => [
                      formatDZD(Number(value), symbol),
                      t("home.revenue"),
                    ]}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      boxShadow: "var(--shadow-lg)",
                      color: "var(--popover-foreground)",
                      fontSize: 12,
                    }}
                    labelStyle={{ fontWeight: 600, marginBottom: 2 }}
                  />
                  <Bar
                    dataKey="revenue"
                    fill="url(#revenueFill)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="text-muted-foreground size-4" />
              {t("home.lowStockAlerts")}
            </CardTitle>
            <SectionLink to="/inventory">{t("nav.inventory")}</SectionLink>
          </CardHeader>
          <CardContent>
            {lowStockQuery.isError ? (
              <ErrorState
                className="border-0 p-0 md:p-0"
                onRetry={() => lowStockQuery.refetch()}
              />
            ) : !lowStock?.length ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                {t("home.allStocked")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("home.product")}</TableHead>
                    <TableHead>{t("common.category")}</TableHead>
                    <TableHead className="text-right">
                      {t("home.inStock")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("home.min")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStock.slice(0, 6).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{t(`category.${p.category}`)}</TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={
                            p.quantity <= 0 ? "destructive" : "secondary"
                          }
                        >
                          {p.quantity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {p.min_stock}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Wallet className="text-muted-foreground size-4" />
              {t("home.pendingPayments")}
            </CardTitle>
            <SectionLink to="/sales">{t("nav.sales")}</SectionLink>
          </CardHeader>
          <CardContent>
            {pendingQuery.isError ? (
              <ErrorState
                className="border-0 p-0 md:p-0"
                onRetry={() => pendingQuery.refetch()}
              />
            ) : !pending?.length ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                {t("home.noOutstanding")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.invoice")}</TableHead>
                    <TableHead>{t("common.patient")}</TableHead>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead className="text-right">
                      {t("common.balance")}
                    </TableHead>
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        <Link to={`/sales/${s.id}`} className="hover:underline">
                          #{s.id}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {s.patient_name ?? t("sales.walkIn")}
                      </TableCell>
                      <TableCell>{formatDate(s.sale_date)}</TableCell>
                      <TableCell className="text-warning text-right font-semibold tabular-nums">
                        {formatDZD(s.balance, symbol)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPaySale({ id: s.id, balance: s.balance })
                          }
                        >
                          <CreditCard className="me-1 size-4" />
                          {t("sales.recordPayment")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BellRing className="text-primary size-4" />{" "}
              {t("home.dueForRecall")}
            </CardTitle>
            <SectionLink to="/patients">{t("nav.patients")}</SectionLink>
          </CardHeader>
          <CardContent>
            {recallsQuery.isError ? (
              <ErrorState
                className="border-0 p-0 md:p-0"
                onRetry={() => recallsQuery.refetch()}
              />
            ) : !recalls?.length ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                {t("home.noRecalls")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.patient")}</TableHead>
                    <TableHead>{t("common.phone")}</TableHead>
                    <TableHead className="text-right">
                      {t("home.lastExam")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recalls.slice(0, 6).map((r) => (
                    <TableRow key={r.patient_id}>
                      <TableCell className="font-medium">
                        <Link
                          to={`/patients/${r.patient_id}`}
                          className="hover:underline"
                        >
                          {r.patient_name}
                        </Link>
                      </TableCell>
                      <TableCell>{r.phone ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {formatDate(r.last_exam)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Hammer className="text-primary size-4" />{" "}
              {t("home.activeLabJobs")}
              {(jobCounts?.overdue ?? 0) > 0 && (
                <StatusPill
                  tone="danger"
                  icon={AlertTriangle}
                  label={t("jobs.lateWithCount", {
                    count: jobCounts?.overdue ?? 0,
                  })}
                />
              )}
              {(jobCounts?.ready ?? 0) > 0 && (
                <StatusPill
                  tone="success"
                  icon={CheckCircle2}
                  label={t("jobs.readyWithCount", {
                    count: jobCounts?.ready ?? 0,
                  })}
                />
              )}
            </CardTitle>
            <SectionLink to="/jobs">{t("nav.jobs")}</SectionLink>
          </CardHeader>
          <CardContent>
            {jobsQuery.isError ? (
              <ErrorState
                className="border-0 p-0 md:p-0"
                onRetry={() => jobsQuery.refetch()}
              />
            ) : !activeJobs?.length ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                {t("home.noJobsInProgress")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.patient")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead className="text-right">
                      {t("home.expected")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeJobs.slice(0, 6).map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="font-medium">
                        <Link
                          to={`/jobs/${j.id}`}
                          className="hover:underline"
                        >
                          {j.patient_name ?? t("sales.walkIn")}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <JobStatusPill status={j.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {j.expected_ready ? formatDate(j.expected_ready) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      <PaymentDialog
        key={paySale ? `pay-${paySale.id}` : "pay-closed"}
        saleId={paySale?.id ?? 0}
        balance={paySale?.balance ?? 0}
        currencySymbol={symbol}
        open={paySale != null}
        onOpenChange={(open) => {
          if (!open) setPaySale(null);
        }}
      />
    </div>
  );
}

/** Big, image-led task tiles — the first thing a daily user should see. */
function QuickActions() {
  const { t } = useTranslation();
  // Glasses waiting for pickup, badged on the lab tile even in simple mode.
  const { data: jobCounts } = useJobStageCounts();
  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold tracking-tight">
        {t("quick.title")}
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QuickAction
          to="/pos"
          icon={ShoppingCart}
          label={t("quick.newSale")}
          primary
        />
        <QuickAction
          to="/patients"
          icon={UserPlus}
          label={t("quick.findPatient")}
        />
        <QuickAction
          to="/appointments"
          icon={CalendarDays}
          label={t("quick.appointments")}
        />
        <QuickAction
          to="/jobs?stage=ready"
          icon={Hammer}
          label={t("quick.labOrders")}
          badge={jobCounts?.ready}
        />
      </div>
    </div>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
  primary,
  badge,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  primary?: boolean;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group focus-visible:ring-ring/60 flex min-h-[7.5rem] flex-col items-center justify-center gap-3 rounded-2xl border p-5 text-center transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:outline-none",
        primary
          ? "bg-primary text-primary-foreground hover:bg-primary/90 border-transparent"
          : "hover:bg-accent",
      )}
    >
      <span
        className={cn(
          "relative flex size-12 items-center justify-center rounded-xl",
          primary ? "bg-white/15" : "bg-primary/10 text-primary",
        )}
      >
        <Icon className="size-6" />
        {!!badge && (
          <span className="bg-success text-success-foreground absolute -top-1.5 -end-1.5 flex size-5 items-center justify-center rounded-full text-xs font-bold tabular-nums">
            {badge}
          </span>
        )}
      </span>
      <span className="text-base leading-tight font-semibold">{label}</span>
    </Link>
  );
}

/** Consistent, refined "view all" affordance for dashboard section headers. */
function SectionLink({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="group text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium transition-colors"
    >
      {children}
      <ArrowRight className="size-3.5 transition-transform duration-200 ease-[var(--ease-out-soft)] group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
    </Link>
  );
}
