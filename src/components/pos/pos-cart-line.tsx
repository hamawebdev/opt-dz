import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus, Trash2, ImageOff, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDZD, fromCentimes, toCentimes } from "@/lib/format";
import { useCartStore, type CartLine } from "@/store/use-cart-store";

/** One editable line in the POS cart: qty stepper, price override, per-line discount. */
export function PosCartLine({
  line,
  symbol,
}: {
  line: CartLine;
  symbol?: string;
}) {
  const { t } = useTranslation();
  const changeQuantity = useCartStore((s) => s.changeQuantity);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const setUnitPrice = useCartStore((s) => s.setUnitPrice);
  const setLineDiscount = useCartStore((s) => s.setLineDiscount);
  const removeLine = useCartStore((s) => s.removeLine);

  const [price, setPrice] = useState(String(fromCentimes(line.unit_price)));
  const [discount, setDiscount] = useState(
    line.item_discount ? String(fromCentimes(line.item_discount)) : "",
  );

  const subtotal = Math.max(
    0,
    line.unit_price * line.quantity - line.item_discount,
  );
  const overSell =
    line.stock_available != null && line.quantity > line.stock_available;

  return (
    <div className="flex gap-2.5 border-b py-2.5 last:border-b-0">
      {line.image ? (
        <img
          src={line.image}
          alt=""
          className="size-12 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-lg">
          <ImageOff className="size-5 opacity-40" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm leading-snug font-medium truncate">{line.description}</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive size-7 shrink-0"
            aria-label={t("pos.removeItem")}
            onClick={() => removeLine(line.key)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>

        {overSell && (
          <p className="text-warning mt-0.5 flex items-center gap-1 text-xs">
            <AlertTriangle className="size-3.5" />
            {t("pos.outOfStockWarn", { name: line.description })}
          </p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {/* Quantity stepper */}
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9"
              aria-label="-"
              onClick={() => changeQuantity(line.key, -1)}
            >
              <Minus className="size-4" />
            </Button>
            <Input
              value={line.quantity}
              onChange={(e) =>
                setQuantity(line.key, Number(e.target.value) || 1)
              }
              inputMode="numeric"
              className="h-9 w-10 min-w-[2.25rem] px-1 text-center"
              aria-label={t("common.qty")}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9"
              aria-label="+"
              onClick={() => changeQuantity(line.key, 1)}
            >
              <Plus className="size-4" />
            </Button>
          </div>

          {/* Unit price (override) */}
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground text-xs">
              {t("common.unitPrice")}
            </span>
            <Input
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setUnitPrice(line.key, toCentimes(e.target.value));
              }}
              inputMode="decimal"
              className="h-9 w-16 min-w-[3rem] text-end"
            />
          </label>

          {/* Per-line discount */}
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground text-xs">
              {t("pos.discount")}
            </span>
            <Input
              value={discount}
              onChange={(e) => {
                setDiscount(e.target.value);
                setLineDiscount(line.key, toCentimes(e.target.value));
              }}
              inputMode="decimal"
              placeholder="0"
              className="h-9 w-14 min-w-[2.5rem] text-end"
            />
          </label>

          <span className={cn("ms-auto font-semibold tabular-nums")}>
            {formatDZD(subtotal, symbol)}
          </span>
        </div>
      </div>
    </div>
  );
}
