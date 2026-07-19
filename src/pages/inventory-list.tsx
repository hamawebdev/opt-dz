import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  PackagePlus,
  Barcode,
  Package,
  Boxes,
  Banknote,
  Tags,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState } from "@/components/error-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DeliveryDialog } from "@/components/delivery-dialog";
import { LabelDesignerDialog } from "@/components/label-designer/label-designer-dialog";
import { StatCard } from "@/components/stat-card";
import {
  useBrands,
  useArchiveProduct,
  useInventorySummary,
  useProducts,
} from "@/hooks/use-inventory";
import { useFilterableAttributes } from "@/hooks/use-attributes";
import { usePrimaryImages } from "@/hooks/use-images";
import {
  FacetFilters,
  facetSelectionToFilters,
  type FacetSelection,
} from "@/components/facet-filters";
import { useSettings } from "@/hooks/use-settings";
import { formatDZD } from "@/lib/format";
import type { ItemType, Product, ProductCategory } from "@/types";

type CategoryTab = ProductCategory | "all";

const categoryTabs: CategoryTab[] = ["all", "frame", "lens", "accessory"];

export default function InventoryListPage() {
  const { t } = useTranslation();
  const [category, setCategory] = useState<CategoryTab>("all");
  const [itemType, setItemType] = useState<ItemType | "all">("all");
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("all");
  const [availability, setAvailability] = useState<
    "all" | "in" | "low" | "out"
  >("all");
  const [toDelete, setToDelete] = useState<number | null>(null);
  const [deliveryFor, setDeliveryFor] = useState<Product | null>(null);
  const [designerProducts, setDesignerProducts] = useState<Product[] | null>(
    null,
  );
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [facets, setFacets] = useState<FacetSelection>({});

  const filters = useMemo(
    () => ({
      category,
      item_type: itemType,
      search,
      brand: brand === "all" ? undefined : brand,
      availability,
      attributes: facetSelectionToFilters(facets),
    }),
    [category, itemType, search, brand, availability, facets],
  );

  const productsQuery = useProducts(filters);
  const { data: products, isLoading } = productsQuery;
  const { data: brands } = useBrands();
  const { data: filterAttrs } = useFilterableAttributes();
  const { data: primaryImages } = usePrimaryImages();
  const { data: settings } = useSettings();
  const symbol = settings?.currency_symbol;
  const archive = useArchiveProduct();

  // Whole-inventory KPIs — deliberately independent of the filters below so the
  // headline numbers stay stable while staff search and filter the table.
  const summaryQuery = useInventorySummary();
  const summary = summaryQuery.data;
  const summaryLoading = summaryQuery.isLoading;

  // Multi-select for bulk label printing. Services have no labels, so they are
  // never selectable. The Set may hold ids filtered out of view; the effective
  // selection is always the intersection with the visible list, so stale ids
  // are harmless (and re-appear checked when the filter brings them back).
  const selectable = useMemo(
    () => (products ?? []).filter((p) => p.item_type !== "service"),
    [products],
  );
  const checkedProducts = useMemo(
    () => selectable.filter((p) => checked.has(p.id)),
    [selectable, checked],
  );

  const allChecked =
    selectable.length > 0 && checkedProducts.length === selectable.length;

  function toggle(id: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(selectable.map((p) => p.id)));
  }
  const profit = summary ? summary.totalValue - summary.totalCost : 0;
  const kpiCount = (n: number | undefined) =>
    summaryQuery.isError ? "—" : (n ?? 0).toLocaleString("en-US");
  const kpiMoney = (n: number | undefined) =>
    summaryQuery.isError ? "—" : formatDZD(n, symbol);

  async function handleDelete() {
    if (toDelete == null) return;
    try {
      await archive.mutateAsync(toDelete);
      toast.success(t("inventory.productArchived"));
    } catch (err) {
      notifyError(err, t("problem.actionFailed"));
    } finally {
      setToDelete(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          title={t("inventory.kpiProducts")}
          value={kpiCount(summary?.productCount)}
          icon={<Package className="size-5" />}
          loading={summaryLoading}
        />
        <StatCard
          title={t("inventory.kpiUnits")}
          value={kpiCount(summary?.totalUnits)}
          icon={<Boxes className="size-5" />}
          loading={summaryLoading}
        />
        <StatCard
          title={t("inventory.kpiInvestment")}
          value={kpiMoney(summary?.totalCost)}
          sub={t("inventory.kpiInvestmentSub")}
          icon={<Banknote className="size-5" />}
          loading={summaryLoading}
        />
        <StatCard
          title={t("inventory.kpiValue")}
          value={kpiMoney(summary?.totalValue)}
          sub={t("inventory.kpiValueSub")}
          icon={<Tags className="size-5" />}
          loading={summaryLoading}
        />
        <StatCard
          title={t("inventory.kpiProfit")}
          value={kpiMoney(profit)}
          sub={t("inventory.kpiProfitSub")}
          icon={<TrendingUp className="size-5" />}
          accent={summary && profit < 0 ? "warning" : "success"}
          loading={summaryLoading}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={category}
          onValueChange={(v) => setCategory(v as CategoryTab)}
        >
          <TabsList>
            {categoryTabs.map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {t(`categoryPlural.${tab}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button asChild>
          <Link to="/inventory/new">
            <Plus className="size-4" /> {t("inventory.newProduct")}
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder={t("inventory.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>
        <Select
          value={itemType}
          onValueChange={(v) => setItemType(v as ItemType | "all")}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            <SelectItem value="product">
              {t("inventory.typeProduct")}
            </SelectItem>
            <SelectItem value="service">
              {t("inventory.typeService")}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select value={brand} onValueChange={setBrand}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("common.brand")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("inventory.allBrands")}</SelectItem>
            {brands?.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={availability}
          onValueChange={(v) => setAvailability(v as typeof availability)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("inventory.availability")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("inventory.allStock")}</SelectItem>
            <SelectItem value="in">{t("inventory.inStock")}</SelectItem>
            <SelectItem value="low">{t("inventory.lowStock")}</SelectItem>
            <SelectItem value="out">{t("inventory.outOfStock")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <FacetFilters
        attributes={filterAttrs ?? []}
        value={facets}
        onChange={setFacets}
      />

      {checkedProducts.length > 0 && (
        <div className="bg-accent/60 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2">
          <span className="text-sm font-medium">
            {t("inventory.selectedCount", { count: checkedProducts.length })}
          </span>
          <Button onClick={() => setDesignerProducts(checkedProducts)}>
            <Barcode className="size-4" /> {t("inventory.printLabels")}
          </Button>
          <Button variant="ghost" onClick={() => setChecked(new Set())}>
            <X className="size-4" /> {t("inventory.clearSelection")}
          </Button>
        </div>
      )}

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={toggleAll}
                  disabled={selectable.length === 0}
                  aria-label={t("inventory.selectAll")}
                />
              </TableHead>
              <TableHead>{t("common.name")}</TableHead>
              <TableHead>{t("common.category")}</TableHead>
              <TableHead>{t("common.brand")}</TableHead>
              <TableHead>{t("inventory.ref")}</TableHead>
              <TableHead className="text-right">
                {t("inventory.selling")}
              </TableHead>
              <TableHead className="text-right">
                {t("inventory.stock")}
              </TableHead>
              <TableHead className="text-right">
                {t("common.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : productsQuery.isError ? (
              <TableRow>
                <TableCell colSpan={8} className="p-0">
                  <ErrorState
                    className="border-0"
                    onRetry={() => productsQuery.refetch()}
                  />
                </TableCell>
              </TableRow>
            ) : !products?.length ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-muted-foreground py-10 text-center"
                >
                  {t("inventory.noProducts")}
                </TableCell>
              </TableRow>
            ) : (
              products.map((p) => {
                const isService = p.item_type === "service";
                const low = p.quantity <= p.min_stock;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      {!isService && (
                        <Checkbox
                          checked={checked.has(p.id)}
                          onCheckedChange={() => toggle(p.id)}
                          aria-label={t("inventory.selectProduct", {
                            name: p.name,
                          })}
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {primaryImages?.[p.id] && (
                          <img
                            src={primaryImages[p.id]}
                            alt=""
                            className="size-8 shrink-0 rounded object-cover"
                          />
                        )}
                        {p.name}
                        {isService && (
                          <Badge variant="secondary" className="font-normal">
                            {t("inventory.typeService")}
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      {isService ? "—" : t(`category.${p.category}`)}
                    </TableCell>
                    <TableCell>{p.brand || "—"}</TableCell>
                    <TableCell>{p.reference || "—"}</TableCell>
                    <TableCell className="text-right">
                      {formatDZD(p.selling_price, symbol)}
                    </TableCell>
                    <TableCell className="text-right">
                      {isService ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Badge
                          variant={
                            p.quantity <= 0
                              ? "destructive"
                              : low
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {p.quantity}
                          {low && p.quantity > 0
                            ? ` · ${t("inventory.low")}`
                            : ""}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {!isService && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeliveryFor(p)}
                          >
                            <PackagePlus className="size-4" />{" "}
                            {t("inventory.deliveryBtn")}
                          </Button>
                        )}
                        {!isService && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDesignerProducts([p])}
                          >
                            <Barcode className="size-4" />{" "}
                            {t("inventory.labelBtn")}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/inventory/${p.id}/edit`}>
                            <Pencil className="size-4" /> {t("common.edit")}
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setToDelete(p.id)}
                        >
                          <Trash2 className="size-4" /> {t("inventory.archive")}
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

      <DeliveryDialog
        key={deliveryFor?.id ?? "none"}
        product={deliveryFor}
        open={deliveryFor != null}
        onOpenChange={(o) => !o && setDeliveryFor(null)}
      />
      <LabelDesignerDialog
        products={designerProducts}
        open={designerProducts != null}
        onOpenChange={(o) => !o && setDesignerProducts(null)}
        onPrinted={() => setChecked(new Set())}
      />
      <ConfirmDialog
        open={toDelete != null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t("inventory.archiveTitle")}
        description={t("inventory.archiveDesc")}
        confirmText={t("inventory.archive")}
        onConfirm={handleDelete}
      />
    </div>
  );
}
