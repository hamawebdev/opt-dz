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
import { useRecordPayment } from "@/hooks/use-sales";
import { formatDZD, toCentimes, fromCentimes } from "@/lib/format";

interface PaymentDialogProps {
  saleId: number;
  balance: number;
  currencySymbol?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Records an installment payment against a sale. */
export function PaymentDialog({
  saleId,
  balance,
  currencySymbol,
  open,
  onOpenChange,
}: PaymentDialogProps) {
  const { t } = useTranslation();
  // Seeded from props on mount; parent remounts via `key` when reopened.
  // `balance` is centimes; the input is in dinars.
  const [amount, setAmount] = useState(() =>
    balance > 0 ? String(fromCentimes(balance)) : "",
  );
  const [method, setMethod] = useState("");
  const record = useRecordPayment(saleId);

  async function handleSave() {
    const value = toCentimes(amount);
    if (value <= 0) {
      toast.error(t("payment.enterAmountGt0"));
      return;
    }
    try {
      await record.mutateAsync({
        amount: value,
        method: method.trim() || null,
      });
      toast.success(t("payment.paymentRecorded"));
      onOpenChange(false);
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("payment.title")}</DialogTitle>
          <DialogDescription>
            {t("payment.outstandingBalance", {
              amount: formatDZD(balance, currencySymbol),
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="pay_amount">{t("payment.amount")}</Label>
            <Input
              id="pay_amount"
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pay_method2">{t("payment.method")}</Label>
            <Input
              id="pay_method2"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder={t("payment.methodPlaceholder")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={record.isPending}>
            {t("payment.title")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
