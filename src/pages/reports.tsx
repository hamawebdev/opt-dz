import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  CalendarRange,
  Hourglass,
  Landmark,
  Receipt,
  TrendingUp,
  Trophy,
  Undo2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CollectedChart } from "@/components/collected-chart";
import { ErrorState } from "@/components/error-state";
import { HelpHint } from "@/components/help-hint";
import { StatCard } from "@/components/stat-card";
import {
  useBestSellers,
  useCollectedByDay,
  useOutstandingBalances,
  useReportOverview,
  useTaxInRange,
} from "@/hooks/use-reports";
import { useSettings } from "@/hooks/use-settings";
import {
  buildBuckets,
  formatRangeLabel,
  presetRange,
  type DateRange,
  type ReportPreset,
} from "@/lib/date-range";
import { formatDZD } from "@/lib/format";

const PRESETS: { key: ReportPreset; labelKey: string }[] = [
  { key: "today", labelKey: "reports.presetToday" },
  { key: "yesterday", labelKey: "reports.presetYesterday" },
  { key: "week", labelKey: "reports.presetThisWeek" },
  { key: "month", labelKey: "reports.presetThisMonth" },
  { key: "custom", labelKey: "reports.presetCustom" },
];

export default function ReportsPage() {
  const { t } = useTranslation();
  const [preset, setPreset] = useState<ReportPreset>("week");
  const [customRange, setCustomRange] = useState<DateRange>(() =>
    presetRange("week"),
  );
  const range = preset === "custom" ? customRange : presetRange(preset);
  const rangeLabel = formatRangeLabel(range);
  const presetLabelKey =
    PRESETS.find((p) => p.key === preset)?.labelKey ?? "reports.presetCustom";

  const overviewQuery = useReportOverview(range.from, range.to);
  const taxQuery = useTaxInRange(range.from, range.to);
  const collectedQuery = useCollectedByDay(range.from, range.to);
  const { data: bestSellers } = useBestSellers(range.from, range.to, 10);
  const { data: outstanding } = useOutstandingBalances();
  const { data: settings } = useSettings();
  const symbol = settings?.currency_symbol;
  const overview = overviewQuery.data;

  const selectPreset = (key: ReportPreset) => {
    // Start the custom inputs from the range currently on screen.
    if (key === "custom" && preset !== "custom") setCustomRange(range);
    setPreset(key);
  };

  // Key on the strings: `range` is rebuilt each render for non-custom presets.
  const { unit, buckets } = useMemo(
    () => buildBuckets({ from: range.from, to: range.to }),
    [range.from, range.to],
  );
  const chartData = useMemo(() => {
    const rows = collectedQuery.data ?? [];
    return buckets.map((b) => ({
      label: b.label,
      collected: rows
        .filter((r) => r.day >= b.from && r.day <= b.to)
        .reduce((s, r) => s + r.collected, 0),
    }));
  }, [buckets, collectedQuery.data]);

  const totalOutstanding =
    outstanding?.reduce((s, r) => s + r.outstanding, 0) ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("reports.reportPeriod")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.key}
                type="button"
                size="lg"
                variant={preset === p.key ? "default" : "outline"}
                className="h-12 px-5 text-base"
                onClick={() => selectPreset(p.key)}
              >
                {t(p.labelKey)}
              </Button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex flex-wrap items-end gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="r_from" className="text-xs">
                  {t("common.from")}
                </Label>
                <Input
                  id="r_from"
                  type="date"
                  value={customRange.from}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    setCustomRange((r) => ({
                      from: v,
                      to: v > r.to ? v : r.to,
                    }));
                  }}
                  className="h-11 w-44"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="r_to" className="text-xs">
                  {t("common.to")}
                </Label>
                <Input
                  id="r_to"
                  type="date"
                  value={customRange.to}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    setCustomRange((r) => ({
                      from: v < r.from ? v : r.from,
                      to: v,
                    }));
                  }}
                  className="h-11 w-44"
                />
              </div>
            </div>
          )}
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <CalendarRange className="size-4 shrink-0" />
            <span className="text-foreground font-medium">
              {t(presetLabelKey)}
            </span>
            <span>{rangeLabel}</span>
          </p>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          {t("reports.periodSummary")}
          <HelpHint text={t("help.periodSummary")} />
        </h2>
        {overviewQuery.isError ? (
          <ErrorState onRetry={() => overviewQuery.refetch()} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              title={t("reports.kpiCollected")}
              value={formatDZD(overview?.collected, symbol)}
              sub={t("reports.kpiCollectedSub")}
              icon={<Wallet className="size-5" />}
              accent="success"
              loading={overviewQuery.isLoading}
            />
            <StatCard
              title={t("reports.kpiBilled")}
              value={formatDZD(overview?.billed, symbol)}
              sub={t("reports.kpiBilledSub")}
              icon={<TrendingUp className="size-5" />}
              loading={overviewQuery.isLoading}
            />
            <StatCard
              title={t("reports.kpiSales")}
              value={String(overview?.salesCount ?? 0)}
              sub={t("reports.kpiAvgSub", {
                amount: formatDZD(overview?.avgSale, symbol),
              })}
              icon={<Receipt className="size-5" />}
              loading={overviewQuery.isLoading}
            />
            <StatCard
              title={t("reports.kpiRefunds")}
              value={formatDZD(overview?.refunds, symbol)}
              icon={<Undo2 className="size-5" />}
              accent={overview?.refunds ? "warning" : undefined}
              loading={overviewQuery.isLoading}
            />
            <StatCard
              title={t("reports.kpiNewDebt")}
              value={formatDZD(overview?.newDebt, symbol)}
              sub={t("reports.kpiNewDebtSub", {
                count: overview?.newDebtCount ?? 0,
              })}
              icon={<Hourglass className="size-5" />}
              accent={overview?.newDebt ? "warning" : undefined}
              loading={overviewQuery.isLoading}
            />
            <StatCard
              title={t("reports.kpiTvaNet")}
              value={formatDZD(taxQuery.data?.tva, symbol)}
              sub={t("reports.timbrePlus", {
                amount: formatDZD(taxQuery.data?.timbre, symbol),
              })}
              icon={<Landmark className="size-5" />}
              loading={taxQuery.isLoading}
            />
          </div>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="text-primary size-4" />
            {t("reports.collectedByDay")}
          </CardTitle>
          <CardDescription>
            {rangeLabel}
            {unit === "week" && ` · ${t("reports.bucketWeek")}`}
            {unit === "month" && ` · ${t("reports.bucketMonth")}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {collectedQuery.isError ? (
            <ErrorState
              className="border-0"
              onRetry={() => collectedQuery.refetch()}
            />
          ) : collectedQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : chartData.every((d) => d.collected === 0) ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              {t("reports.noMoneyInPeriod")}
            </p>
          ) : (
            <CollectedChart data={chartData} symbol={symbol} />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="text-primary size-4" />{" "}
              {t("reports.bestSellers")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!bestSellers?.length ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                {t("reports.noSalesInPeriod")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("home.product")}</TableHead>
                    <TableHead className="text-right">
                      {t("reports.units")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("reports.revenue")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bestSellers.map((b, i) => (
                    <TableRow key={`${b.description}-${i}`}>
                      <TableCell className="font-medium">
                        {b.description}
                      </TableCell>
                      <TableCell className="text-right">{b.units}</TableCell>
                      <TableCell className="text-right">
                        {formatDZD(b.revenue, symbol)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="text-primary size-4" />{" "}
              {t("reports.outstandingBalances")}
            </CardTitle>
            <CardDescription>
              {t("reports.outstandingAllTimeDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!outstanding?.length ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                {t("reports.noOutstanding")}
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.patient")}</TableHead>
                      <TableHead className="text-right">
                        {t("reports.invoices")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("reports.owed")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outstanding.map((o) => (
                      <TableRow key={o.patient_id ?? "walkin"}>
                        <TableCell className="font-medium">
                          {o.patient_id != null ? (
                            <Link
                              to={`/patients/${o.patient_id}`}
                              className="hover:underline"
                            >
                              {o.patient_name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">
                              {t("reports.walkIn")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {o.sales_count}
                        </TableCell>
                        <TableCell className="text-warning text-right font-semibold tabular-nums">
                          {formatDZD(o.outstanding, symbol)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-3 flex justify-between border-t pt-3 font-semibold">
                  <span>{t("reports.totalOutstanding")}</span>
                  <span>{formatDZD(totalOutstanding, symbol)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
