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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCreateReturn } from "@/hooks/use-returns";
import { formatDZD } from "@/lib/format";
import type { SaleItem } from "@/types";

interface ReturnDialogProps {
  saleId: number;
  items: SaleItem[];
  returned: Record<number, number>;
  currencySymbol?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReturnDialog({
  saleId,
  items,
  returned,
  currencySymbol,
  open,
  onOpenChange,
}: ReturnDialogProps) {
  const { t } = useTranslation();
  const [qty, setQty] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState("");
  const create = useCreateReturn();

  function maxFor(it: SaleItem) {
    return it.quantity - (returned[it.id] ?? 0);
  }

  async function handleSave() {
    const toReturn = items
      .map((it) => ({ sale_item_id: it.id, quantity: Math.floor(Number(qty[it.id] ?? "0")) }))
      .filter((r) => r.quantity > 0);
    if (!toReturn.length) {
      toast.error(t("return.enterQty"));
      return;
    }
    for (const it of items) {
      const want = Math.floor(Number(qty[it.id] ?? "0"));
      if (want > maxFor(it)) {
        toast.error(t("return.cannotReturnMore", { max: maxFor(it), description: it.description }));
        return;
      }
    }
    try {
      await create.mutateAsync({ sale_id: saleId, method: "refund", notes: notes.trim() || null, items: toReturn });
      toast.success(t("return.refundRecorded"));
      onOpenChange(false);
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("return.title")}</DialogTitle>
          <DialogDescription>{t("return.desc")}</DialogDescription>
        </DialogHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("return.item")}</TableHead>
              <TableHead className="text-right">{t("return.sold")}</TableHead>
              <TableHead className="text-right">{t("return.returnable")}</TableHead>
              <TableHead className="w-24 text-right">{t("return.returnCol")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => {
              const max = maxFor(it);
              return (
                <TableRow key={it.id}>
                  <TableCell className="font-medium">
                    {it.description}
                    <div className="text-muted-foreground text-xs">
                      {formatDZD(it.line_total, currencySymbol)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{it.quantity}</TableCell>
                  <TableCell className="text-right">{max}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      max={max}
                      className="h-8 text-right"
                      value={qty[it.id] ?? ""}
                      disabled={max <= 0}
                      onChange={(e) => setQty((p) => ({ ...p, [it.id]: e.target.value }))}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <div className="grid gap-1.5">
          <Label htmlFor="return_notes">{t("common.notes")}</Label>
          <Textarea
            id="return_notes"
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
          <Button onClick={handleSave} disabled={create.isPending}>
            {t("return.processReturn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
