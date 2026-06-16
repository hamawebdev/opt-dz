import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePayers, useCreatePayer, useDeletePayer } from "@/hooks/use-payers";
import {
  useClaims,
  useUpdateClaimStatus,
  useRecordClaimPayment,
} from "@/hooks/use-claims";
import { useSettings } from "@/hooks/use-settings";
import { PromptDialog } from "@/components/prompt-dialog";
import { formatDZD, formatDate, toCentimes } from "@/lib/format";
import { notifyError } from "@/lib/errors";
import type { ClaimStatus } from "@/types";

const CLAIM_STATUSES: ClaimStatus[] = [
  "pending",
  "submitted",
  "partial",
  "paid",
  "rejected",
];

const statusVariant: Record<
  ClaimStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  submitted: "secondary",
  partial: "secondary",
  paid: "default",
  rejected: "destructive",
};

export default function InsurancePage() {
  const { data: settings } = useSettings();
  const symbol = settings?.currency_symbol;

  return (
    <div className="flex flex-col gap-6">
      <PayersCard />
      <ClaimsCard symbol={symbol} />
    </div>
  );
}

function PayersCard() {
  const { t } = useTranslation();
  const { data: payers } = usePayers();
  const create = useCreatePayer();
  const del = useDeletePayer();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [coverage, setCoverage] = useState("80");

  async function add() {
    if (!name.trim()) {
      toast.error(t("insurance.enterPayerName"));
      return;
    }
    try {
      await create.mutateAsync({
        name: name.trim(),
        type: type.trim() || null,
        default_coverage_pct: Math.round(Number(coverage) * 100),
        notes: null,
      });
      setName("");
      setType("");
      setCoverage("80");
      toast.success(t("insurance.payerAdded"));
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  async function remove(id: number) {
    try {
      await del.mutateAsync(id);
      toast.success(t("insurance.payerRemoved"));
    } catch {
      toast.error(t("insurance.cantRemovePayer"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("insurance.payers")}</CardTitle>
        <CardDescription>{t("insurance.payersDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="payer_name" className="text-xs">
              {t("common.name")}
            </Label>
            <Input
              id="payer_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-48"
              placeholder={t("insurance.namePlaceholderCnas")}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="payer_type" className="text-xs">
              {t("common.type")}
            </Label>
            <Input
              id="payer_type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-40"
              placeholder={t("insurance.typeOptional")}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="payer_cov" className="text-xs">
              {t("insurance.defaultCoveragePct")}
            </Label>
            <Input
              id="payer_cov"
              type="number"
              min="0"
              max="100"
              value={coverage}
              onChange={(e) => setCoverage(e.target.value)}
              className="w-32"
            />
          </div>
          <Button onClick={add} disabled={create.isPending}>
            <Plus className="size-4" /> {t("common.add")}
          </Button>
        </div>

        {!payers?.length ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            {t("insurance.noPayers")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.type")}</TableHead>
                <TableHead className="text-right">
                  {t("insurance.defaultCoverage")}
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payers.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.type ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {p.default_coverage_pct / 100}%
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("common.remove")}
                      onClick={() => remove(p.id)}
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
  );
}

function ClaimsCard({ symbol }: { symbol?: string }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ClaimStatus | "all">("all");
  const [reimbursing, setReimbursing] = useState<number | null>(null);
  const { data: claims } = useClaims(filter === "all" ? null : filter);
  const setStatus = useUpdateClaimStatus();
  const recordPay = useRecordClaimPayment();

  async function changeStatus(id: number, status: ClaimStatus) {
    try {
      await setStatus.mutateAsync({ id, status });
    } catch (err) {
      notifyError(err, t("problem.actionFailed"));
    }
  }

  async function submitReimbursement(values: Record<string, string>) {
    if (reimbursing == null) return;
    const amount = toCentimes(values.amount);
    if (amount <= 0) {
      toast.error(t("insurance.enterAmountGt0"));
      return;
    }
    try {
      await recordPay.mutateAsync({ id: reimbursing, amount });
      toast.success(t("insurance.reimbursementRecorded"));
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>{t("insurance.insuranceClaims")}</CardTitle>
          <CardDescription>{t("insurance.claimsDesc")}</CardDescription>
        </div>
        <Select
          value={filter}
          onValueChange={(v) => setFilter(v as ClaimStatus | "all")}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("insurance.allStatuses")}</SelectItem>
            {CLAIM_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`claimStatus.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {!claims?.length ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            {t("insurance.noClaims")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.invoice")}</TableHead>
                <TableHead>{t("common.patient")}</TableHead>
                <TableHead>{t("insurance.payer")}</TableHead>
                <TableHead className="text-right">
                  {t("insurance.covered")}
                </TableHead>
                <TableHead className="text-right">
                  {t("insurance.reimbursed")}
                </TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead className="text-right">
                  {t("common.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      to={`/sales/${c.sale_id}`}
                      className="hover:underline"
                    >
                      {c.invoice_number ?? `#${c.sale_id}`}
                    </Link>
                    <div className="text-muted-foreground text-xs">
                      {formatDate(c.sale_date)}
                    </div>
                  </TableCell>
                  <TableCell>{c.patient_name}</TableCell>
                  <TableCell>{c.payer_name}</TableCell>
                  <TableCell className="text-right">
                    {formatDZD(c.covered_amount, symbol)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatDZD(c.paid_amount, symbol)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[c.status]}>
                      {t(`claimStatus.${c.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Select
                        value={c.status}
                        onValueChange={(v) =>
                          changeStatus(c.id, v as ClaimStatus)
                        }
                      >
                        <SelectTrigger className="h-10 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CLAIM_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {t(`claimStatus.${s}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReimbursing(c.id)}
                      >
                        {t("common.record")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <PromptDialog
        open={reimbursing != null}
        onOpenChange={(o) => !o && setReimbursing(null)}
        title={t("dlg.recordReimbursement")}
        confirmText={t("common.record")}
        fields={[
          {
            name: "amount",
            label: t("dlg.amountReceived"),
            type: "number",
            inputMode: "numeric",
            min: "0",
          },
        ]}
        onSubmit={submitReimbursement}
      />
    </Card>
  );
}
