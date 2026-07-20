import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Scale } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { HelpHint } from "@/components/help-hint";
import { useProfitAndLoss } from "@/hooks/use-expenses";
import { useSettings } from "@/hooks/use-settings";
import { formatDZD } from "@/lib/format";
import { cn } from "@/lib/utils";

/** One line of the statement. `emphasis` marks the three subtotal rows. */
function Row({
  label,
  hint,
  amount,
  symbol,
  sign = "neutral",
  emphasis = false,
  indent = false,
}: {
  label: string;
  hint?: string;
  amount: number;
  symbol: string;
  sign?: "neutral" | "minus";
  emphasis?: boolean;
  indent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-1.5",
        emphasis && "border-t font-semibold",
        indent && "ps-4",
      )}
    >
      <span className={cn("text-sm", !emphasis && "text-muted-foreground")}>
        {label}
        {hint ? <HelpHint text={hint} /> : null}
      </span>
      <span className="font-mono text-sm tabular-nums">
        {sign === "minus" && amount !== 0 ? "−" : ""}
        {formatDZD(Math.abs(amount), symbol)}
      </span>
    </div>
  );
}

/**
 * Profit & loss for the selected period, stated **HT** (excluding TVA).
 *
 *     revenue HT − cost of goods = gross margin − expenses = net profit
 *
 * TVA and droit de timbre are excluded because both are collected on behalf of
 * the state; treating them as income would overstate profit. Staff recognise
 * the TTC figure from the invoices they issue, so the TTC→HT reconciliation is
 * shown explicitly rather than leaving the difference unexplained.
 *
 * Stock purchases are shown but **not** deducted: buying inventory converts
 * cash into an asset, and its cost reaches the P&L as cost of goods once it
 * sells. Deducting both would count the same money twice.
 */
export function ProfitLossCard({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const symbol = settings?.currency_symbol ?? "DA";
  const { data, isLoading, isError } = useProfitAndLoss(from, to);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="size-4" />
          {t("reports.pnlTitle")}
        </CardTitle>
        <CardDescription>{t("reports.pnlSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : isError || !data ? (
          <p className="text-sm text-muted-foreground">{t("reports.pnlUnavailable")}</p>
        ) : (
          <div className="flex flex-col">
            {/* TTC -> HT reconciliation, so the figures tie back to the invoices. */}
            <Row label={t("reports.pnlRevenueTtc")} amount={data.revenueTtc} symbol={symbol} />
            <Row label={t("reports.pnlTva")} amount={data.tva} symbol={symbol} sign="minus" indent />
            {data.timbre > 0 ? (
              <Row
                label={t("reports.pnlTimbre")}
                hint={t("reports.pnlTimbreHint")}
                amount={data.timbre}
                symbol={symbol}
                indent
              />
            ) : null}
            <Row
              label={t("reports.pnlRevenueHt")}
              hint={t("reports.pnlRevenueHtHint")}
              amount={data.revenueHt}
              symbol={symbol}
              emphasis
            />

            <Row label={t("reports.pnlCogs")} hint={t("reports.pnlCogsHint")} amount={data.cogs} symbol={symbol} sign="minus" />
            <Row label={t("reports.pnlGrossMargin")} amount={data.grossMargin} symbol={symbol} emphasis />

            {data.expenseLines.map((line) => (
              <Row
                key={line.category}
                label={t(`expenses.category.${line.category}`)}
                amount={line.amount}
                symbol={symbol}
                sign="minus"
                indent
              />
            ))}
            <Row label={t("reports.pnlExpenses")} amount={data.expenses} symbol={symbol} sign="minus" />

            <div
              className={cn(
                "mt-1 flex items-baseline justify-between gap-4 border-t-2 py-2 text-base font-bold",
                data.netProfit < 0 && "text-destructive",
              )}
            >
              <span>{t("reports.pnlNetProfit")}</span>
              <span className="font-mono tabular-nums">
                {formatDZD(data.netProfit, symbol)}
              </span>
            </div>

            <div className="mt-4 flex flex-col gap-1 border-t pt-3">
              <p className="text-xs text-muted-foreground">{t("reports.pnlContextTitle")}</p>
              <Row
                label={t("reports.pnlStockPurchased")}
                hint={t("reports.pnlStockPurchasedHint")}
                amount={data.stockPurchased}
                symbol={symbol}
              />
              <Row
                label={t("reports.pnlCollected")}
                hint={t("reports.pnlCollectedHint")}
                amount={data.collected}
                symbol={symbol}
              />
            </div>

            {data.expenses === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {t("reports.pnlNoExpenses")}{" "}
                <Link to="/expenses" className="underline">
                  {t("expenses.title")}
                </Link>
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
