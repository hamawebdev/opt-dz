import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BadgePercent,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Package,
  Receipt,
  RotateCcw,
  TrendingUp,
  Undo2,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/error-state";
import { StatCard } from "@/components/stat-card";
import { SearchSelect, type SearchOption } from "@/components/search-select";
import {
  useSaleItemSummaries,
  useSaleItems,
  useSales,
  useSalesListStats,
} from "@/hooks/use-sales";
import { useReturnedQuantities } from "@/hooks/use-returns";
import { ReturnDialog } from "@/components/return-dialog";
import { usePatients } from "@/hooks/use-patients";
import { useSettings } from "@/hooks/use-settings";
import { useSimpleMode } from "@/store/use-app-store";
import { SaleStatusPill } from "@/components/status-pill";
import { formatDZD, formatDate, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SaleItemSummary } from "@/db/sales";

const PAGE_SIZE = 20;

export default function SalesListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const simpleMode = useSimpleMode();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [patientId, setPatientId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  // Streamlined returns: process a return from the list row without opening
  // the sale-detail page first.
  const [returnSaleId, setReturnSaleId] = useState<number | null>(null);
  const { data: returnItems } = useSaleItems(returnSaleId ?? undefined);
  const { data: returnedQty } = useReturnedQuantities(returnSaleId ?? undefined);

  const { data: patients } = usePatients();
  const { data: settings } = useSettings();
  const symbol = settings?.currency_symbol;

  const filters = useMemo(
    () => ({
      from: from || null,
      to: to || null,
      patientId: patientId ? Number(patientId) : null,
    }),
    [from, to, patientId],
  );
  const salesQuery = useSales(filters);
  const { data: sales, isLoading } = salesQuery;
  // KPI cards are hidden in simple mode (same convention as the home dashboard),
  // so skip their queries entirely there.
  const statsQuery = useSalesListStats(filters, !simpleMode);
  const stats = statsQuery.data;
  const { data: itemSummaries } = useSaleItemSummaries(filters);

  const itemsBySale = useMemo(() => {
    const map = new Map<number, SaleItemSummary[]>();
    for (const it of itemSummaries ?? []) {
      const arr = map.get(it.sale_id);
      if (arr) arr.push(it);
      else map.set(it.sale_id, [it]);
    }
    return map;
  }, [itemSummaries]);

  const patientOptions: SearchOption[] = useMemo(
    () =>
      (patients ?? []).map((p) => ({
        value: String(p.id),
        label: p.full_name,
        keywords: p.phone ?? "",
      })),
    [patients],
  );

  // One-tap ranges so "how did we do today?" never requires typing dates.
  const todayStr = todayISO();
  const presets = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 6);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return [
      {
        key: "today",
        label: t("sales.presetToday"),
        from: todayStr,
        to: todayStr,
      },
      {
        key: "week",
        label: t("sales.preset7Days"),
        from: todayISO(weekStart),
        to: todayStr,
      },
      {
        key: "month",
        label: t("sales.presetThisMonth"),
        from: todayISO(monthStart),
        to: todayStr,
      },
    ];
  }, [t, todayStr]);

  // Every filter change restarts at page 1 — the handlers below all funnel
  // through these setters.
  function changeFrom(v: string) {
    setFrom(v);
    setPage(1);
  }
  function changeTo(v: string) {
    setTo(v);
    setPage(1);
  }
  function changePatient(v: string | null) {
    setPatientId(v);
    setPage(1);
  }

  function applyPreset(preset: (typeof presets)[number]) {
    if (from === preset.from && to === preset.to) {
      // Tapping the active preset toggles it off (back to all time).
      changeFrom("");
      changeTo("");
    } else {
      changeFrom(preset.from);
      changeTo(preset.to);
    }
  }

  const hasFilters = from || to || patientId;
  function clearFilters() {
    changeFrom("");
    changeTo("");
    changePatient(null);
  }

  const pageCount = Math.max(1, Math.ceil((sales?.length ?? 0) / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageSales = (sales ?? []).slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const marginPct =
    stats && stats.revenue > 0
      ? Math.round((stats.netProfit / stats.revenue) * 100)
      : null;

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Business summary — the read-first block. */}
      {!simpleMode && (
        <section className="flex flex-col gap-3">
          {statsQuery.isError ? (
            <ErrorState onRetry={() => statsQuery.refetch()} />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  title={t("sales.kpiRevenue")}
                  value={formatDZD(stats?.revenue, symbol)}
                  sub={t("sales.kpiCollectedSub", {
                    amount: formatDZD(stats?.collected, symbol),
                  })}
                  icon={<DollarSign className="size-5" />}
                  loading={statsQuery.isLoading}
                />
                <StatCard
                  title={t("sales.kpiNetProfit")}
                  value={formatDZD(stats?.netProfit, symbol)}
                  sub={
                    marginPct != null
                      ? t("sales.kpiMarginSub", { pct: marginPct })
                      : undefined
                  }
                  icon={<TrendingUp className="size-5" />}
                  loading={statsQuery.isLoading}
                />
                <StatCard
                  title={t("sales.kpiSales")}
                  value={String(stats?.salesCount ?? 0)}
                  icon={<Receipt className="size-5" />}
                  loading={statsQuery.isLoading}
                />
                <StatCard
                  title={t("sales.kpiPending")}
                  value={formatDZD(stats?.outstanding, symbol)}
                  sub={t("sales.kpiPendingSub", {
                    count: stats?.pendingCount ?? 0,
                  })}
                  icon={<Wallet className="size-5" />}
                  accent={
                    stats && stats.outstanding > 0 ? "warning" : undefined
                  }
                  loading={statsQuery.isLoading}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <MiniStat
                  label={t("sales.kpiItemsSold")}
                  value={String(stats?.itemsSold ?? 0)}
                  icon={<Package className="size-4" />}
                  loading={statsQuery.isLoading}
                />
                <MiniStat
                  label={t("sales.kpiDiscounts")}
                  value={formatDZD(stats?.discounts, symbol)}
                  icon={<BadgePercent className="size-4" />}
                  loading={statsQuery.isLoading}
                />
                <MiniStat
                  label={t("sales.kpiRefunds")}
                  value={formatDZD(stats?.refunds, symbol)}
                  icon={<Undo2 className="size-4" />}
                  loading={statsQuery.isLoading}
                />
              </div>
            </>
          )}
        </section>
      )}

      {/* 2. Filters / search. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="bg-muted/40 flex rounded-lg border p-0.5">
            {presets.map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant={from === p.from && to === p.to ? "secondary" : "ghost"}
                className="h-8"
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="from" className="text-xs">
              {t("common.from")}
            </Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => changeFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="to" className="text-xs">
              {t("common.to")}
            </Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => changeTo(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">{t("common.patient")}</Label>
            <div className="w-56">
              <SearchSelect
                options={patientOptions}
                value={patientId}
                onChange={changePatient}
                placeholder={t("sales.patientFilterPlaceholder")}
                searchPlaceholder={t("common.search")}
              />
            </div>
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="size-4" /> {t("sales.clear")}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link to="/pos">
              <Zap className="size-4" /> {t("sales.newSale")}
            </Link>
          </Button>
        </div>
      </div>

      {/* 3. Payments table. */}
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.invoice")}</TableHead>
              <TableHead>{t("common.date")}</TableHead>
              <TableHead>{t("common.patient")}</TableHead>
              <TableHead className="hidden md:table-cell">
                {t("sales.items")}
              </TableHead>
              <TableHead className="text-right">{t("common.total")}</TableHead>
              <TableHead className="text-right">{t("common.paid")}</TableHead>
              <TableHead className="text-right">
                {t("common.balance")}
              </TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={9}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : salesQuery.isError ? (
              <TableRow>
                <TableCell colSpan={9} className="p-0">
                  <ErrorState
                    className="border-0"
                    onRetry={() => salesQuery.refetch()}
                  />
                </TableCell>
              </TableRow>
            ) : !sales?.length ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-muted-foreground py-10 text-center"
                >
                  {t("sales.noSales")}
                </TableCell>
              </TableRow>
            ) : (
              pageSales.map((s) => (
                <TableRow
                  key={s.id}
                  className={cn(
                    "cursor-pointer",
                    s.status === "void" && "opacity-60",
                  )}
                  onClick={() => navigate(`/sales/${s.id}`)}
                >
                  <TableCell className="font-medium">#{s.id}</TableCell>
                  <TableCell>{formatDate(s.sale_date)}</TableCell>
                  <TableCell>{s.patient_name ?? t("sales.walkIn")}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <ItemsCell items={itemsBySale.get(s.id)} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDZD(s.total, symbol)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDZD(s.amount_paid, symbol)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      s.balance > 0 &&
                        s.status !== "void" &&
                        "text-warning font-medium",
                    )}
                  >
                    {formatDZD(s.balance, symbol)}
                  </TableCell>
                  <TableCell>
                    <SaleStatusPill status={s.status} />
                  </TableCell>
                  <TableCell>
                    {s.status !== "void" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={t("sales.return")}
                        title={t("sales.return")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setReturnSaleId(s.id);
                        }}
                      >
                        <RotateCcw className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* 4. Pagination. */}
      {!isLoading && !salesQuery.isError && (sales?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            {t("sales.resultsCount", { count: sales?.length ?? 0 })}
          </p>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
                aria-label={t("common.previous")}
              >
                <ChevronLeft className="size-4 rtl:rotate-180" />
              </Button>
              <span className="text-sm tabular-nums">
                {t("sales.pageOf", { page: safePage, total: pageCount })}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={safePage >= pageCount}
                onClick={() => setPage(safePage + 1)}
                aria-label={t("common.next")}
              >
                <ChevronRight className="size-4 rtl:rotate-180" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Return dialog for the row action. `key` resets qty/notes between sales. */}
      {returnSaleId != null && returnItems && (
        <ReturnDialog
          key={returnSaleId}
          saleId={returnSaleId}
          items={returnItems}
          returned={returnedQty ?? {}}
          currencySymbol={symbol}
          open
          onOpenChange={(o) => !o && setReturnSaleId(null)}
        />
      )}
    </div>
  );
}

function formatItemLine(it: SaleItemSummary): string {
  return it.quantity > 1 ? `${it.quantity}× ${it.description}` : it.description;
}

/** Compact per-row items summary: first two lines inline, the rest behind a "+N"
 * popover so long invoices never widen the table. */
function ItemsCell({ items }: { items: SaleItemSummary[] | undefined }) {
  const { t } = useTranslation();
  if (!items?.length) {
    return <span className="text-muted-foreground">—</span>;
  }
  const shown = items.slice(0, 2);
  const more = items.length - shown.length;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground block max-w-56 truncate text-sm xl:max-w-72">
        {shown.map(formatItemLine).join(" · ")}
      </span>
      {more > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            {/* stopPropagation: the whole row navigates to the sale on click. */}
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label={t("sales.showAllItems")}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-ring/60 inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium tabular-nums transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              +{more}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-72 p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-muted-foreground px-2 pt-1 pb-1.5 text-xs font-medium">
              {t("sales.itemsInSale", { count: items.length })}
            </p>
            <ul className="max-h-60 overflow-y-auto">
              {items.map((it, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm"
                >
                  <span className="truncate">{it.description}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    × {it.quantity}
                  </span>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

/** Single-line secondary stat, for figures that matter but shouldn't compete
 * with the headline cards. */
function MiniStat({
  label,
  value,
  icon,
  loading,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="bg-card flex items-center gap-3 rounded-xl border px-4 py-2.5">
      <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
        {icon}
      </span>
      <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
        {label}
      </span>
      {loading ? (
        <Skeleton className="h-5 w-16" />
      ) : (
        <span className="text-sm font-semibold tabular-nums">{value}</span>
      )}
    </div>
  );
}
