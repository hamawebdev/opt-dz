import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { notifyError } from "@/lib/errors";
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

export interface ManageOption {
  value: string;
  label: string;
}

interface ManageSelectProps {
  options: ManageOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  /** Creates a new entity from the typed name and returns its new id as a string. */
  onCreate: (name: string) => Promise<string>;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Label for the inline create row, e.g. 'Add category'. */
  addLabel?: string;
  className?: string;
  disabled?: boolean;
  allowClear?: boolean;
}

/**
 * Searchable single-select with an inline "+ Add <typed>" action that creates a
 * new managed entity (category / brand / supplier) and selects it. Builds on the
 * same Popover + Command combobox as `SearchSelect`.
 */
export function ManageSelect({
  options,
  value,
  onChange,
  onCreate,
  placeholder,
  searchPlaceholder,
  addLabel,
  className,
  disabled,
  allowClear = true,
}: ManageSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const selected = options.find((o) => o.value === value);
  const trimmed = query.trim();
  const exists = options.some(
    (o) => o.label.toLowerCase() === trimmed.toLowerCase(),
  );

  async function handleCreate() {
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const newId = await onCreate(trimmed);
      onChange(newId);
      setQuery("");
      setOpen(false);
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    } finally {
      setCreating(false);
    }
  }

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
          <span className="truncate">
            {selected ? selected.label : (placeholder ?? t("searchSelect.select"))}
          </span>
          <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder={searchPlaceholder ?? t("common.search")}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {trimmed ? (
                <button
                  type="button"
                  className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
                  onClick={handleCreate}
                  disabled={creating}
                >
                  <Plus className="size-4" />
                  {(addLabel ?? t("manageSelect.add")) + ` "${trimmed}"`}
                </button>
              ) : (
                t("searchSelect.noResults")
              )}
            </CommandEmpty>
            {allowClear && value != null && (
              <CommandItem
                value="__clear__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <span className="text-muted-foreground">{t("common.none")}</span>
              </CommandItem>
            )}
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "me-2 size-4",
                      value === opt.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{opt.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {trimmed && !exists && (
              <CommandGroup>
                <CommandItem
                  value={`__create__${trimmed}`}
                  onSelect={handleCreate}
                  disabled={creating}
                >
                  <Plus className="me-2 size-4" />
                  {(addLabel ?? t("manageSelect.add")) + ` "${trimmed}"`}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
