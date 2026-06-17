import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseOptions } from "@/db/attributes";
import type { AttributeValueInput } from "@/db/attributes";
import { cn } from "@/lib/utils";
import type { ResolvedAttribute } from "@/types";

export type AttrValue = string | number | string[] | null;
export type AttrValues = Record<number, AttrValue>;

/** Converts the current values map into the shape `setProductValues` expects. */
export function buildAttributeInputs(
  attributes: ResolvedAttribute[],
  values: AttrValues,
): AttributeValueInput[] {
  return attributes.map((a) => ({
    attribute_id: a.id,
    field_type: a.field_type,
    value: values[a.id] ?? (a.field_type === "multiselect" ? [] : null),
  }));
}

const NONE = "__none__";

export function ProductAttributeFields({
  attributes,
  values,
  onChange,
}: {
  attributes: ResolvedAttribute[];
  values: AttrValues;
  onChange: (id: number, value: AttrValue) => void;
}) {
  if (!attributes.length) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {attributes.map((a) => {
        const opts = parseOptions(a);
        const v = values[a.id];
        return (
          <div key={a.id} className="grid gap-1.5">
            <Label>
              {a.label}
              {a.unit ? (
                <span className="text-muted-foreground"> ({a.unit})</span>
              ) : null}
            </Label>

            {a.field_type === "text" && (
              <Input
                value={(v as string) ?? ""}
                onChange={(e) => onChange(a.id, e.target.value)}
              />
            )}

            {a.field_type === "number" && (
              <Input
                type="number"
                step="any"
                value={v == null ? "" : String(v)}
                onChange={(e) =>
                  onChange(
                    a.id,
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
            )}

            {a.field_type === "select" && (
              <Select
                value={(v as string) || NONE}
                onValueChange={(val) =>
                  onChange(a.id, val === NONE ? null : val)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {opts.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {a.field_type === "multiselect" && (
              <div className="flex flex-wrap gap-1.5">
                {opts.map((o) => {
                  const arr = Array.isArray(v) ? (v as string[]) : [];
                  const on = arr.includes(o);
                  return (
                    <Button
                      key={o}
                      type="button"
                      size="sm"
                      variant={on ? "default" : "outline"}
                      className={cn("h-7", on && "font-medium")}
                      onClick={() =>
                        onChange(
                          a.id,
                          on ? arr.filter((x) => x !== o) : [...arr, o],
                        )
                      }
                    >
                      {o}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
