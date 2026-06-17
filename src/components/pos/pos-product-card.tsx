import { Star, ImageOff, Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatDZD } from "@/lib/format";
import { effectiveStock, type CatalogProduct } from "@/db/catalog";
import { PosStockPill } from "@/components/pos/pos-stock-pill";

interface Props {
  product: CatalogProduct;
  image: string | null;
  view: "grid" | "list";
  symbol?: string;
  onSelect: (product: CatalogProduct) => void;
  onToggleFavorite: (product: CatalogProduct) => void;
}

function ColorSwatch({
  hex,
  name,
}: {
  hex: string | null;
  name: string | null;
}) {
  if (!name) return null;
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
      {hex && (
        <span
          className="size-3 shrink-0 rounded-full ring-1 ring-black/10"
          style={{ backgroundColor: hex }}
        />
      )}
      {name}
    </span>
  );
}

function Thumb({
  image,
  alt,
  className,
}: {
  image: string | null;
  alt: string;
  className?: string;
}) {
  if (image)
    return (
      <img
        src={image}
        alt=""
        loading="lazy"
        className={cn("object-cover", className)}
      />
    );
  return (
    <div
      aria-label={alt}
      className={cn(
        "bg-muted text-muted-foreground flex items-center justify-center",
        className,
      )}
    >
      <ImageOff className="size-6 opacity-40" />
    </div>
  );
}

export function PosProductCard({
  product,
  image,
  view,
  symbol,
  onSelect,
  onToggleFavorite,
}: Props) {
  const { t } = useTranslation();
  const isService = product.item_type === "service";
  const stock = effectiveStock(product);
  const out = !isService && stock <= 0;

  const favBtn = (
    <button
      type="button"
      aria-pressed={product.is_favorite ? true : false}
      aria-label={t("pos.favorites")}
      onClick={(e) => {
        e.stopPropagation();
        onToggleFavorite(product);
      }}
      className="hover:bg-muted text-muted-foreground absolute end-1.5 top-1.5 rounded-full p-1.5"
    >
      <Star
        className={cn(
          "size-4",
          product.is_favorite && "fill-warning text-warning",
        )}
      />
    </button>
  );

  const meta = (
    <>
      {product.brand && (
        <p className="text-muted-foreground truncate text-xs">
          {product.brand}
        </p>
      )}
      {product.reference && (
        <p className="text-muted-foreground truncate text-xs">
          {product.reference}
        </p>
      )}
      <ColorSwatch hex={product.color_hex} name={product.color_name} />
    </>
  );

  if (view === "list") {
    return (
      <button
        type="button"
        onClick={() => onSelect(product)}
        className={cn(
          "bg-card hover:bg-accent/50 focus-visible:ring-ring relative flex w-full items-center gap-3 rounded-xl border p-2 text-start transition focus-visible:ring-2 focus-visible:outline-none",
          out && "opacity-70",
        )}
      >
        <Thumb
          image={image}
          alt={product.name}
          className="size-14 shrink-0 rounded-lg"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{product.name}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {meta}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-semibold tabular-nums">
            {formatDZD(product.selling_price, symbol)}
          </span>
          {!isService && (
            <PosStockPill stock={stock} minStock={product.min_stock} />
          )}
          {product.variant_count > 0 && (
            <Badge variant="secondary" className="gap-1">
              <Layers className="size-3" />
              {t("pos.variantsCount", { count: product.variant_count })}
            </Badge>
          )}
        </div>
        {favBtn}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className={cn(
        "bg-card hover:border-primary/40 focus-visible:ring-ring relative flex flex-col overflow-hidden rounded-xl border text-start transition hover:shadow-md focus-visible:ring-2 focus-visible:outline-none",
        out && "opacity-70",
      )}
    >
      <Thumb
        image={image}
        alt={product.name}
        className="aspect-square w-full"
      />
      {favBtn}
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <p className="line-clamp-2 text-sm leading-tight font-medium">
          {product.name}
        </p>
        {meta}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
          <span className="font-semibold tabular-nums">
            {formatDZD(product.selling_price, symbol)}
          </span>
          {product.variant_count > 0 && (
            <Badge variant="secondary" className="gap-1">
              <Layers className="size-3" />
              {product.variant_count}
            </Badge>
          )}
        </div>
        {!isService && (
          <PosStockPill
            stock={stock}
            minStock={product.min_stock}
            className="self-start"
          />
        )}
      </div>
    </button>
  );
}
