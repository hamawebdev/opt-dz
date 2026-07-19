import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PatientFormPanel } from "@/components/patient-form-panel";
import { useCartStore } from "@/store/use-cart-store";

/**
 * Quick client creation without leaving the POS: the full patient form
 * (simple-mode collapse included) in a dialog; the new client is selected
 * into the current transaction on save.
 */
export function PosNewClientDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("patients.newPatient")}</DialogTitle>
        </DialogHeader>
        <PatientFormPanel
          onSaved={(id, name) => {
            useCartStore.getState().setCustomer(id, name);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
