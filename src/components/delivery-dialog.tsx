import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ManageSelect } from "@/components/manage-select";
import { useRecordDelivery } from "@/hooks/use-inventory";
import { useCreateSupplier, useSuppliers } from "@/hooks/use-suppliers";
import { toCentimes, fromCentimes } from "@/lib/format";
import type { Product } from "@/types";

interface DeliveryDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Records a supplier delivery for a product (adds stock + logs a movement). */
export function DeliveryDialog({ product, open, onOpenChange }: DeliveryDialogProps) {
  const { t } = useTranslation();
  // Seeded from props on mount; parent remounts via `key` when the product changes.
  const [quantity, setQuantity] = useState("");
  // `purchase_price` is stored in centimes; the input shows/edits dinars.
  const [purchasePrice, setPurchasePrice] = useState(() =>
    product?.purchase_price ? String(fromCentimes(product.purchase_price)) : "",
  );
  const [note, setNote] = useState("");
  const [supplierId, setSupplierId] = useState<string | null>(
    product?.supplier_id != null ? String(product.supplier_id) : null,
  );
  const record = useRecordDelivery();
  const { data: suppliers } = useSuppliers();
  const createSupplier = useCreateSupplier();

  const supplierOpts = (suppliers ?? []).map((s) => ({
    value: String(s.id),
    label: s.name,
  }));

  async function handleSave() {
    if (!product) return;
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error(t("delivery.enterQtyGt0"));
      return;
    }
    const price = purchasePrice.trim() === "" ? null : toCentimes(purchasePrice);
    // Book the delivery as a debt to the chosen supplier (qty × unit cost).
    const debtAmount = price != null ? price * qty : null;
    try {
      await record.mutateAsync({
        productId: product.id,
        quantity: qty,
        purchasePrice: price,
        note: note.trim() || null,
        supplierId: supplierId ? Number(supplierId) : null,
        debtAmount,
      });
      toast.success(t("delivery.addedToStock", { qty, name: product.name }));
      onOpenChange(false);
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("delivery.title")}</DialogTitle>
          <DialogDescription>
            {product
              ? t("delivery.productSummary", {
                  name: `${product.name}${product.brand ? ` — ${product.brand}` : ""}`,
                  quantity: product.quantity,
                })
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="del_qty">{t("delivery.quantityReceived")}</Label>
            <Input
              id="del_qty"
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="del_price">{t("delivery.purchasePriceOptional")}</Label>
            <Input
              id="del_price"
              type="number"
              min="0"
              step="1"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("inventory.supplier")}</Label>
            <ManageSelect
              options={supplierOpts}
              value={supplierId}
              onChange={setSupplierId}
              onCreate={async (name) =>
                String(await createSupplier.mutateAsync({ name }))
              }
              placeholder={t("inventory.selectSupplier")}
              addLabel={t("inventory.addSupplier")}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="del_note">{t("delivery.note")}</Label>
            <Input
              id="del_note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("delivery.notePlaceholder")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={record.isPending}>
            {t("delivery.addToStock")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
