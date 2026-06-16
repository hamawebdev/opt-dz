import { cn } from "@/lib/utils";

/**
 * A small colour chip. When `hex` is null (multi/transparent colours) it renders a
 * neutral checkered placeholder so the absence of a single swatch is still visible.
 */
export function ColorSwatch({
  hex,
  className,
}: {
  hex: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-4 shrink-0 rounded-full border",
        !hex && "bg-[length:8px_8px] bg-[position:0_0,4px_4px]",
        className,
      )}
      style={
        hex
          ? { backgroundColor: hex }
          : {
              backgroundImage:
                "linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%)",
            }
      }
    />
  );
}
