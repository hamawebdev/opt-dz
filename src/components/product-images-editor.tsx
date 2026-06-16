import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Upload, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import {
  useImages,
  useAddImage,
  useDeleteImage,
  useSetPrimaryImage,
} from "@/hooks/use-images";
import type { ProductImage } from "@/types";

export function ProductImagesEditor({ productId }: { productId: number }) {
  const { t } = useTranslation();
  const { data: images } = useImages(productId);
  const add = useAddImage();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("photos.imageOnly"));
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await add.mutateAsync({ productId, dataUri: String(reader.result) });
      } catch (err) {
        notifyError(err, t("problem.actionFailed"));
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{t("photos.title")}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={add.isPending}
        >
          <Upload className="size-4" /> {t("photos.add")}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {!images?.length ? (
        <p className="text-muted-foreground py-2 text-sm">{t("photos.none")}</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {images.map((img) => (
            <ImageThumb key={img.id} image={img} productId={productId} />
          ))}
        </div>
      )}
    </div>
  );
}

function ImageThumb({
  image,
  productId,
}: {
  image: ProductImage;
  productId: number;
}) {
  const { t } = useTranslation();
  const del = useDeleteImage();
  const setPrimary = useSetPrimaryImage();

  return (
    <div className="group relative size-24 overflow-hidden rounded-lg border">
      <img src={image.path} alt="" className="size-full object-cover" />
      {image.is_primary === 1 && (
        <span className="bg-primary text-primary-foreground absolute start-1 top-1 rounded px-1 text-[9px]">
          {t("photos.primary")}
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/40 p-1 opacity-0 transition group-hover:opacity-100">
        {image.is_primary !== 1 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 text-white hover:text-white"
            aria-label={t("photos.makePrimary")}
            onClick={() => setPrimary.mutate({ id: image.id, productId })}
          >
            <Star className="size-3.5" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 text-white hover:text-white"
          aria-label={t("photos.delete")}
          onClick={() => del.mutate(image.id)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
