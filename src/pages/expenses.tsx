import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { HelpHint } from "@/components/help-hint";
import {
  useCreateExpense,
  useDeleteExpense,
  useExpenses,
  useUpdateExpense,
} from "@/hooks/use-expenses";
import { useSettings } from "@/hooks/use-settings";
import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory } from "@/db/expenses";
import { presetRange } from "@/lib/date-range";
import { formatDZD, formatDate, fromCentimes, toCentimes, todayISO } from "@/lib/format";

/**
 * Operating expenses: rent, salaries, utilities and the like.
 *
 * Stock bought from suppliers is deliberately *not* recorded here — it lives on
 * the Suppliers page and reaches the profit & loss as cost of goods once the
 * stock sells. Entering it as an expense too would deduct the same money twice
 * and understate profit, so the page says so rather than leaving staff to guess.
 */
export default function ExpensesPage() {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const symbol = settings?.currency_symbol;

  const month = useMemo(() => presetRange("month"), []);
  const [range, setRange] = useState({ from: month.from, to: month.to });
  const [category, setCategory] = useState<ExpenseCategory | "all">("all");
  const { data: expenses, isLoading } = useExpenses({ ...range, category });

  const [editing, setEditing] = useState<Expense | null>(null);
  const [creating, setCreating] = useState(false);
  const remove = useDeleteExpense();

  const total = (expenses ?? []).reduce((s, e) => s + e.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t("expenses.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("expenses.subtitle")}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          {t("expenses.add")}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="size-4" />
            {t("expenses.periodTotal")}
            <span className="ms-auto font-mono tabular-nums">
              {formatDZD(total, symbol)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="exp-from">{t("common.from")}</Label>
            <Input
              id="exp-from"
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="exp-to">{t("common.to")}</Label>
            <Input
              id="exp-to"
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>{t("expenses.categoryLabel")}</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as ExpenseCategory | "all")}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("expenses.allCategories")}</SelectItem>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(`expenses.category.${c}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.date")}</TableHead>
              <TableHead>{t("expenses.categoryLabel")}</TableHead>
              <TableHead>{t("common.note")}</TableHead>
              <TableHead className="text-end">{t("common.amount")}</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            ) : !expenses?.length ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  {t("expenses.none")}
                </TableCell>
              </TableRow>
            ) : (
              expenses.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{formatDate(e.expense_date)}</TableCell>
                  <TableCell>{t(`expenses.category.${e.category}`)}</TableCell>
                  <TableCell className="text-muted-foreground">{e.note ?? "—"}</TableCell>
                  <TableCell className="text-end font-mono tabular-nums">
                    {formatDZD(e.amount, symbol)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("common.edit")}
                        onClick={() => setEditing(e)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("common.delete")}
                        onClick={() => {
                          remove.mutate(e.id, {
                            onSuccess: () => toast.success(t("expenses.deleted")),
                            onError: (err) => notifyError(err, t("expenses.deleteFailed")),
                          });
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {(creating || editing) && (
        <ExpenseDialog
          expense={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ExpenseDialog({
  expense,
  onClose,
}: {
  expense: Expense | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateExpense();
  const update = useUpdateExpense();

  const [date, setDate] = useState(expense?.expense_date ?? todayISO());
  const [category, setCategory] = useState<ExpenseCategory>(
    expense?.category ?? "other",
  );
  const [amount, setAmount] = useState(
    expense ? String(fromCentimes(expense.amount)) : "",
  );
  const [note, setNote] = useState(expense?.note ?? "");

  const centimes = toCentimes(amount);
  const valid = centimes > 0 && !!date;

  function submit() {
    if (!valid) return;
    const input = {
      expense_date: date,
      category,
      amount: centimes,
      note: note.trim() || null,
    };
    const opts = {
      onSuccess: () => {
        toast.success(t(expense ? "expenses.updated" : "expenses.created"));
        onClose();
      },
      onError: (err: unknown) => notifyError(err, t("expenses.saveFailed")),
    };
    if (expense) update.mutate({ id: expense.id, input }, opts);
    else create.mutate(input, opts);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t(expense ? "expenses.editTitle" : "expenses.addTitle")}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="e-date">{t("common.date")}</Label>
            <Input
              id="e-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>
              {t("expenses.categoryLabel")}
              <HelpHint text={t("expenses.categoryHint")} />
            </Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(`expenses.category.${c}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="e-amount">{t("common.amount")}</Label>
            <Input
              id="e-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="e-note">{t("common.note")}</Label>
            <Textarea
              id="e-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("expenses.stockNotice")}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!valid || create.isPending || update.isPending}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
