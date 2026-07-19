import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PatientFormPanel } from "@/components/patient-form-panel";

export default function PatientFormPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const patientId = id ? Number(id) : undefined;
  const isEdit = patientId != null;
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-2xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={() => navigate(-1)}
      >
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("common.back")}
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>
            {isEdit ? t("patients.editTitle") : t("patients.newPatient")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PatientFormPanel
            patientId={patientId}
            onSaved={(savedId) => navigate(`/patients/${savedId}`)}
            onCancel={() => navigate(-1)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
