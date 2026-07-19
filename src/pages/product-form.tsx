import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowLeft, ChevronDown, Sparkles, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSimpleMode } from "@/store/use-app-store";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ManageSelect } from "@/components/manage-select";
import { ColorPicker } from "@/components/color-picker";
import {
  useCreateProduct,
  useProduct,
  useUpdateProduct,
} from "@/hooks/use-inventory";
import {
  useBrandRows,
  useCategories,
  useCreateBrand,
  useCreateCategory,
} from "@/hooks/use-taxonomy";
import { useCreateSupplier, useSuppliers } from "@/hooks/use-suppliers";
import { useAttributesForProduct } from "@/hooks/use-attributes";
import { setProductValues } from "@/db/attributes";
import {
  ProductAttributeFields,
  buildAttributeInputs,
  type AttrValues,
} from "@/components/product-attribute-fields";
import { LabelDesignerDialog } from "@/components/label-designer/label-designer-dialog";
import { ProductVariantsEditor } from "@/components/product-variants-editor";
import { ProductImagesEditor } from "@/components/product-images-editor";
import { generateEan13 } from "@/lib/barcode";
import { toCentimes, fromCentimes } from "@/lib/format";
import type { ItemType, ProductCategory } from "@/types";

const buildSchema = (t: TFunction) =>
  z.object({
    item_type: z.enum(["product", "service"]),
    category: z.enum(["frame", "lens", "accessory"]),
    name: z.string().trim().min(1, t("validation.nameRequired")),
    reference: z.string().trim().optional(),
    barcode: z.string().trim().optional(),
    expiry_date: z.string().trim().optional(),
    category_id: z.string().nullable().optional(),
    brand_id: z.string().nullable().optional(),
    supplier_id: z.string().nullable().optional(),
    color_id: z.string().nullable().optional(),
    purchase_price: z.number().min(0).optional(),
    selling_price: z.number().min(0).optional(),
    quantity: z.number().int().min(0).optional(),
    min_stock: z.number().int().min(0),
  });

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

const typeOptions: ProductCategory[] = ["frame", "lens", "accessory"];

/** Number input that mirrors the existing dinar-entry pattern used across forms. */
function numberProps(field: {
  name: string;
  ref: React.Ref<HTMLInputElement>;
  onBlur: () => void;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return {
    type: "number" as const,
    min: "0",
    step: "1",
    name: field.name,
    ref: field.ref,
    onBlur: field.onBlur,
    // Render blank (not 0) when empty so the user types straight into a clear field.
    value: field.value ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      field.onChange(
        e.target.value === "" ? undefined : Number(e.target.value),
      ),
  };
}

export default function ProductFormPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const productId = id ? Number(id) : undefined;
  const isEdit = productId != null;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetCategory = params.get("category") as ProductCategory | null;

  const { data: product } = useProduct(productId);
  const create = useCreateProduct();
  const update = useUpdateProduct();

  // Simple mode: a new product needs only type, name, barcode, price and
  // quantity. The rest sits behind "More details" (hidden fields keep their
  // values on submit). Editing always shows everything.
  const simpleMode = useSimpleMode();
  const [showMore, setShowMore] = useState(false);
  const expanded = !simpleMode || isEdit || showMore;

  const { data: categories } = useCategories();
  const { data: brands } = useBrandRows();
  const { data: suppliers } = useSuppliers();
  const createCategory = useCreateCategory();
  const createBrand = useCreateBrand();
  const createSupplier = useCreateSupplier();

  const schema = useMemo(() => buildSchema(t), [t]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      item_type: "product",
      category: presetCategory ?? "frame",
      name: "",
      reference: "",
      barcode: "",
      expiry_date: "",
      category_id: null,
      brand_id: null,
      supplier_id: null,
      color_id: null,
      purchase_price: undefined,
      selling_price: undefined,
      quantity: undefined,
      min_stock: 1,
    },
  });

  const itemType = form.watch("item_type") as ItemType;
  const isService = itemType === "service";
  const optType = form.watch("category") as ProductCategory;
  const catIdStr = form.watch("category_id");

  // Dynamic attributes applicable to this product's type + managed category.
  const { data: resolvedAttrs } = useAttributesForProduct({
    type: optType,
    categoryId: catIdStr ? Number(catIdStr) : null,
    productId,
    enabled: !isService,
  });
  const [attrValues, setAttrValues] = useState<AttrValues>({});
  const [labelOpen, setLabelOpen] = useState(false);

  // Seed values for newly-applicable attributes without clobbering user edits.
  useEffect(() => {
    if (!resolvedAttrs) return;
    setAttrValues((prev) => {
      const next = { ...prev };
      for (const a of resolvedAttrs) {
        if (!(a.id in next)) next[a.id] = a.value;
      }
      return next;
    });
  }, [resolvedAttrs]);

  useEffect(() => {
    if (product) {
      form.reset({
        item_type: product.item_type,
        category: product.category,
        name: product.name,
        reference: product.reference ?? "",
        barcode: product.barcode ?? "",
        expiry_date: product.expiry_date ?? "",
        category_id:
          product.category_id != null ? String(product.category_id) : null,
        brand_id: product.brand_id != null ? String(product.brand_id) : null,
        supplier_id:
          product.supplier_id != null ? String(product.supplier_id) : null,
        color_id: product.color_id != null ? String(product.color_id) : null,
        purchase_price: fromCentimes(product.purchase_price),
        selling_price: fromCentimes(product.selling_price),
        quantity: product.quantity,
        min_stock: product.min_stock,
      });
    }
  }, [product, form]);

  const categoryOpts = useMemo(
    () =>
      (categories ?? []).map((c) => ({ value: String(c.id), label: c.name })),
    [categories],
  );
  const brandOpts = useMemo(
    () => (brands ?? []).map((b) => ({ value: String(b.id), label: b.name })),
    [brands],
  );
  const supplierOpts = useMemo(
    () =>
      (suppliers ?? []).map((s) => ({ value: String(s.id), label: s.name })),
    [suppliers],
  );

  async function onSubmit(values: FormValues) {
    const brandName =
      brands?.find((b) => String(b.id) === values.brand_id)?.name ?? null;
    const supplierName =
      suppliers?.find((s) => String(s.id) === values.supplier_id)?.name ?? null;

    // Keep the legacy text columns in sync as a denormalized mirror.
    const input = {
      item_type: values.item_type,
      category: values.category,
      name: values.name,
      reference: values.reference || null,
      barcode: values.barcode || null,
      expiry_date: values.expiry_date || null,
      brand: brandName,
      supplier: supplierName,
      category_id: values.category_id ? Number(values.category_id) : null,
      brand_id: values.brand_id ? Number(values.brand_id) : null,
      supplier_id: values.supplier_id ? Number(values.supplier_id) : null,
      color_id: values.color_id ? Number(values.color_id) : null,
      purchase_price: toCentimes(values.purchase_price ?? 0),
      selling_price: toCentimes(values.selling_price ?? 0),
      quantity: values.quantity ?? 0,
      min_stock: values.min_stock,
    };
    try {
      let savedId = productId;
      if (isEdit) {
        await update.mutateAsync({ id: productId, input });
        toast.success(t("inventory.productUpdated"));
      } else {
        savedId = await create.mutateAsync(input);
        toast.success(t("inventory.productCreated"));
      }
      // Persist dynamic attribute values (products only).
      if (savedId && !isService && resolvedAttrs) {
        await setProductValues(
          savedId,
          buildAttributeInputs(resolvedAttrs, attrValues),
        );
      }
      navigate("/inventory");
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={() => navigate("/inventory")}
      >
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.inventory")}
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>
            {isEdit ? t("inventory.editTitle") : t("inventory.newProduct")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Product / Service toggle */}
              <FormField
                control={form.control}
                name="item_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inventory.itemType")}</FormLabel>
                    <div className="flex gap-2">
                      {(["product", "service"] as const).map((it) => (
                        <Button
                          key={it}
                          type="button"
                          variant={field.value === it ? "default" : "outline"}
                          onClick={() => field.onChange(it)}
                        >
                          {t(
                            it === "product"
                              ? "inventory.typeProduct"
                              : "inventory.typeService",
                          )}
                        </Button>
                      ))}
                    </div>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {!isService && (
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("inventory.typeLabel")}</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {typeOptions.map((c) => (
                              <SelectItem key={c} value={c}>
                                {t(`category.${c}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("inventory.nameLabel")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("inventory.namePlaceholder")}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {expanded && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="category_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("inventory.category")}</FormLabel>
                        <ManageSelect
                          options={categoryOpts}
                          value={field.value ?? null}
                          onChange={field.onChange}
                          onCreate={async (name) =>
                            String(await createCategory.mutateAsync(name))
                          }
                          placeholder={t("inventory.selectCategory")}
                          addLabel={t("inventory.addCategory")}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="brand_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("inventory.brand")}</FormLabel>
                        <ManageSelect
                          options={brandOpts}
                          value={field.value ?? null}
                          onChange={field.onChange}
                          onCreate={async (name) =>
                            String(await createBrand.mutateAsync(name))
                          }
                          placeholder={t("inventory.selectBrand")}
                          addLabel={t("inventory.addBrand")}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {expanded && (
                  <FormField
                    control={form.control}
                    name="reference"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("inventory.referenceCode")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("inventory.referencePlaceholder")}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {!isService && (
                  <FormField
                    control={form.control}
                    name="barcode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("inventory.barcode")}</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input
                              placeholder={t("inventory.barcodePlaceholder")}
                              {...field}
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              field.onChange(
                                generateEan13(productId ?? Date.now()),
                              )
                            }
                          >
                            <Sparkles className="size-4" />{" "}
                            {t("inventory.generate")}
                          </Button>
                          {isEdit && field.value && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setLabelOpen(true)}
                            >
                              <Printer className="size-4" />{" "}
                              {t("inventory.printLabel")}
                            </Button>
                          )}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {expanded && !isService && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="supplier_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("inventory.supplier")}</FormLabel>
                        <ManageSelect
                          options={supplierOpts}
                          value={field.value ?? null}
                          onChange={field.onChange}
                          onCreate={async (name) =>
                            String(await createSupplier.mutateAsync({ name }))
                          }
                          placeholder={t("inventory.selectSupplier")}
                          addLabel={t("inventory.addSupplier")}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="expiry_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("inventory.expiryDate")}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Product-level colour (simple products). Lenses have no colour;
                  variant products set colour per row in the variants editor. */}
              {expanded && !isService && optType !== "lens" && (
                <FormField
                  control={form.control}
                  name="color_id"
                  render={({ field }) => (
                    <FormItem className="sm:max-w-[calc(50%-0.5rem)]">
                      <FormLabel>{t("colors.label")}</FormLabel>
                      <ColorPicker
                        value={field.value ? Number(field.value) : null}
                        onChange={(id) =>
                          field.onChange(id != null ? String(id) : null)
                        }
                      />
                      <FormDescription>
                        {t("colors.askManager")}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="grid grid-cols-2 gap-4">
                {expanded && (
                  <FormField
                    control={form.control}
                    name="purchase_price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("inventory.purchasePrice")}</FormLabel>
                        <FormControl>
                          <Input {...numberProps(field)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name="selling_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("inventory.sellingPrice")}</FormLabel>
                      <FormControl>
                        <Input {...numberProps(field)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {!isService && (
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {isEdit
                            ? t("inventory.quantityInStock")
                            : t("inventory.initialQuantity")}
                        </FormLabel>
                        <FormControl>
                          <Input {...numberProps(field)} disabled={isEdit} />
                        </FormControl>
                        {isEdit && (
                          <FormDescription>
                            {t("inventory.recordDeliveryHint")}
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {expanded && (
                    <FormField
                      control={form.control}
                      name="min_stock"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t("inventory.lowStockThreshold")}
                          </FormLabel>
                          <FormControl>
                            <Input {...numberProps(field)} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              )}

              {expanded &&
                !isService &&
                resolvedAttrs &&
                resolvedAttrs.length > 0 && (
                  <div className="space-y-3 rounded-lg border p-4">
                    <h3 className="text-sm font-medium">
                      {t("inventory.attributes")}
                    </h3>
                    <ProductAttributeFields
                      attributes={resolvedAttrs}
                      values={attrValues}
                      onChange={(id, val) =>
                        setAttrValues((p) => ({ ...p, [id]: val }))
                      }
                    />
                  </div>
                )}

              {isEdit && !isService && productId != null && (
                <>
                  <ProductVariantsEditor productId={productId} />
                  <ProductImagesEditor productId={productId} />
                </>
              )}

              {simpleMode && !isEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setShowMore((v) => !v)}
                >
                  <ChevronDown
                    className={cn(
                      "me-1 size-4 transition-transform",
                      showMore && "rotate-180",
                    )}
                  />
                  {t(showMore ? "common.fewerDetails" : "common.moreDetails")}
                </Button>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/inventory")}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={create.isPending || update.isPending}
                >
                  {isEdit
                    ? t("patients.saveChanges")
                    : t("inventory.createProduct")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {product && (
        <LabelDesignerDialog
          products={labelOpen ? [product] : null}
          open={labelOpen}
          onOpenChange={setLabelOpen}
        />
      )}
    </div>
  );
}
