import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
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
import { SearchSelect, type SearchOption } from "@/components/search-select";
import { useSales } from "@/hooks/use-sales";
import { usePatients } from "@/hooks/use-patients";
import { useSettings } from "@/hooks/use-settings";
import { SaleStatusPill } from "@/components/status-pill";
import { formatDZD, formatDate } from "@/lib/format";

export default function SalesListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [patientId, setPatientId] = useState<string | null>(null);

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

  const patientOptions: SearchOption[] = useMemo(
    () =>
      (patients ?? []).map((p) => ({
        value: String(p.id),
        label: p.full_name,
        keywords: p.phone ?? "",
      })),
    [patients],
  );

  const hasFilters = from || to || patientId;
  function clearFilters() {
    setFrom("");
    setTo("");
    setPatientId(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="from" className="text-xs">
              {t("common.from")}
            </Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
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
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">{t("common.patient")}</Label>
            <div className="w-56">
              <SearchSelect
                options={patientOptions}
                value={patientId}
                onChange={setPatientId}
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
              <Zap className="size-4" /> {t("nav.pos")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/sales/new">
              <Plus className="size-4" /> {t("sales.newSale")}
            </Link>
          </Button>
        </div>
      </div>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.invoice")}</TableHead>
              <TableHead>{t("common.date")}</TableHead>
              <TableHead>{t("common.patient")}</TableHead>
              <TableHead className="text-right">{t("common.total")}</TableHead>
              <TableHead className="text-right">{t("common.paid")}</TableHead>
              <TableHead className="text-right">
                {t("common.balance")}
              </TableHead>
              <TableHead>{t("common.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : salesQuery.isError ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <ErrorState
                    className="border-0"
                    onRetry={() => salesQuery.refetch()}
                  />
                </TableCell>
              </TableRow>
            ) : !sales?.length ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground py-10 text-center"
                >
                  {t("sales.noSales")}
                </TableCell>
              </TableRow>
            ) : (
              sales.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/sales/${s.id}`)}
                >
                  <TableCell className="font-medium">#{s.id}</TableCell>
                  <TableCell>{formatDate(s.sale_date)}</TableCell>
                  <TableCell>{s.patient_name ?? t("sales.walkIn")}</TableCell>
                  <TableCell className="text-right">
                    {formatDZD(s.total, symbol)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatDZD(s.amount_paid, symbol)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatDZD(s.balance, symbol)}
                  </TableCell>
                  <TableCell>
                    <SaleStatusPill status={s.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
