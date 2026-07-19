import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Plus, Minus, X, Tags } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/errors";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSellableVariants } from "@/hooks/use-variants";
import { productKeys } from "@/hooks/use-inventory";
import { variantLabel, type SellableVariant } from "@/db/variants";
import { generateUniqueEan13, setVariantBarcode } from "@/db/labels";
import type { LabelItem } from "@/lib/label-render";
import { useLabelDesignerStore } from "@/store/use-label-designer-store";

export function ArticlesTab() {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const qc = useQueryClient();

  const { data: variants } = useSellableVariants();

  const basket = useLabelDesignerStore((s) => s.basket);
  const previewIndex = useLabelDesignerStore((s) => s.previewIndex);
  const addBasketItem = useLabelDesignerStore((s) => s.addBasketItem);
  const removeBasketItem = useLabelDesignerStore((s) => s.removeBasketItem);
  const setQty = useLabelDesignerStore((s) => s.setQty);
  const setPreviewIndex = useLabelDesignerStore((s) => s.setPreviewIndex);

  const inBasket = useMemo(() => new Set(basket.map((b) => b.key)), [basket]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !variants) return [];
    return variants
      .filter((v) =>
        [v.product_name, v.sku, v.barcode, variantLabel(v, i18n.language)]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q)),
      )
      .slice(0, 20);
  }, [query, variants, i18n.language]);

  async function add(v: SellableVariant) {
    try {
      let code = v.barcode || v.sku || "";
      if (!code) {
        // Same rule as seeding: a label must be scannable, so allocate and
        // persist a barcode for code-less variants on the spot.
        code = await generateUniqueEan13(v.id);
        await setVariantBarcode(v.id, code);
        qc.invalidateQueries({ queryKey: productKeys.all });
        qc.invalidateQueries({ queryKey: ["sellable-variants"] });
      }
      const item: LabelItem = {
        key: `v${v.id}`,
        productId: v.product_id,
        variantId: v.id,
        name: v.product_name,
        characteristics: variantLabel(v, i18n.language),
        priceCents: v.selling_price ?? v.product_price,
        code,
        reference: v.sku ?? "",
        qty: 1,
      };
      addBasketItem(item);
    } catch (err) {
      notifyError(err, t("problem.actionFailed"));
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="relative">
        <Search className="text-muted-foreground absolute start-3 top-1/2 size-4 -translate-y-1/2" />
        <Input
          className="ps-9"
          placeholder={t("labelDesigner.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {results.length > 0 && (
        <div className="max-h-44 overflow-auto rounded-md border">
          {results.map((v) => (
            <button
              key={v.id}
              type="button"
              disabled={inBasket.has(`v${v.id}`)}
              onClick={() => add(v)}
              className="hover:bg-accent flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm disabled:opacity-40"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {v.product_name}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {[variantLabel(v, i18n.language), v.barcode]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <Plus className="size-4 shrink-0" />
            </button>
          ))}
        </div>
      )}

      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span className="font-semibold tracking-wide uppercase">
          {t("labelDesigner.basket")}
        </span>
        <span>{t("labelDesigner.basketCount", { count: basket.length })}</span>
      </div>

      <ScrollArea className="min-h-0 flex-1 rounded-md border">
        {basket.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 p-8 text-center text-sm">
            <Tags className="size-7" />
            {t("labelDesigner.basketEmpty")}
          </div>
        ) : (
          <ul className="divide-y">
            {basket.map((item, i) => (
              <li
                key={item.key}
                onClick={() => setPreviewIndex(i)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-3 py-2",
                  i === previewIndex && "bg-accent/60",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {item.name}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {[item.characteristics, item.code]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <div
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t("labelDesigner.fewer")}
                    onClick={() => setQty(item.key, item.qty - 1)}
                  >
                    <Minus />
                  </Button>
                  <span className="w-7 text-center text-sm tabular-nums">
                    {item.qty}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t("labelDesigner.more")}
                    onClick={() => setQty(item.key, item.qty + 1)}
                  >
                    <Plus />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("labelDesigner.removeItem")}
                    onClick={() => removeBasketItem(item.key)}
                  >
                    <X />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
