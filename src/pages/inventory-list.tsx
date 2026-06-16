import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Search, Pencil, Trash2, PackagePlus, Barcode } from "lucide-react";
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
import { ErrorState } from "@/components/error-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DeliveryDialog } from "@/components/delivery-dialog";
import { BarcodeLabelDialog } from "@/components/barcode-label-dialog";
import {
  useBrands,
  useDeleteProduct,
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
  const [labelFor, setLabelFor] = useState<Product | null>(null);
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
  const del = useDeleteProduct();

  async function handleDelete() {
    if (toDelete == null) return;
    try {
      await del.mutateAsync(toDelete);
      toast.success(t("inventory.productDeleted"));
    } catch (err) {
      notifyError(err, t("problem.actionFailed"));
    } finally {
      setToDelete(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
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
            <SelectItem value="product">{t("inventory.typeProduct")}</SelectItem>
            <SelectItem value="service">{t("inventory.typeService")}</SelectItem>
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

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
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
                  <TableCell colSpan={7}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : productsQuery.isError ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <ErrorState
                    className="border-0"
                    onRetry={() => productsQuery.refetch()}
                  />
                </TableCell>
              </TableRow>
            ) : !products?.length ? (
              <TableRow>
                <TableCell
                  colSpan={7}
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
                      <div className="flex justify-end gap-1">
                        {!isService && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t("inventory.recordDeliveryAria")}
                            onClick={() => setDeliveryFor(p)}
                          >
                            <PackagePlus className="size-4" />
                          </Button>
                        )}
                        {!isService && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t("inventory.printLabel")}
                            onClick={() => setLabelFor(p)}
                          >
                            <Barcode className="size-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" asChild>
                          <Link
                            to={`/inventory/${p.id}/edit`}
                            aria-label={t("common.edit")}
                          >
                            <Pencil className="size-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("common.delete")}
                          onClick={() => setToDelete(p.id)}
                        >
                          <Trash2 className="text-destructive size-4" />
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
      <BarcodeLabelDialog
        key={`label-${labelFor?.id ?? "none"}`}
        product={labelFor}
        open={labelFor != null}
        onOpenChange={(o) => !o && setLabelFor(null)}
      />
      <ConfirmDialog
        open={toDelete != null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t("inventory.deleteTitle")}
        description={t("inventory.deleteDesc")}
        confirmText={t("common.delete")}
        onConfirm={handleDelete}
      />
    </div>
  );
}
