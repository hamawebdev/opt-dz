import { cn } from "@/lib/utils";

/** First letters of the first two words — a face-stand-in for quick recognition. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const text = parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  return text || "؟";
}

/**
 * Shows a patient's photo when available, otherwise their initials. Letting
 * staff recognise people by face/initials rather than reading names is a key
 * low-literacy affordance (see UX review).
 */
export function PatientAvatar({
  name,
  photo,
  className,
}: {
  name: string;
  photo?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "bg-primary/10 text-primary inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold select-none",
        className,
      )}
      aria-hidden="true"
    >
      {photo ? (
        <img src={photo} alt="" className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
