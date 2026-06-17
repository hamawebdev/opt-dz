import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Plus,
  Minus,
  Trash2,
  PackageSearch,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HelpHint } from "@/components/help-hint";
import { PatientAvatar } from "@/components/patient-avatar";
import { useSimpleMode } from "@/store/use-app-store";
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
import { SearchSelect, type SearchOption } from "@/components/search-select";
import { usePatients, usePrescriptions } from "@/hooks/use-patients";
import { useProducts } from "@/hooks/use-inventory";
import { usePrimaryImages } from "@/hooks/use-images";
import { useSellableVariants } from "@/hooks/use-variants";
import { variantLabel } from "@/db/variants";
import { useCreateSale } from "@/hooks/use-sales";
import { usePayers } from "@/hooks/use-payers";
import { useSettings } from "@/hooks/use-settings";
import { computeTotals, type SaleItemInput } from "@/db/sales";
import {
  formatDZD,
  formatDate,
  toCentimes,
  fromCentimes,
  todayISO,
} from "@/lib/format";
import { taxConfig, extractTva, computeTimbre } from "@/lib/tax";
import type { DiscountType } from "@/types";

const PAYMENT_METHODS = ["cash", "card", "cheque", "transfer"] as const;

interface Line {
  key: string;
  product_id: number | null;
  variant_id: number | null;
  description: string;
  unit_price: string;
  quantity: string;
  item_discount: string;
}

const today = () => todayISO();
const n = (s: string) => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};
let counter = 0;
const newKey = () => `line-${counter++}`;

export default function SaleFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetPatient = params.get("patient");

  const { data: patients } = usePatients();
  const { data: products } = useProducts({});
  const { data: primaryImages } = usePrimaryImages();
  const { data: variants } = useSellableVariants();
  const { data: payers } = usePayers();
  const { data: settings } = useSettings();
  const symbol = settings?.currency_symbol;
  const create = useCreateSale();

  function selectPayer(value: string) {
    setPayerId(value);
    if (value === "none") {
      setCoveragePct("");
    } else {
      const p = payers?.find((x) => String(x.id) === value);
      if (p) setCoveragePct(String(p.default_coverage_pct / 100));
    }
  }

  const [patientId, setPatientId] = useState<string | null>(presetPatient);
  const [prescriptionId, setPrescriptionId] = useState<string>("none");
  const [saleDate, setSaleDate] = useState(today());
  const [discountType, setDiscountType] = useState<DiscountType>("amount");
  const [discountValue, setDiscountValue] = useState("");
  const [initialPayment, setInitialPayment] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [payerId, setPayerId] = useState("none");
  const [coveragePct, setCoveragePct] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [productToAdd, setProductToAdd] = useState<string | null>(null);
  const [barcode, setBarcode] = useState("");
  const simpleMode = useSimpleMode();
  const [showDiscount, setShowDiscount] = useState(false);
  const [showInsurance, setShowInsurance] = useState(false);
  const [createdSaleId, setCreatedSaleId] = useState<number | null>(null);

  const { data: prescriptions } = usePrescriptions(
    patientId ? Number(patientId) : undefined,
  );

  // Pre-fill the insurer + coverage from the patient's stored default, if any.
  useEffect(() => {
    const p = patients?.find((x) => String(x.id) === patientId);
    if (p?.default_payer_id) {
      setPayerId(String(p.default_payer_id));
      setCoveragePct(String((p.default_coverage_pct ?? 0) / 100));
    }
  }, [patientId, patients]);

  const patientOptions: SearchOption[] = useMemo(
    () =>
      (patients ?? []).map((p) => ({
        value: String(p.id),
        label: p.full_name,
        keywords: p.phone ?? "",
        // A face (or initials) helps low-literacy staff pick the right person.
        leading: (
          <PatientAvatar
            name={p.full_name}
            photo={p.photo}
            className="size-7 text-xs"
          />
        ),
      })),
    [patients],
  );

  // Products with variants are sold per-variant; products without are sold directly.
  const variantsByProduct = useMemo(() => {
    const m = new Map<number, typeof variants>();
    for (const v of variants ?? []) {
      const arr = m.get(v.product_id) ?? [];
      arr.push(v);
      m.set(v.product_id, arr);
    }
    return m;
  }, [variants]);

  const productOptions: SearchOption[] = useMemo(() => {
    const opts: SearchOption[] = [];
    for (const p of products ?? []) {
      const img = primaryImages?.[p.id];
      // A product photo lets staff pick by picture instead of reading the name.
      const leading = img ? (
        <img src={img} alt="" className="size-7 rounded object-cover" />
      ) : undefined;
      const vs = variantsByProduct.get(p.id);
      if (vs && vs.length) {
        for (const v of vs) {
          opts.push({
            value: `v:${v.id}`,
            label: `${p.name} — ${variantLabel(v)} (${v.quantity} in stock)`,
            keywords: `${p.brand ?? ""} ${v.sku ?? ""} ${v.barcode ?? ""}`,
            leading,
          });
        }
      } else {
        opts.push({
          value: `p:${p.id}`,
          label: `${p.name}${p.brand ? ` — ${p.brand}` : ""} (${p.quantity} in stock)`,
          keywords: `${p.brand ?? ""} ${p.reference ?? ""} ${p.category}`,
          leading,
        });
      }
    }
    return opts;
  }, [products, variantsByProduct, primaryImages]);

  function addProductLine(productIdStr: string) {
    const product = products?.find((p) => String(p.id) === productIdStr);
    if (!product) return;
    // Non-blocking warning when selling expired stock.
    if (product.expiry_date && product.expiry_date < today()) {
      toast.warning(t("sales.expiredWarning", { name: product.name }));
    }
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        product_id: product.id,
        variant_id: null,
        description: `${product.name}${product.brand ? ` — ${product.brand}` : ""}`,
        unit_price: String(fromCentimes(product.selling_price)),
        quantity: "1",
        item_discount: "",
      },
    ]);
    setProductToAdd(null);
  }

  function addVariantLine(variantId: number) {
    const v = variants?.find((x) => x.id === variantId);
    if (!v) return;
    const price = v.selling_price ?? v.product_price;
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        product_id: v.product_id,
        variant_id: v.id,
        description: `${v.product_name} — ${variantLabel(v)}`,
        unit_price: String(fromCentimes(price)),
        quantity: "1",
        item_discount: "",
      },
    ]);
    setProductToAdd(null);
  }

  /** Dispatches a picker selection: "p:<id>" → product, "v:<id>" → variant. */
  function addItem(value: string) {
    if (value.startsWith("v:")) addVariantLine(Number(value.slice(2)));
    else if (value.startsWith("p:")) addProductLine(value.slice(2));
  }

  function addByBarcode(code: string) {
    const c = code.trim();
    if (!c) return;
    const variant = variants?.find((v) => v.barcode && v.barcode === c);
    if (variant) {
      addVariantLine(variant.id);
      setBarcode("");
      return;
    }
    const product = products?.find(
      (p) =>
        (p.barcode && p.barcode === c) || (p.reference && p.reference === c),
    );
    if (!product) {
      toast.error(t("sales.noProductBarcode", { code: c }));
    } else {
      addProductLine(String(product.id));
    }
    setBarcode("");
  }

  function addCustomLine() {
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        product_id: null,
        variant_id: null,
        description: "",
        unit_price: "",
        quantity: "1",
        item_discount: "",
      },
    ]);
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  const saleItems: SaleItemInput[] = lines.map((l) => ({
    product_id: l.product_id,
    variant_id: l.variant_id,
    description: l.description.trim() || t("sales.itemFallback"),
    unit_price: toCentimes(l.unit_price),
    quantity: Math.max(1, Math.floor(n(l.quantity))),
    item_discount: toCentimes(l.item_discount),
  }));

  // Amount discount = centimes; percent discount = basis points (15% -> 1500).
  const discountStored =
    discountType === "percent"
      ? Math.round(n(discountValue) * 100)
      : toCentimes(discountValue);

  const { subtotal, total } = computeTotals(
    saleItems,
    discountType,
    discountStored,
  );
  // TVA + timbre + insurer coverage preview, mirroring the Rust create_sale command.
  const cfg = taxConfig(settings);
  const isCash = paymentMethod === "cash";
  const taxAmount = extractTva(total, cfg.tvaRate);
  const timbre = computeTimbre(total, cfg, isCash);
  const coverageBp = payerId === "none" ? 0 : Math.round(n(coveragePct) * 100);
  const covered =
    payerId === "none"
      ? 0
      : Math.min(total, Math.max(0, Math.floor((total * coverageBp) / 10000)));
  const grandTotal = total - covered + timbre; // patient's portion
  const paid = Math.min(toCentimes(initialPayment), grandTotal);
  const balance = Math.max(0, grandTotal - paid);

  async function handleSubmit() {
    if (!patientId) {
      toast.error(t("sales.selectAPatient"));
      return;
    }
    if (!lines.length) {
      toast.error(t("sales.addAtLeastOneItem"));
      return;
    }
    try {
      const id = await create.mutateAsync({
        patient_id: Number(patientId),
        prescription_id:
          prescriptionId === "none" ? null : Number(prescriptionId),
        sale_date: saleDate || today(),
        discount_type: discountType,
        discount_value: discountStored,
        notes: notes.trim() || null,
        items: saleItems,
        initial_payment: toCentimes(initialPayment),
        payment_method: paymentMethod.trim() || null,
        payer_id: payerId === "none" ? null : Number(payerId),
        coverage_pct: payerId === "none" ? null : coverageBp,
      });
      toast.success(t("sales.saleCreated"));
      // Show a clear "what next" panel rather than silently jumping away.
      setCreatedSaleId(id);
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  function startNewSale() {
    setCreatedSaleId(null);
    setLines([]);
    setPatientId(null);
    setPrescriptionId("none");
    setDiscountValue("0");
    setInitialPayment("0");
    setNotes("");
    setShowDiscount(false);
    setShowInsurance(false);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={() => navigate("/sales")}
      >
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.sales")}
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{t("sales.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label>{t("common.patient")} *</Label>
            <SearchSelect
              options={patientOptions}
              value={patientId}
              onChange={(v) => {
                setPatientId(v);
                setPrescriptionId("none");
              }}
              placeholder={t("sales.selectPatient")}
              searchPlaceholder={t("sales.searchByNamePhone")}
              emptyText={t("sales.noPatientsAddFirst")}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("sales.prescription")}</Label>
            <Select
              value={prescriptionId}
              onValueChange={setPrescriptionId}
              disabled={!patientId}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("sales.optional")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("common.none")}</SelectItem>
                {prescriptions?.map((rx) => (
                  <SelectItem key={rx.id} value={String(rx.id)}>
                    {formatDate(rx.exam_date)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sale_date">{t("common.date")}</Label>
            <Input
              id="sale_date"
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t("sales.items")}</CardTitle>
          <div className="flex w-full max-w-xl items-center gap-2">
            <Input
              className="w-40"
              placeholder={t("sales.scanBarcode")}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addByBarcode(barcode);
                }
              }}
            />
            <div className="flex-1">
              <SearchSelect
                options={productOptions}
                value={productToAdd}
                onChange={addItem}
                placeholder={t("sales.addProductFromInventory")}
                searchPlaceholder={t("sales.searchProducts")}
                emptyText={t("sales.noProductsShort")}
              />
            </div>
            <Button type="button" variant="outline" onClick={addCustomLine}>
              <Plus className="size-4" /> {t("sales.custom")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!lines.length ? (
            <p className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm">
              <PackageSearch className="size-4" /> {t("sales.noItemsYet")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">
                    {t("common.description")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("common.unitPrice")}
                  </TableHead>
                  <TableHead className="w-32 text-center">
                    {t("common.qty")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("common.discount")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("common.total")}
                  </TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => {
                  const lineTotal = Math.max(
                    0,
                    toCentimes(l.unit_price) *
                      Math.max(1, Math.floor(n(l.quantity))) -
                      toCentimes(l.item_discount),
                  );
                  return (
                    <TableRow key={l.key}>
                      <TableCell>
                        <Input
                          value={l.description}
                          onChange={(e) =>
                            updateLine(l.key, { description: e.target.value })
                          }
                          placeholder={t("sales.itemDescriptionPlaceholder")}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          className="text-right"
                          value={l.unit_price}
                          onChange={(e) =>
                            updateLine(l.key, { unit_price: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-9 shrink-0"
                            aria-label="−"
                            onClick={() =>
                              updateLine(l.key, {
                                quantity: String(
                                  Math.max(1, Math.floor(n(l.quantity)) - 1),
                                ),
                              })
                            }
                          >
                            <Minus className="size-4" />
                          </Button>
                          <Input
                            type="number"
                            min="1"
                            inputMode="numeric"
                            className="w-14 text-center"
                            value={l.quantity}
                            onChange={(e) =>
                              updateLine(l.key, { quantity: e.target.value })
                            }
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-9 shrink-0"
                            aria-label="+"
                            onClick={() =>
                              updateLine(l.key, {
                                quantity: String(
                                  Math.max(1, Math.floor(n(l.quantity)) + 1),
                                ),
                              })
                            }
                          >
                            <Plus className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          className="text-right"
                          value={l.item_discount}
                          onChange={(e) =>
                            updateLine(l.key, { item_discount: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatDZD(lineTotal, symbol)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("sales.removeLineAria")}
                          onClick={() => removeLine(l.key)}
                        >
                          <Trash2 className="text-destructive size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("common.notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("sales.notesPlaceholder")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("sales.summary")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("common.subtotal")}
              </span>
              <span className="font-medium">{formatDZD(subtotal, symbol)}</span>
            </div>
            {showDiscount ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground flex items-center gap-1">
                  {t("common.discount")}
                  <HelpHint text={t("help.discount")} />
                </span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    className="h-10 w-24 text-right"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                  />
                  <Select
                    value={discountType}
                    onValueChange={(v) => setDiscountType(v as DiscountType)}
                  >
                    <SelectTrigger className="h-10 w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="amount">{symbol ?? "DA"}</SelectItem>
                      <SelectItem value="percent">%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground -ms-2 w-fit"
                onClick={() => setShowDiscount(true)}
              >
                <Plus className="size-4" /> {t("common.discount")}
              </Button>
            )}
            <div className="flex justify-between border-t pt-3">
              <span className="text-muted-foreground">
                {t("common.totalTtc")}
              </span>
              <span className="font-medium">{formatDZD(total, symbol)}</span>
            </div>
            {!simpleMode && taxAmount > 0 && (
              <div className="text-muted-foreground flex justify-between text-xs">
                <span className="flex items-center gap-1">
                  {t("common.inclTva")}
                  <HelpHint text={t("help.tva")} />
                </span>
                <span>{formatDZD(taxAmount, symbol)}</span>
              </div>
            )}
            {!!payers?.length &&
              (showInsurance ? (
                <div className="grid gap-1.5 pt-1">
                  <Label className="text-muted-foreground flex items-center gap-1 text-xs">
                    {t("sales.insurancePayer")}
                    <HelpHint text={t("help.coverage")} />
                  </Label>
                  <div className="flex items-center gap-2">
                    <Select value={payerId} onValueChange={selectPayer}>
                      <SelectTrigger className="h-10 flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("common.none")}</SelectItem>
                        {payers.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {payerId !== "none" && (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          inputMode="numeric"
                          className="h-10 w-20 text-right"
                          value={coveragePct}
                          onChange={(e) => setCoveragePct(e.target.value)}
                        />
                        <span className="text-muted-foreground text-sm">%</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground -ms-2 w-fit"
                  onClick={() => setShowInsurance(true)}
                >
                  <Plus className="size-4" /> {t("sales.insurancePayer")}
                </Button>
              ))}
            {covered > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {t("sales.insuranceCovers")}
                </span>
                <span>−{formatDZD(covered, symbol)}</span>
              </div>
            )}
            <div className="grid gap-1.5 pt-1">
              <Label
                htmlFor="pay_method"
                className="text-muted-foreground text-xs"
              >
                {t("sales.paymentMethod")}
              </Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="pay_method" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`paymentMethod.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!simpleMode && timbre > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  {t("common.droitDeTimbre")}
                  <HelpHint text={t("help.timbre")} />
                </span>
                <span>{formatDZD(timbre, symbol)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-3 text-base font-semibold">
              <span>
                {covered > 0
                  ? t("common.patientTotal")
                  : t("common.grandTotal")}
              </span>
              <span>{formatDZD(grandTotal, symbol)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 pt-2">
              <span className="text-muted-foreground">
                {t("sales.amountPaidNow")}
              </span>
              <Input
                type="number"
                min="0"
                className="h-10 w-32 text-right"
                value={initialPayment}
                onChange={(e) => setInitialPayment(e.target.value)}
              />
            </div>
            <div
              className={
                "flex justify-between font-semibold tabular-nums " +
                (balance > 0 ? "text-warning" : "text-success")
              }
            >
              <span>{t("common.balanceDue")}</span>
              <span>{formatDZD(balance, symbol)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate("/sales")}>
          {t("common.cancel")}
        </Button>
        <Button onClick={handleSubmit} disabled={create.isPending}>
          {t("sales.createSale")}
        </Button>
      </div>

      <Dialog
        open={createdSaleId != null}
        onOpenChange={(o) => {
          if (!o && createdSaleId != null) navigate(`/sales/${createdSaleId}`);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="text-success size-6" />
              {t("saleSuccess.title")}
            </DialogTitle>
            <DialogDescription>{t("saleSuccess.body")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-center">
            <Button
              variant="outline"
              onClick={() =>
                createdSaleId != null &&
                navigate(`/sales/${createdSaleId}/print`)
              }
            >
              {t("saleSuccess.print")}
            </Button>
            <Button variant="outline" onClick={startNewSale}>
              {t("saleSuccess.newSale")}
            </Button>
            <Button
              onClick={() =>
                createdSaleId != null && navigate(`/sales/${createdSaleId}`)
              }
            >
              {t("saleSuccess.view")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
