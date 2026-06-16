import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductsWithExpiry } from "@/hooks/use-inventory";
import { useSettings } from "@/hooks/use-settings";
import { formatDate } from "@/lib/format";
import { daysUntil, expiryStatus, type ExpiryStatus } from "@/lib/expiry";
import type { Product } from "@/types";

const badgeVariant: Record<ExpiryStatus, "destructive" | "secondary" | "outline"> =
  {
    expired: "destructive",
    soon: "secondary",
    ok: "outline",
  };

export default function TrackingProductsPage() {
  const { t } = useTranslation();
  const { data: products, isLoading } = useProductsWithExpiry();
  const { data: settings } = useSettings();
  const warnDays = Number(settings?.expiry_warn_days) || 30;

  const rows = useMemo(
    () =>
      (products ?? []).map((p) => ({
        product: p,
        status: expiryStatus(p.expiry_date as string, warnDays),
        days: daysUntil(p.expiry_date as string),
      })),
    [products, warnDays],
  );

  const counts = useMemo(() => {
    const c = { expired: 0, soon: 0, ok: 0 } as Record<ExpiryStatus, number>;
    rows.forEach((r) => (c[r.status] += 1));
    return c;
  }, [rows]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        {(["expired", "soon", "ok"] as ExpiryStatus[]).map((s) => (
          <Card key={s} className="flex-1 p-4">
            <div className="text-muted-foreground text-xs uppercase tracking-wide">
              {t(`tracking.${s}`)}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {counts[s]}
            </div>
          </Card>
        ))}
      </div>

      <p className="text-muted-foreground text-sm">
        {t("tracking.windowHint", { days: warnDays })}
      </p>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.name")}</TableHead>
              <TableHead>{t("common.brand")}</TableHead>
              <TableHead>{t("inventory.expiryDate")}</TableHead>
              <TableHead className="text-right">{t("inventory.stock")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : !rows.length ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-10 text-center"
                >
                  {t("tracking.noItems")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map(({ product, status, days }) => (
                <ExpiryRow
                  key={product.id}
                  product={product}
                  status={status}
                  days={days}
                />
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function ExpiryRow({
  product,
  status,
  days,
}: {
  product: Product;
  status: ExpiryStatus;
  days: number;
}) {
  const { t } = useTranslation();
  return (
    <TableRow>
      <TableCell className="font-medium">{product.name}</TableCell>
      <TableCell>{product.brand || "—"}</TableCell>
      <TableCell>
        {formatDate(product.expiry_date as string)}
        <span className="text-muted-foreground ms-2 text-xs">
          {days < 0
            ? t("tracking.daysAgo", { days: Math.abs(days) })
            : t("tracking.daysLeft", { days })}
        </span>
      </TableCell>
      <TableCell className="text-right tabular-nums">{product.quantity}</TableCell>
      <TableCell>
        <Badge variant={badgeVariant[status]}>{t(`tracking.${status}`)}</Badge>
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="icon" asChild>
          <Link to={`/inventory/${product.id}/edit`} aria-label={t("common.edit")}>
            <Pencil className="size-4" />
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}
