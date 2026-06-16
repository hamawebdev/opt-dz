import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TrendingUp, Trophy, Wallet, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useBestSellers,
  useOutstandingBalances,
  useRevenueInRange,
  useTaxInRange,
} from "@/hooks/use-reports";
import { useSettings } from "@/hooks/use-settings";
import { formatDZD } from "@/lib/format";

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
const today = () => new Date().toISOString().slice(0, 10);

export default function ReportsPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());

  const { data: revenue } = useRevenueInRange(from, to);
  const { data: tax } = useTaxInRange(from, to);
  const { data: bestSellers } = useBestSellers(from, to, 10);
  const { data: outstanding } = useOutstandingBalances();
  const { data: settings } = useSettings();
  const symbol = settings?.currency_symbol;

  const totalOutstanding =
    outstanding?.reduce((s, r) => s + r.outstanding, 0) ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>{t("reports.reportPeriod")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="r_from" className="text-xs">
              {t("common.from")}
            </Label>
            <Input
              id="r_from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-44"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="r_to" className="text-xs">
              {t("common.to")}
            </Label>
            <Input
              id="r_to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-44"
            />
          </div>
          <div className="ms-auto flex flex-wrap items-center gap-3">
            <div className="bg-muted/40 flex items-center gap-3.5 rounded-xl border p-4">
              <div className="bg-primary/10 text-primary ring-primary/15 flex size-11 shrink-0 items-center justify-center rounded-xl ring-1">
                <TrendingUp className="size-5" />
              </div>
              <div>
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  {t("reports.revenueInPeriod")}
                </p>
                <p className="text-2xl font-semibold tracking-tight tabular-nums">
                  {formatDZD(revenue, symbol)}
                </p>
              </div>
            </div>
            <div className="bg-muted/40 flex items-center gap-3.5 rounded-xl border p-4">
              <div className="bg-primary/10 text-primary ring-primary/15 flex size-11 shrink-0 items-center justify-center rounded-xl ring-1">
                <Receipt className="size-5" />
              </div>
              <div>
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  {t("reports.tvaCollected")}
                </p>
                <p className="text-2xl font-semibold tracking-tight tabular-nums">
                  {formatDZD(tax?.tva, symbol)}
                </p>
                {!!tax?.timbre && (
                  <p className="text-muted-foreground text-xs">
                    {t("reports.timbrePlus", {
                      amount: formatDZD(tax.timbre, symbol),
                    })}
                  </p>
                )}
              </div>
            </div>
          </div>
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
                      <TableRow key={o.patient_id}>
                        <TableCell className="font-medium">
                          <Link
                            to={`/patients/${o.patient_id}`}
                            className="hover:underline"
                          >
                            {o.patient_name}
                          </Link>
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
