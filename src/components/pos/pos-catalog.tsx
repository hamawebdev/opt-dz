import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  LayoutGrid,
  List,
  Star,
  Clock,
  PackageCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useBrandRows } from "@/hooks/use-taxonomy";
import { useColors } from "@/hooks/use-colors";
import { usePrimaryImages } from "@/hooks/use-images";
import { useCatalog, useRecentlySold } from "@/hooks/use-catalog";
import type { CatalogFilters, CatalogProduct } from "@/db/catalog";
import type { ProductCategory } from "@/types";
import { PosProductCard } from "@/components/pos/pos-product-card";

type Shelf = "all" | "favorites" | "recent";
type View = "grid" | "list";

// The search box carries this id so the page can focus it (the `/` shortcut and the
// scanner-not-found fallback) without threading a ref through the Input wrapper.
export const POS_SEARCH_INPUT_ID = "pos-search-input";

interface Props {
  symbol?: string;
  onSelectProduct: (product: CatalogProduct) => void;
  onToggleFavorite: (product: CatalogProduct) => void;
  /** Manual barcode fallback: Enter in the search box. Return true if it resolved
   * to a product (the search box is then cleared). */
  onSearchEnter?: (value: string) => boolean;
}

const CATEGORIES: (ProductCategory | "all")[] = [
  "all",
  "frame",
  "lens",
  "accessory",
];

export function PosCatalog({
  symbol,
  onSelectProduct,
  onToggleFavorite,
  onSearchEnter,
}: Props) {
  const { t } = useTranslation();
  const { data: brands } = useBrandRows();
  const { data: colors } = useColors();
  const { data: images } = usePrimaryImages();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const [brandId, setBrandId] = useState<number | null>(null);
  const [colorId, setColorId] = useState<number | null>(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [shelf, setShelf] = useState<Shelf>("all");
  const [view, setView] = useState<View>("grid");

  // Debounce the search so each keystroke doesn't fire a query.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  const filters: CatalogFilters = useMemo(
    () => ({
      search,
      category,
      brand_id: brandId ?? undefined,
      color_id: colorId ?? undefined,
      inStockOnly,
      favoritesOnly: shelf === "favorites",
    }),
    [search, category, brandId, colorId, inStockOnly, shelf],
  );

  const catalog = useCatalog(filters);
  const recent = useRecentlySold(shelf === "recent");

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (shelf === "recent") return;
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (
        entries[0]?.isIntersecting &&
        catalog.hasNextPage &&
        !catalog.isFetchingNextPage
      ) {
        void catalog.fetchNextPage();
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [shelf, catalog]);

  const products: CatalogProduct[] =
    shelf === "recent"
      ? (recent.data ?? [])
      : (catalog.data?.pages.flatMap((p) => p.items) ?? []);

  const loading = shelf === "recent" ? recent.isLoading : catalog.isLoading;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Search + view toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            id={POS_SEARCH_INPUT_ID}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !searchInput.trim()) return;
              if (onSearchEnter?.(searchInput.trim())) setSearchInput("");
            }}
            placeholder={t("pos.searchPlaceholder")}
            className="h-11 ps-9"
            aria-label={t("common.search")}
          />
        </div>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as View)}
          variant="outline"
        >
          <ToggleGroupItem value="grid" aria-label={t("pos.gridView")}>
            <LayoutGrid className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label={t("pos.listView")}>
            <List className="size-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Category tabs */}
      <Tabs
        value={category}
        onValueChange={(v) => setCategory(v as typeof category)}
      >
        <TabsList>
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c} value={c}>
              {t(`categoryPlural.${c}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          size="sm"
          className="w-auto"
          value={brandId ?? ""}
          onChange={(e) =>
            setBrandId(e.target.value ? Number(e.target.value) : null)
          }
          aria-label={t("pos.allBrands")}
        >
          <NativeSelectOption value="">{t("pos.allBrands")}</NativeSelectOption>
          {(brands ?? []).map((b) => (
            <NativeSelectOption key={b.id} value={b.id}>
              {b.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <NativeSelect
          size="sm"
          className="w-auto"
          value={colorId ?? ""}
          onChange={(e) =>
            setColorId(e.target.value ? Number(e.target.value) : null)
          }
          aria-label={t("pos.allColors")}
        >
          <NativeSelectOption value="">{t("pos.allColors")}</NativeSelectOption>
          {(colors ?? []).map((c) => (
            <NativeSelectOption key={c.id} value={c.id}>
              {c.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <Button
          type="button"
          size="sm"
          variant={inStockOnly ? "default" : "outline"}
          onClick={() => setInStockOnly((v) => !v)}
        >
          <PackageCheck className="size-4" /> {t("pos.inStockOnly")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={shelf === "favorites" ? "default" : "outline"}
          onClick={() =>
            setShelf((s) => (s === "favorites" ? "all" : "favorites"))
          }
        >
          <Star className="size-4" /> {t("pos.favorites")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={shelf === "recent" ? "default" : "outline"}
          onClick={() => setShelf((s) => (s === "recent" ? "all" : "recent"))}
        >
          <Clock className="size-4" /> {t("pos.recentlySold")}
        </Button>
      </div>

      {/* Results */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div
            className={cn(
              view === "grid"
                ? "grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                : "flex flex-col gap-2",
            )}
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className={view === "grid" ? "h-56" : "h-20"} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="text-muted-foreground py-16 text-center">
            {t("pos.noProducts")}
          </p>
        ) : (
          <div
            className={cn(
              view === "grid"
                ? "grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                : "flex flex-col gap-2",
            )}
          >
            {products.map((p) => (
              <PosProductCard
                key={p.id}
                product={p}
                image={images?.[p.id] ?? null}
                view={view}
                symbol={symbol}
                onSelect={onSelectProduct}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        )}
        {shelf !== "recent" && <div ref={sentinel} className="h-8" />}
      </div>
    </div>
  );
}
