import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ColorSwatch } from "@/components/color-swatch";
import { useColors } from "@/hooks/use-colors";
import { colorLabel } from "@/db/colors";

/**
 * Searchable colour picker backed by the centralized colour vocabulary. Shows a
 * swatch + the colour name in the active language. Colours are admin-managed, so
 * there is intentionally NO "create" affordance here — when the needed colour is
 * missing, staff are pointed at the manager (see `askManager` hint upstream).
 *
 * Search matches across the canonical name and both translations, so typing
 * "noir", "black" or "أسود" all find the same colour.
 */
export function ColorPicker({
  value,
  onChange,
  disabled,
  allowClear = true,
  className,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { data: colors } = useColors();
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => colors?.find((c) => c.id === value) ?? null,
    [colors, value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected && <ColorSwatch hex={selected.hex} />}
            <span className="truncate">
              {selected ? colorLabel(selected, lang) : t("colors.pick")}
            </span>
          </span>
          <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command
          filter={(val, search) =>
            val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={t("common.search")} />
          <CommandList>
            <CommandEmpty>{t("colors.askManager")}</CommandEmpty>
            {allowClear && value != null && (
              <CommandItem
                value="__clear__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <span className="text-muted-foreground">
                  {t("common.none")}
                </span>
              </CommandItem>
            )}
            <CommandGroup>
              {(colors ?? []).map((c) => (
                <CommandItem
                  // Searchable across canonical + both translations.
                  key={c.id}
                  value={`${c.name} ${c.name_fr ?? ""} ${c.name_ar ?? ""}`}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "me-2 size-4",
                      value === c.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <ColorSwatch hex={c.hex} className="me-2" />
                  <span className="truncate">{colorLabel(c, lang)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
