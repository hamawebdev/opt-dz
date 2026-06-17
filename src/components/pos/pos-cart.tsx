import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShoppingCart, PauseCircle, Trash2, CreditCard } from "lucide-react";
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
import { useCartStore } from "@/store/use-cart-store";
import { PosCustomerBar } from "@/components/pos/pos-customer-bar";
import { PosCartLine } from "@/components/pos/pos-cart-line";
import { PosCartSummary } from "@/components/pos/pos-cart-summary";
import type { PosTotals } from "@/lib/pos-totals";

export function PosCart({
  totals,
  symbol,
  simpleMode,
  onHold,
  onPay,
}: {
  totals: PosTotals;
  symbol?: string;
  simpleMode: boolean;
  onHold: () => void;
  onPay: () => void;
}) {
  const { t } = useTranslation();
  const lines = useCartStore((s) => s.lines);
  const clear = useCartStore((s) => s.clear);
  const [confirmClear, setConfirmClear] = useState(false);
  const empty = lines.length === 0;

  return (
    <div className="bg-card flex h-full min-h-0 flex-col rounded-xl border">
      {/* ── Fixed header ── */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b p-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShoppingCart className="size-4" /> {t("pos.cart")}
        </h2>
        <span className="text-muted-foreground text-sm">
          {totals.itemCount} {t("pos.items")}
        </span>
      </div>

      {/* ── Scrollable region: customer bar + items + summary ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b p-3">
          <PosCustomerBar />
        </div>

        <div className="px-3">
          {empty ? (
            <p className="text-muted-foreground py-16 text-center text-sm">
              {t("pos.emptyCart")}
            </p>
          ) : (
            lines.map((l) => <PosCartLine key={l.key} line={l} symbol={symbol} />)
          )}
        </div>

        {!empty && (
          <div className="border-t p-3">
            <PosCartSummary
              totals={totals}
              symbol={symbol}
              simpleMode={simpleMode}
            />
          </div>
        )}
      </div>

      {/* ── Fixed bottom actions ── */}
      <div className="shrink-0 space-y-2 border-t p-3">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-11"
            disabled={empty}
            onClick={onHold}
          >
            <PauseCircle className="size-4" /> {t("pos.hold")}
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive h-11"
            disabled={empty}
            onClick={() => setConfirmClear(true)}
          >
            <Trash2 className="size-4" /> {t("pos.clearAll")}
          </Button>
        </div>
        <Button
          className="h-14 w-full text-lg"
          disabled={empty}
          onClick={onPay}
        >
          <CreditCard className="size-5" /> {t("pos.pay")}
        </Button>
      </div>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pos.confirmClearTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("pos.confirmClearDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clear();
                setConfirmClear(false);
              }}
            >
              {t("pos.clearAll")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
