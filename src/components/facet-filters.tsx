import { useTranslation } from "react-i18next";
import { ListFilter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { parseOptions } from "@/db/attributes";
import type { AttributeDefinition } from "@/types";

export type FacetSelection = Record<number, string[]>;

/** A row of attribute-driven facet filters (gender, material, shape, coatings…),
 * each a popover of option checkboxes. Drives EAV catalog filtering. */
export function FacetFilters({
  attributes,
  value,
  onChange,
}: {
  attributes: AttributeDefinition[];
  value: FacetSelection;
  onChange: (next: FacetSelection) => void;
}) {
  const { t } = useTranslation();
  // Only (multi)select attributes with options make useful facets.
  const facetable = attributes.filter(
    (a) => a.field_type === "select" || a.field_type === "multiselect",
  );
  if (!facetable.length) return null;

  const activeCount = Object.values(value).reduce(
    (n, vs) => n + (vs?.length ? 1 : 0),
    0,
  );

  function toggle(attrId: number, opt: string) {
    const cur = value[attrId] ?? [];
    const next = cur.includes(opt)
      ? cur.filter((o) => o !== opt)
      : [...cur, opt];
    onChange({ ...value, [attrId]: next });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground flex items-center gap-1 text-sm">
        <ListFilter className="size-4" />
      </span>
      {facetable.map((a) => {
        const opts = parseOptions(a);
        const selected = value[a.id] ?? [];
        return (
          <Popover key={a.id}>
            <PopoverTrigger asChild>
              <Button
                variant={selected.length ? "secondary" : "outline"}
                size="sm"
                className="h-8"
              >
                {a.label}
                {selected.length > 0 && (
                  <Badge variant="default" className="ms-1 px-1.5">
                    {selected.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56">
              <div className="space-y-2">
                {opts.map((o) => {
                  const id = `facet-${a.id}-${o}`;
                  return (
                    <div key={o} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={selected.includes(o)}
                        onCheckedChange={() => toggle(a.id, o)}
                      />
                      <Label htmlFor={id} className="font-normal">
                        {o}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        );
      })}
      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => onChange({})}
        >
          <X className="size-4" /> {t("common.clear")}
        </Button>
      )}
    </div>
  );
}

/** Converts the popover selection into the `attributes` filter listProducts expects. */
export function facetSelectionToFilters(value: FacetSelection) {
  return Object.entries(value)
    .filter(([, vs]) => vs.length > 0)
    .map(([attribute_id, values]) => ({
      attribute_id: Number(attribute_id),
      values,
    }));
}
