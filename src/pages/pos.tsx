import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSimpleMode } from "@/store/use-app-store";
import { useProducts } from "@/hooks/use-inventory";
import { useSellableVariants } from "@/hooks/use-variants";
import { usePrimaryImages } from "@/hooks/use-images";
import { useSettings } from "@/hooks/use-settings";
import { useCreateSale } from "@/hooks/use-sales";
import { useToggleFavorite } from "@/hooks/use-catalog";
import {
  useSaveHeldSale,
  useUpdateHeldSale,
  useDeleteHeldSale,
} from "@/hooks/use-held-sales";
import {
  useCartStore,
  buildProductLine,
  buildVariantLine,
  type CartSnapshot,
} from "@/store/use-cart-store";
import { posTotals } from "@/lib/pos-totals";
import { resolveBarcode } from "@/lib/pos-barcode";
import type { CatalogProduct } from "@/db/catalog";
import type { SellableVariant } from "@/db/variants";
import type { Product } from "@/types";
import { PosCatalog, POS_SEARCH_INPUT_ID } from "@/components/pos/pos-catalog";
import { PosCart } from "@/components/pos/pos-cart";
import { PosVariantChooser } from "@/components/pos/pos-variant-chooser";
import { PosHeldSalesBar } from "@/components/pos/pos-held-sales-bar";
import { PosPayDialog } from "@/components/pos/pos-pay-dialog";
import { todayISO } from "@/lib/format";

const today = () => todayISO();
const focusSearch = () => document.getElementById(POS_SEARCH_INPUT_ID)?.focus();

export default function PosPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const simpleMode = useSimpleMode();

  const { data: products } = useProducts({});
  const { data: variants } = useSellableVariants();
  const { data: images } = usePrimaryImages();
  const { data: settings } = useSettings();
  const symbol = settings?.currency_symbol;

  const create = useCreateSale();
  const saveHeld = useSaveHeldSale();
  const updateHeld = useUpdateHeldSale();
  const deleteHeld = useDeleteHeldSale();
  const toggleFav = useToggleFavorite();

  const addLine = useCartStore((s) => s.addLine);
  const clear = useCartStore((s) => s.clear);
  const loadSnapshot = useCartStore((s) => s.loadSnapshot);
  // Re-render totals whenever any cart input changes.
  const cart = useCartStore();

  const [chooserProduct, setChooserProduct] = useState<CatalogProduct | null>(
    null,
  );
  const [payOpen, setPayOpen] = useState(false);
  const [createdSaleId, setCreatedSaleId] = useState<number | null>(null);

  const totals = useMemo(
    () =>
      posTotals({
        lines: cart.lines,
        discountType: cart.discountType,
        discountValue: cart.discountValue,
        paymentMethod: cart.paymentMethod,
        payerId: cart.payerId,
        coveragePct: cart.coveragePct,
        settings,
      }),
    [
      cart.lines,
      cart.discountType,
      cart.discountValue,
      cart.paymentMethod,
      cart.payerId,
      cart.coveragePct,
      settings,
    ],
  );

  const chooserVariants = useMemo(
    () =>
      chooserProduct
        ? (variants ?? []).filter((v) => v.product_id === chooserProduct.id)
        : [],
    [chooserProduct, variants],
  );

  // ---- Add helpers (with non-blocking out-of-stock warning) ----
  function addProduct(
    p: CatalogProduct | (Product & { variant_count?: number }),
  ) {
    const line = buildProductLine(
      {
        id: p.id,
        name: p.name,
        brand: p.brand,
        selling_price: p.selling_price,
        item_type: p.item_type,
        quantity: p.quantity,
        variant_count: "variant_count" in p ? (p.variant_count ?? 0) : 0,
        variant_stock: "variant_stock" in p ? p.variant_stock : 0,
      },
      images?.[p.id] ?? null,
    );
    if (line.stock_available != null && line.stock_available <= 0)
      toast.warning(t("pos.outOfStockWarn", { name: p.name }));
    addLine(line);
  }

  function addVariant(v: SellableVariant) {
    addLine(buildVariantLine(v, images?.[v.product_id] ?? null, i18n.language));
    if (v.quantity <= 0)
      toast.warning(t("pos.outOfStockWarn", { name: `${v.product_name}` }));
  }

  function handleSelectProduct(product: CatalogProduct) {
    if (product.variant_count > 0) setChooserProduct(product);
    else addProduct(product);
  }

  // ---- Barcode resolution (scanner + manual search Enter) ----
  function tryBarcode(code: string): boolean {
    const match = resolveBarcode(code, variants ?? [], products ?? []);
    if (!match) {
      toast.error(t("pos.scanNotFound", { code }));
      focusSearch();
      return false;
    }
    if (match.kind === "variant") addVariant(match.variant);
    else addProduct(match.product);
    return true;
  }

  // Global hardware-scanner listener: fast keystrokes ending in Enter, captured
  // only when focus isn't in a field (so manual typing isn't hijacked). Manual
  // entry falls back to the search box (see onSearchEnter below).
  useEffect(() => {
    let buffer = "";
    let last = 0;
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const inField =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if (inField) return;
      const now = Date.now();
      if (now - last > 100) buffer = "";
      last = now;
      if (e.key === "Enter") {
        if (buffer.length >= 3) tryBarcode(buffer);
        buffer = "";
        return;
      }
      if (e.key.length === 1) buffer += e.key;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants, products, images, i18n.language]);

  // ---- Held sales (parked carts) ----
  function snapshotOf(s = useCartStore.getState()): CartSnapshot {
    return {
      lines: s.lines,
      customerId: s.customerId,
      customerName: s.customerName,
      prescriptionId: s.prescriptionId,
      discountType: s.discountType,
      discountValue: s.discountValue,
      payerId: s.payerId,
      coveragePct: s.coveragePct,
      paymentMethod: s.paymentMethod,
      notes: s.notes,
    };
  }

  // Persist the current cart as a held sale (no data loss when switching carts).
  function parkCurrent() {
    const s = useCartStore.getState();
    if (!s.lines.length) return;
    const tot = posTotals({ ...s, settings });
    const input = {
      label: null,
      customerId: s.customerId,
      payload: snapshotOf(s),
      itemCount: tot.itemCount,
      total: tot.grandTotal,
    };
    if (s.activeHeldId != null)
      void updateHeld.mutateAsync({ id: s.activeHeldId, input });
    else void saveHeld.mutateAsync(input);
  }

  function handleHold() {
    parkCurrent();
    clear();
    toast.success(t("pos.saleHeld"));
  }

  function handleResume(snapshot: CartSnapshot, heldId: number) {
    parkCurrent(); // save whatever is on the counter first
    loadSnapshot(snapshot, heldId);
  }

  // ---- Checkout ----
  async function handleConfirmPay(amountPaid: number) {
    const s = useCartStore.getState();
    const tot = posTotals({ ...s, settings });
    try {
      const id = await create.mutateAsync({
        patient_id: s.customerId,
        // Chosen in the customer bar; only meaningful for a known customer.
        prescription_id: s.customerId != null ? s.prescriptionId : null,
        sale_date: today(),
        discount_type: s.discountType,
        discount_value: tot.discountStored,
        notes: s.notes.trim() || null,
        items: tot.items,
        initial_payment: amountPaid,
        payment_method: s.paymentMethod,
        payer_id: s.payerId === "none" ? null : Number(s.payerId),
        coverage_pct: s.payerId === "none" ? null : tot.coverageBp,
      });
      if (s.activeHeldId != null) await deleteHeld.mutateAsync(s.activeHeldId);
      setPayOpen(false);
      clear();
      setCreatedSaleId(id);
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  const catalog = (
    <PosCatalog
      symbol={symbol}
      onSelectProduct={handleSelectProduct}
      onToggleFavorite={(p) => toggleFav.mutate(p.id)}
      onSearchEnter={tryBarcode}
    />
  );
  const cartPanel = (
    <PosCart
      totals={totals}
      symbol={symbol}
      simpleMode={simpleMode}
      onHold={handleHold}
      onPay={() => setPayOpen(true)}
    />
  );

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col gap-3">
      <PosHeldSalesBar symbol={symbol} onResume={handleResume} />

      {isMobile ? (
        <Tabs defaultValue="catalog" className="min-h-0 flex-1">
          <TabsList className="w-full">
            <TabsTrigger value="catalog" className="flex-1">
              {t("pos.title")}
            </TabsTrigger>
            <TabsTrigger value="cart" className="flex-1">
              {t("pos.cart")} · {totals.itemCount}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="catalog" className="min-h-0 flex-1">
            {catalog}
          </TabsContent>
          <TabsContent value="cart" className="min-h-0 flex-1">
            {cartPanel}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="min-w-0 flex-[1.7]">{catalog}</div>
          <div className="w-[clamp(18rem,30vw,24rem)] shrink-0">
            {cartPanel}
          </div>
        </div>
      )}

      <PosVariantChooser
        product={chooserProduct}
        variants={chooserVariants}
        symbol={symbol}
        onSelect={(v) => {
          addVariant(v);
          setChooserProduct(null);
        }}
        onClose={() => setChooserProduct(null)}
      />

      <PosPayDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        totals={totals}
        symbol={symbol}
        submitting={create.isPending}
        onConfirm={handleConfirmPay}
      />

      {/* What-next panel after a completed sale. */}
      <Dialog
        open={createdSaleId != null}
        onOpenChange={(o) => !o && setCreatedSaleId(null)}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="text-success size-6" />
              {t("pos.saleCompleted")}
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
              {t("pos.printReceipt")}
            </Button>
            <Button variant="outline" onClick={() => setCreatedSaleId(null)}>
              {t("pos.newSale")}
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
