import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface PromptField {
  name: string;
  label: string;
  type?: "text" | "number" | "date";
  placeholder?: string;
  inputMode?: "numeric" | "decimal" | "text";
  min?: string;
}

/**
 * A proper, labelled replacement for `window.prompt`. Native prompts are the
 * worst pattern for low-literacy users — no persistent label, no validation,
 * and (for dates) demanding a typed format. This dialog gives real labels,
 * a date picker for date fields, and a numeric keypad for numbers.
 */
export function PromptDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  initial,
  confirmText,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: PromptField[];
  initial?: Record<string, string>;
  confirmText?: string;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, string>>({});

  // Seed the inputs each time the dialog opens (not on every parent render).
  useEffect(() => {
    if (!open) return;
    const seed: Record<string, string> = {};
    for (const f of fields) seed[f.name] = initial?.[f.name] ?? "";
    setValues(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function submit() {
    onSubmit(values);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {fields.map((f, i) => (
            <div key={f.name} className="grid gap-1.5">
              <Label htmlFor={`prompt-${f.name}`}>{f.label}</Label>
              <Input
                id={`prompt-${f.name}`}
                type={f.type ?? "text"}
                inputMode={f.inputMode}
                min={f.min}
                placeholder={f.placeholder}
                value={values[f.name] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.name]: e.target.value }))
                }
                autoFocus={i === 0}
              />
            </div>
          ))}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit">{confirmText ?? t("common.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
