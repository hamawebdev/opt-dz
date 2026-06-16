import { HelpCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A small "?" affordance that reveals a one-sentence, plain-language
 * explanation on tap. Lets labels stay short while help for jargon (TVA,
 * timbre, coverage, NIN…) is one tap away — no reading required up front.
 */
export function HelpHint({
  text,
  label,
  className,
}: {
  /** Already-translated explanation to show. */
  text: string;
  /** Accessible name for the trigger; defaults to the explanation text. */
  label?: string;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={label ?? text}
        className={cn(
          "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex size-6 shrink-0 items-center justify-center rounded-full align-middle outline-none focus-visible:ring-2",
          className,
        )}
      >
        <HelpCircle className="size-4" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 text-sm leading-relaxed font-normal"
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}
