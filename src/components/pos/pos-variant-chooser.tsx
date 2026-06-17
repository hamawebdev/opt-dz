import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatDZD } from "@/lib/format";
import { variantLabel, type SellableVariant } from "@/db/variants";
import type { CatalogProduct } from "@/db/catalog";
import { PosStockPill } from "@/components/pos/pos-stock-pill";

interface Props {
  product: CatalogProduct | null;
  variants: SellableVariant[];
  symbol?: string;
  onSelect: (variant: SellableVariant) => void;
  onClose: () => void;
}

/** Large, tappable variant picker shown when a product has multiple variants. */
export function PosVariantChooser({
  product,
  variants,
  symbol,
  onSelect,
  onClose,
}: Props) {
  const { t, i18n } = useTranslation();

  return (
    <Dialog open={product != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{product?.name}</DialogTitle>
          <DialogDescription>{t("pos.chooseVariant")}</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
          {variants.map((v) => {
            const out = v.quantity <= 0;
            const price = v.selling_price ?? v.product_price;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelect(v)}
                className={cn(
                  "bg-card hover:border-primary/50 hover:bg-accent/40 flex flex-col gap-1.5 rounded-xl border p-3 text-start transition",
                  out && "opacity-70",
                )}
              >
                <div className="flex items-center gap-2">
                  {v.color_hex && (
                    <span
                      className="size-4 shrink-0 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: v.color_hex }}
                    />
                  )}
                  <span className="font-medium">
                    {variantLabel(v, i18n.language)}
                  </span>
                </div>
                {v.sku && (
                  <span className="text-muted-foreground text-xs">{v.sku}</span>
                )}
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="font-semibold tabular-nums">
                    {formatDZD(price, symbol)}
                  </span>
                  <PosStockPill stock={v.quantity} minStock={v.min_stock} />
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
