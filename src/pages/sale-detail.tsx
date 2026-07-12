import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Printer,
  Trash2,
  CreditCard,
  User,
  Receipt,
  RotateCcw,
  Ban,
} from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Empty, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { HelpHint } from "@/components/help-hint";
import { PromptDialog } from "@/components/prompt-dialog";
import { PaymentDialog } from "@/components/payment-dialog";
import { ReturnDialog } from "@/components/return-dialog";
import { useReturnsForSale, useReturnedQuantities } from "@/hooks/use-returns";
import {
  useDeletePayment,
  useVoidSale,
  useSale,
  useSaleItems,
  useSalePayments,
} from "@/hooks/use-sales";
import { useClaimForSale } from "@/hooks/use-claims";
import { useSettings } from "@/hooks/use-settings";
import { commands } from "@/lib/bindings";
import { unwrap } from "@/lib/db";
import { verifyManagerPin } from "@/lib/auth";
import { logAudit } from "@/db/audit";
import { useAppStore, useSimpleMode } from "@/store/use-app-store";
import { buildReceiptLines } from "@/lib/receipt";
import { formatDZD, formatDateTime } from "@/lib/format";
import type { SaleStatus } from "@/types";

const statusVariant: Record<
  SaleStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  paid: "default",
  partial: "secondary",
  unpaid: "destructive",
  void: "outline",
};

export default function SaleDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const saleId = Number(id);
  const navigate = useNavigate();

  const { data: sale, isLoading } = useSale(saleId);
  const { data: items } = useSaleItems(saleId);
  const { data: payments } = useSalePayments(saleId);
  const { data: claim } = useClaimForSale(saleId);
  const { data: returns } = useReturnsForSale(saleId);
  const { data: returnedMap } = useReturnedQuantities(saleId);
  const { data: settings } = useSettings();
  const symbol = settings?.currency_symbol;

  const voidSale = useVoidSale();
  const deletePayment = useDeletePayment(saleId);
  const currentStaffId = useAppStore((s) => s.currentStaffId);
  const currentStaffName = useAppStore((s) => s.currentStaffName);
  const simpleMode = useSimpleMode();

  const [payOpen, setPayOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<number | null>(null);
  const [printing, setPrinting] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

  async function printReceipt() {
    if (!sale || !items || !settings) return;
    if (!settings.receipt_target.trim()) {
      toast.error(t("sales.setPrinterFirst"));
      return;
    }
    setPrinting(true);
    try {
      const lines = buildReceiptLines({ sale, items, settings, claim });
      unwrap(await commands.printReceipt(settings.receipt_target, lines));
      toast.success(t("sales.receiptSent"));
    } catch (err) {
      notifyError(err, t("problem.printFailed"));
    } finally {
      setPrinting(false);
    }
  }

  if (isLoading)
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  if (!sale)
    return (
      <Empty>
        <EmptyTitle>{t("sales.saleNotFound")}</EmptyTitle>
        <EmptyDescription>
          <Link to="/sales" className="underline">
            {t("sales.backToSales")}
          </Link>
        </EmptyDescription>
      </Empty>
    );

  async function handleVoidSale(values: Record<string, string>) {
    // Manager-PIN gate (when configured) before this destructive action.
    if (settings?.manager_pin_hash) {
      const ok = await verifyManagerPin(values.pin ?? "");
      if (!ok) {
        toast.error(t("auth.wrongPin"));
        return;
      }
    }
    try {
      await voidSale.mutateAsync({ id: saleId, reason: values.reason || null });
      void logAudit({
        staffId: currentStaffId,
        staffName: currentStaffName,
        action: "void_sale",
        entity: "sale",
        entityId: saleId,
        detail: values.reason || null,
      });
      toast.success(t("sales.saleVoided"));
    } catch (err) {
      notifyError(err, t("problem.actionFailed"));
    }
  }

  async function handleDeletePayment() {
    if (paymentToDelete == null) return;
    try {
      await deletePayment.mutateAsync(paymentToDelete);
      toast.success(t("sales.paymentRemoved"));
    } catch (err) {
      notifyError(err, t("problem.actionFailed"));
    } finally {
      setPaymentToDelete(null);
    }
  }

  const discountLabel =
    sale.discount_value > 0
      ? sale.discount_type === "percent"
        ? `${sale.discount_value / 100}%`
        : formatDZD(sale.discount_value, symbol)
      : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/sales")}>
          <ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.sales")}
        </Button>
        <div className="flex flex-wrap gap-2">
          {sale.balance > 0 && sale.status !== "void" && (
            <Button onClick={() => setPayOpen(true)}>
              <CreditCard className="size-4" /> {t("sales.recordPayment")}
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link to={`/sales/${saleId}/print`}>
              <Printer className="size-4" /> {t("sales.printInvoice")}
            </Link>
          </Button>
          <Button variant="outline" onClick={printReceipt} disabled={printing}>
            <Receipt className="size-4" /> {t("sales.printReceipt")}
          </Button>
          {!!items?.length && sale.status !== "void" && (
            <Button variant="outline" onClick={() => setReturnOpen(true)}>
              <RotateCcw className="size-4" /> {t("sales.return")}
            </Button>
          )}
          {sale.status !== "void" && (
            <Button variant="outline" onClick={() => setVoidOpen(true)}>
              <Ban className="text-destructive size-4" /> {t("sales.void")}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">
              {t("patients.invoiceLabel", {
                number: sale.invoice_number ?? `#${sale.id}`,
              })}
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              {formatDateTime(sale.sale_date)}
            </p>
          </div>
          <Badge variant={statusVariant[sale.status]}>
            {t(`saleStatus.${sale.status}`)}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {sale.patient_id != null ? (
            <Link
              to={`/patients/${sale.patient_id}`}
              className="flex w-fit items-center gap-2 font-medium hover:underline"
            >
              <User className="text-muted-foreground size-4" />{" "}
              {sale.patient_name}
            </Link>
          ) : (
            <p className="flex w-fit items-center gap-2 font-medium">
              <User className="text-muted-foreground size-4" />{" "}
              {t("sales.walkIn")}
            </p>
          )}
          {sale.notes && (
            <p className="text-muted-foreground pt-2 whitespace-pre-wrap">
              {sale.notes}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sales.items")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.description")}</TableHead>
                <TableHead className="text-right">
                  {t("common.unitPrice")}
                </TableHead>
                <TableHead className="text-right">{t("common.qty")}</TableHead>
                <TableHead className="text-right">
                  {t("common.discount")}
                </TableHead>
                <TableHead className="text-right">
                  {t("common.total")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items?.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>{it.description}</TableCell>
                  <TableCell className="text-right">
                    {formatDZD(it.unit_price, symbol)}
                  </TableCell>
                  <TableCell className="text-right">{it.quantity}</TableCell>
                  <TableCell className="text-right">
                    {formatDZD(it.item_discount, symbol)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatDZD(it.line_total, symbol)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="bg-muted/40 ms-auto mt-5 w-full max-w-xs space-y-2 rounded-xl border p-4 text-sm tabular-nums">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("common.subtotal")}
              </span>
              <span>{formatDZD(sale.subtotal, symbol)}</span>
            </div>
            {discountLabel && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("common.discount")}
                </span>
                <span>−{discountLabel}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2">
              <span className="text-muted-foreground inline-flex items-center gap-1">
                {t("common.totalTtc")}
                <HelpHint text={t("help.ttc")} />
              </span>
              <span>{formatDZD(sale.total, symbol)}</span>
            </div>
            {/* Tax line items are hidden in simple mode, mirroring the sale
                form and POS cart; the amounts stay inside the totals. */}
            {!simpleMode && sale.tax_amount > 0 && (
              <div className="text-muted-foreground flex justify-between text-xs">
                <span className="inline-flex items-center gap-1">
                  {t("common.inclTva")}
                  {sale.tax_rate ? ` (${sale.tax_rate / 100}%)` : ""}
                  <HelpHint text={t("help.tva")} />
                </span>
                <span>{formatDZD(sale.tax_amount, symbol)}</span>
              </div>
            )}
            {!simpleMode && sale.timbre_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  {t("common.droitDeTimbre")}
                  <HelpHint text={t("help.timbre")} />
                </span>
                <span>{formatDZD(sale.timbre_amount, symbol)}</span>
              </div>
            )}
            {!!claim && claim.covered_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("sales.payerCovers", { payer: claim.payer_name })}
                </span>
                <span>−{formatDZD(claim.covered_amount, symbol)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>
                {claim ? t("common.patientTotal") : t("common.grandTotal")}
              </span>
              <span>
                {formatDZD(
                  sale.total +
                    sale.timbre_amount -
                    (claim?.covered_amount ?? 0),
                  symbol,
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("common.paid")}</span>
              <span>{formatDZD(sale.amount_paid, symbol)}</span>
            </div>
            <div
              className={
                "flex justify-between font-semibold " +
                (sale.balance > 0 ? "text-warning" : "text-success")
              }
            >
              <span>{t("common.balance")}</span>
              <span>{formatDZD(sale.balance, symbol)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sales.paymentHistory")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!payments?.length ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              {t("sales.noPayments")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("sales.method")}</TableHead>
                  <TableHead>{t("sales.note")}</TableHead>
                  <TableHead className="text-right">
                    {t("sales.amount")}
                  </TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDateTime(p.paid_at)}</TableCell>
                    <TableCell>{p.method || "—"}</TableCell>
                    <TableCell>{p.note || "—"}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatDZD(p.amount, symbol)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("sales.removePaymentAria")}
                        onClick={() => setPaymentToDelete(p.id)}
                      >
                        <Trash2 className="text-destructive size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!!returns?.length && (
        <Card>
          <CardHeader>
            <CardTitle>{t("sales.returnsCreditNotes")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {returns.map((cn) => (
              <div
                key={cn.id}
                className="flex justify-between border-b pb-2 last:border-0"
              >
                <span>
                  {formatDateTime(cn.created_at)} ·{" "}
                  <span>{t("returnMethod.refund")}</span>
                  {cn.notes ? ` · ${cn.notes}` : ""}
                </span>
                <span className="font-medium">
                  {formatDZD(cn.total, symbol)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <PaymentDialog
        key={payOpen ? "open" : "closed"}
        saleId={saleId}
        balance={sale.balance}
        currencySymbol={symbol}
        open={payOpen}
        onOpenChange={setPayOpen}
      />
      <ReturnDialog
        key={returnOpen ? "ropen" : "rclosed"}
        saleId={saleId}
        items={items ?? []}
        returned={returnedMap ?? {}}
        currencySymbol={symbol}
        open={returnOpen}
        onOpenChange={setReturnOpen}
      />
      <PromptDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title={t("sales.voidSaleTitle")}
        description={t("sales.voidSaleDesc")}
        fields={[
          {
            name: "reason",
            label: t("sales.voidReason"),
            placeholder: t("sales.voidReasonPlaceholder"),
          },
          ...(settings?.manager_pin_hash
            ? [
                {
                  name: "pin",
                  label: t("auth.managerPin"),
                  type: "number" as const,
                  inputMode: "numeric" as const,
                },
              ]
            : []),
        ]}
        confirmText={t("sales.void")}
        onSubmit={handleVoidSale}
      />
      <ConfirmDialog
        open={paymentToDelete != null}
        onOpenChange={(o) => !o && setPaymentToDelete(null)}
        title={t("sales.removePaymentTitle")}
        description={t("sales.removePaymentDesc")}
        confirmText={t("common.remove")}
        onConfirm={handleDeletePayment}
      />
    </div>
  );
}
