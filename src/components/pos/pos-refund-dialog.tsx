import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCartStore } from "@/store/use-cart-store";
import { useCreateReturn } from "@/hooks/use-returns";
import { notifyError } from "@/lib/errors";
import { formatDZD } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReturnMethod } from "@/db/returns";

/**
 * Confirmation step for a POS return-mode refund: method (cash refund vs
 * reduce balance) and an optional note. The Rust `create_return` command is
 * authoritative for caps and the exact amount.
 */
export function PosRefundDialog({
  open,
  onOpenChange,
  symbol,
  refundEstimate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbol?: string;
  refundEstimate: number;
}) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<ReturnMethod>("refund");
  const [notes, setNotes] = useState("");
  const create = useCreateReturn();

  async function handleConfirm() {
    const s = useCartStore.getState();
    if (s.returnSaleId == null || !s.lines.length) return;
    try {
      await create.mutateAsync({
        sale_id: s.returnSaleId,
        method,
        notes: notes.trim() || null,
        items: s.lines
          .filter((l) => l.sale_item_id != null)
          .map((l) => ({
            sale_item_id: l.sale_item_id as number,
            quantity: l.quantity,
          })),
      });
      toast.success(t("return.refundRecorded"));
      s.clear();
      onOpenChange(false);
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("return.title")}</DialogTitle>
          <DialogDescription>{t("return.desc")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <span className="text-sm font-medium">{t("pos.refundTotal")}</span>
          <span className="text-lg font-semibold tabular-nums">
            {formatDZD(refundEstimate, symbol)}
          </span>
        </div>

        <div className="grid gap-1.5">
          <Label>{t("return.method")}</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["refund", "balance"] as ReturnMethod[]).map((m) => (
              <Button
                key={m}
                type="button"
                variant="outline"
                className={cn(
                  "h-auto flex-col items-start gap-0.5 py-2 text-start",
                  method === m && "border-primary ring-primary/40 ring-2",
                )}
                onClick={() => setMethod(m)}
              >
                <span className="font-medium">{t(`return.method_${m}`)}</span>
                <span className="text-muted-foreground text-xs font-normal">
                  {t(`return.method_${m}_hint`)}
                </span>
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="pos_refund_notes">{t("common.notes")}</Label>
          <Textarea
            id="pos_refund_notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("return.notesPlaceholder")}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={create.isPending}
          >
            {t("return.processReturn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
