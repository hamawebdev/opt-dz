import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SaleStatusPill } from "@/components/status-pill";
import { useSales } from "@/hooks/use-sales";
import { getSaleItems } from "@/db/sales";
import { getReturnedQuantities } from "@/db/returns";
import { notifyError } from "@/lib/errors";
import { formatDZD, formatDate } from "@/lib/format";
import type { SaleWithPatient } from "@/types";
import type { CartLine } from "@/store/use-cart-store";

/**
 * Picks the original sale a POS return starts from (returns are always
 * sale-linked — the avoir numbering and refund caps live on the sale).
 * On pick, loads the still-returnable lines and hands them to the parent.
 */
export function PosReturnPicker({
  open,
  onOpenChange,
  symbol,
  onStartReturn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbol?: string;
  onStartReturn: (
    sale: SaleWithPatient,
    lines: Omit<CartLine, "key">[],
  ) => void;
}) {
  const { t } = useTranslation();
  const { data: sales } = useSales({});
  const [query, setQuery] = useState("");
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (sales ?? [])
      .filter((s) => s.status !== "void")
      .filter(
        (s) =>
          !q ||
          String(s.id).includes(q.replace(/^#/, "")) ||
          (s.invoice_number ?? "").toLowerCase().includes(q) ||
          (s.patient_name ?? "").toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [sales, query]);

  async function pick(sale: SaleWithPatient) {
    if (loadingId != null) return;
    setLoadingId(sale.id);
    try {
      const [items, returned] = await Promise.all([
        getSaleItems(sale.id),
        getReturnedQuantities(sale.id),
      ]);
      const lines = items.flatMap((it): Omit<CartLine, "key">[] => {
        const max = it.quantity - (returned[it.id] ?? 0);
        if (max <= 0) return [];
        return [
          {
            product_id: it.product_id,
            variant_id: null,
            description: it.description,
            // Per-unit price net of the line discount, so qty × price is the
            // gross refundable amount (sale-level discount/coverage is
            // applied proportionally by the refund summary and by Rust).
            unit_price: Math.round(it.line_total / it.quantity),
            quantity: max,
            item_discount: 0,
            image: null,
            stock_available: null,
            sale_item_id: it.id,
            max_qty: max,
          },
        ];
      });
      if (!lines.length) {
        toast.info(t("return.nothingLeft"));
        return;
      }
      onStartReturn(sale, lines);
      onOpenChange(false);
    } catch (err) {
      notifyError(err, t("problem.loadFailed"));
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("pos.pickSaleTitle")}</DialogTitle>
          <DialogDescription>{t("pos.pickSaleDesc")}</DialogDescription>
        </DialogHeader>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("pos.pickSaleSearch")}
          autoFocus
        />

        <div className="max-h-80 divide-y overflow-y-auto rounded-md border">
          {results.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {t("pos.pickSaleEmpty")}
            </p>
          ) : (
            results.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={loadingId != null}
                onClick={() => pick(s)}
                className="hover:bg-muted/50 flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="font-medium">
                    {s.invoice_number ?? `#${s.id}`}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    · {formatDate(s.sale_date)}
                  </span>
                  <span className="text-muted-foreground block truncate">
                    {s.patient_name ?? t("sales.walkIn")}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-medium tabular-nums">
                    {formatDZD(s.total, symbol)}
                  </span>
                  <SaleStatusPill status={s.status} />
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
