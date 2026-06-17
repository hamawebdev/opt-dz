import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CreditCard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { formatDZD, fromCentimes, toCentimes } from "@/lib/format";
import { useCartStore } from "@/store/use-cart-store";
import type { PosTotals } from "@/lib/pos-totals";

const PAYMENT_METHODS = ["cash", "card", "cheque", "transfer"] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totals: PosTotals;
  symbol?: string;
  submitting: boolean;
  onConfirm: (amountPaid: number) => void;
}

export function PosPayDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        {/* Body mounts fresh each open (Radix unmounts closed content), so the
            amount-received field can default to the exact total via useState. */}
        {props.open && <PayBody {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function PayBody({
  totals,
  symbol,
  submitting,
  onOpenChange,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const paymentMethod = useCartStore((s) => s.paymentMethod);
  const setPaymentMethod = useCartStore((s) => s.setPaymentMethod);
  const [received, setReceived] = useState(
    String(fromCentimes(totals.grandTotal)),
  );

  const receivedCentimes = toCentimes(received);
  const paid = Math.min(receivedCentimes, totals.grandTotal);
  const change = Math.max(0, receivedCentimes - totals.grandTotal);
  const balance = Math.max(0, totals.grandTotal - paid);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CreditCard className="size-5" /> {t("pos.payTitle")}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        <div className="bg-muted/50 flex items-center justify-between rounded-lg px-3 py-2 text-lg font-semibold tabular-nums">
          <span>{t("common.grandTotal")}</span>
          <span>{formatDZD(totals.grandTotal, symbol)}</span>
        </div>

        <div className="space-y-1.5">
          <Label>{t("sales.paymentMethod")}</Label>
          <NativeSelect
            className="w-full"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          >
            {PAYMENT_METHODS.map((m) => (
              <NativeSelectOption key={m} value={m}>
                {t(`paymentMethod.${m}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label>{t("pos.amountReceived")}</Label>
          <Input
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            inputMode="decimal"
            className="h-11 text-end text-lg"
            autoFocus
          />
        </div>

        <div className="space-y-1 text-sm tabular-nums">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("pos.change")}</span>
            <span className="font-medium">{formatDZD(change, symbol)}</span>
          </div>
          <div
            className={`flex justify-between font-medium ${balance > 0 ? "text-warning" : "text-success"}`}
          >
            <span>{t("common.balanceDue")}</span>
            <span>{formatDZD(balance, symbol)}</span>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={submitting}
        >
          {t("common.cancel")}
        </Button>
        <Button onClick={() => onConfirm(paid)} disabled={submitting}>
          {t("pos.completeSale")}
        </Button>
      </DialogFooter>
    </>
  );
}
