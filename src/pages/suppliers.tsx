import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Archive, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useSuppliers,
  useSupplierBalances,
  useCreateSupplier,
  useUpdateSupplier,
  useSetSupplierArchived,
  useSupplierLedger,
  useRecordSupplierPayment,
} from "@/hooks/use-suppliers";
import { useSettings } from "@/hooks/use-settings";
import { formatDZD, formatDate, toCentimes } from "@/lib/format";
import type { SupplierInput } from "@/db/suppliers";
import type { Supplier } from "@/types";

export default function SuppliersPage() {
  const { t } = useTranslation();
  const { data: suppliers } = useSuppliers();
  const { data: balances } = useSupplierBalances();
  const { data: settings } = useSettings();
  const symbol = settings?.currency_symbol;
  const setArchived = useSetSupplierArchived();

  const [editing, setEditing] = useState<Supplier | null>(null);
  const [creating, setCreating] = useState(false);
  const [ledgerFor, setLedgerFor] = useState<Supplier | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("suppliers.title")}</h2>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" /> {t("suppliers.new")}
        </Button>
      </div>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("suppliers.name")}</TableHead>
              <TableHead>{t("suppliers.phone")}</TableHead>
              <TableHead className="text-right">
                {t("suppliers.balance")}
              </TableHead>
              <TableHead className="text-right">
                {t("common.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!suppliers?.length ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-muted-foreground py-10 text-center"
                >
                  {t("suppliers.noSuppliers")}
                </TableCell>
              </TableRow>
            ) : (
              suppliers.map((s) => {
                const bal = balances?.[s.id] ?? 0;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.phone || "—"}</TableCell>
                    <TableCell className="text-right">
                      {bal > 0 ? (
                        <Badge variant="secondary">
                          {formatDZD(bal, symbol)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">
                          {t("suppliers.settled")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLedgerFor(s)}
                        >
                          <BookOpen className="size-4" />{" "}
                          {t("suppliers.viewLedger")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(s)}
                        >
                          <Pencil className="size-4" /> {t("common.edit")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            await setArchived.mutateAsync({
                              id: s.id,
                              archived: true,
                            });
                            toast.success(t("common.archived"));
                          }}
                        >
                          <Archive className="size-4" /> {t("common.archive")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {(creating || editing) && (
        <SupplierFormDialog
          supplier={editing}
          open={creating || editing != null}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
      {ledgerFor && (
        <LedgerDialog
          supplier={ledgerFor}
          symbol={symbol}
          open={ledgerFor != null}
          onClose={() => setLedgerFor(null)}
        />
      )}
    </div>
  );
}

function SupplierFormDialog({
  supplier,
  open,
  onClose,
}: {
  supplier: Supplier | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const [form, setForm] = useState<SupplierInput>({
    name: supplier?.name ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    address: supplier?.address ?? "",
    notes: supplier?.notes ?? "",
  });

  const set = (k: keyof SupplierInput, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!form.name.trim()) return;
    try {
      if (supplier) {
        await update.mutateAsync({ id: supplier.id, input: form });
        toast.success(t("suppliers.updated"));
      } else {
        await create.mutateAsync(form);
        toast.success(t("suppliers.created"));
      }
      onClose();
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {supplier ? t("suppliers.edit") : t("suppliers.new")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="s_name">{t("suppliers.name")}</Label>
            <Input
              id="s_name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="s_phone">{t("suppliers.phone")}</Label>
              <Input
                id="s_phone"
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s_email">{t("suppliers.email")}</Label>
              <Input
                id="s_email"
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="s_addr">{t("suppliers.address")}</Label>
            <Input
              id="s_addr"
              value={form.address ?? ""}
              onChange={(e) => set("address", e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="s_notes">{t("suppliers.notes")}</Label>
            <Textarea
              id="s_notes"
              rows={2}
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={save}
            disabled={create.isPending || update.isPending}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LedgerDialog({
  supplier,
  symbol,
  open,
  onClose,
}: {
  supplier: Supplier;
  symbol?: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data } = useSupplierLedger(supplier.id);
  const recordPay = useRecordSupplierPayment();
  const [pay, setPay] = useState("");

  async function submitPayment() {
    const amount = toCentimes(pay);
    if (amount <= 0) return;
    try {
      await recordPay.mutateAsync({ supplierId: supplier.id, amount });
      setPay("");
      toast.success(t("suppliers.paymentRecorded"));
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {supplier.name} — {t("suppliers.ledger")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <span className="text-muted-foreground text-sm">
            {t("suppliers.balance")}
          </span>
          <span className="text-lg font-semibold">
            {formatDZD(data?.balance ?? 0, symbol)}
          </span>
        </div>

        <div className="flex items-end gap-2">
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="s_pay">{t("suppliers.paymentAmount")}</Label>
            <Input
              id="s_pay"
              type="number"
              min="0"
              value={pay}
              onChange={(e) => setPay(e.target.value)}
            />
          </div>
          <Button onClick={submitPayment} disabled={recordPay.isPending}>
            {t("suppliers.recordPayment")}
          </Button>
        </div>

        <div className="max-h-72 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("suppliers.date")}</TableHead>
                <TableHead>{t("suppliers.entryType")}</TableHead>
                <TableHead>{t("suppliers.note")}</TableHead>
                <TableHead className="text-right">
                  {t("suppliers.amount")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data?.entries.length ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-muted-foreground py-6 text-center"
                  >
                    {t("suppliers.noEntries")}
                  </TableCell>
                </TableRow>
              ) : (
                data.entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{formatDate(e.created_at)}</TableCell>
                    <TableCell>{t(`suppliers.type${cap(e.type)}`)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.note || e.ref || "—"}
                    </TableCell>
                    <TableCell
                      className={
                        "text-right tabular-nums " +
                        (e.amount < 0 ? "text-success" : "")
                      }
                    >
                      {formatDZD(e.amount, symbol)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
