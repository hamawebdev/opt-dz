import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "@/components/color-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useVariants,
  useCreateVariant,
  useUpdateVariant,
  useDeleteVariant,
  useAdjustVariantStock,
} from "@/hooks/use-variants";
import { toCentimes, fromCentimes } from "@/lib/format";
import type { ProductVariant } from "@/types";

export function ProductVariantsEditor({ productId }: { productId: number }) {
  const { t } = useTranslation();
  const { data: variants } = useVariants(productId);
  const create = useCreateVariant();

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">{t("variants.title")}</h3>
          <p className="text-muted-foreground text-xs">{t("variants.hint")}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            create.mutate({
              productId,
              input: { quantity: 0, min_stock: 0 },
            })
          }
        >
          <Plus className="size-4" /> {t("variants.add")}
        </Button>
      </div>

      {!variants?.length ? (
        <p className="text-muted-foreground py-2 text-sm">
          {t("variants.none")}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("variants.color")}</TableHead>
              <TableHead>{t("variants.size")}</TableHead>
              <TableHead>{t("variants.barcode")}</TableHead>
              <TableHead className="text-right">
                {t("inventory.stock")}
              </TableHead>
              <TableHead className="text-right">
                {t("variants.priceOverride")}
              </TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((v) => (
              <VariantRow key={v.id} variant={v} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function VariantRow({ variant }: { variant: ProductVariant }) {
  const { t } = useTranslation();
  const update = useUpdateVariant();
  const adjust = useAdjustVariantStock();
  const del = useDeleteVariant();
  const [colorId, setColorId] = useState<number | null>(
    variant.color_id ?? null,
  );
  const [size, setSize] = useState(variant.size ?? "");
  const [barcode, setBarcode] = useState(variant.barcode ?? "");
  const [qty, setQty] = useState(String(variant.quantity));
  const [price, setPrice] = useState(
    variant.selling_price != null
      ? String(fromCentimes(variant.selling_price))
      : "",
  );

  async function save() {
    try {
      // Descriptive fields go through updateVariant; the stock change is applied
      // separately as a logged adjustment so the variant ledger stays the source of truth.
      const newQty = Math.max(0, Math.floor(Number(qty) || 0));
      const delta = newQty - variant.quantity;
      await update.mutateAsync({
        id: variant.id,
        input: {
          color_id: colorId,
          size: size || null,
          barcode: barcode || null,
          quantity: newQty, // ignored by updateVariant; kept for type compatibility
          min_stock: variant.min_stock,
          selling_price: price.trim() === "" ? null : toCentimes(price),
        },
      });
      if (delta !== 0) {
        await adjust.mutateAsync({
          productId: variant.product_id,
          variantId: variant.id,
          quantityChange: delta,
          note: t("variants.manualCorrection"),
        });
      }
      toast.success(t("variants.saved"));
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  return (
    <TableRow>
      <TableCell>
        <ColorPicker value={colorId} onChange={setColorId} className="h-8" />
      </TableCell>
      <TableCell>
        <Input
          value={size}
          onChange={(e) => setSize(e.target.value)}
          className="h-8 w-20"
        />
      </TableCell>
      <TableCell>
        <Input
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min="0"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="h-8 w-20 text-right"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="h-8 w-24 text-right"
        />
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={save}
            disabled={update.isPending}
          >
            <Save className="size-4" /> {t("variants.save")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => del.mutate(variant.id)}
          >
            <Trash2 className="size-4" /> {t("variants.delete")}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
