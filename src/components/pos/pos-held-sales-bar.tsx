import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Clock, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDZD } from "@/lib/format";
import { useHeldSales, useDeleteHeldSale } from "@/hooks/use-held-sales";
import type { HeldSale } from "@/db/held-sales";
import type { CartSnapshot } from "@/store/use-cart-store";

/** Strip of parked carts. Any one can be resumed or deleted on this machine. */
export function PosHeldSalesBar({
  symbol,
  onResume,
}: {
  symbol?: string;
  onResume: (snapshot: CartSnapshot, heldId: number) => void;
}) {
  const { t } = useTranslation();
  const { data: held } = useHeldSales();
  const del = useDeleteHeldSale();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  if (!held || held.length === 0) return null;

  function resume(h: HeldSale) {
    try {
      const snapshot = JSON.parse(h.payload) as CartSnapshot;
      onResume(snapshot, h.id);
    } catch {
      /* corrupt payload — ignore, the chip can be deleted */
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs font-medium">
          <Clock className="size-3.5" /> {t("pos.heldSales")}
        </span>
        {held.map((h) => (
          <div
            key={h.id}
            className="bg-card hover:border-primary/40 flex shrink-0 items-center gap-2 rounded-full border py-1 ps-3 pe-1"
          >
            <button
              type="button"
              onClick={() => resume(h)}
              className="flex items-center gap-2 text-sm"
            >
              <span className="font-medium">
                {h.label || (
                  <span className="inline-flex items-center gap-1">
                    {h.customer_id != null && (
                      <UserRound className="size-3.5" />
                    )}
                    {`#${h.id}`}
                  </span>
                )}
              </span>
              <span className="text-muted-foreground">
                · {h.item_count} · {formatDZD(h.total, symbol)}
              </span>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive size-6 rounded-full"
              aria-label={t("common.delete")}
              onClick={() => setDeleteId(h.id)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <AlertDialog
        open={deleteId != null}
        onOpenChange={(o) => !o && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("pos.confirmDeleteHeldTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("pos.confirmDeleteHeldDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId != null) void del.mutateAsync(deleteId);
                setDeleteId(null);
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
