import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowLeft, ChevronDown, X } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useSimpleMode } from "@/store/use-app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { SearchSelect } from "@/components/search-select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { HelpHint } from "@/components/help-hint";
import {
  ProductAttributeFields,
  buildAttributeInputs,
  type AttrValue,
  type AttrValues,
} from "@/components/product-attribute-fields";
import {
  useCreatePatient,
  usePatient,
  useUpdatePatient,
} from "@/hooks/use-patients";
import { usePayers } from "@/hooks/use-payers";
import { useAttributesForPatient } from "@/hooks/use-attributes";
import { findPatientDuplicates } from "@/db/patients";
import { setPatientValues } from "@/db/attributes";
import type { PatientInput } from "@/db/patients";
import { isEmail, isNin, isPhone } from "@/lib/validators";

const optionalPhone = (t: TFunction) =>
  z.string().trim().refine(isPhone, t("validation.invalidPhone"));

const buildSchema = (t: TFunction) =>
  z.object({
    full_name: z.string().trim().min(1, t("validation.nameRequired")),
    phone: optionalPhone(t),
    phone2: optionalPhone(t),
    email: z.string().trim().refine(isEmail, t("validation.invalidEmail")),
    address: z.string().trim().optional(),
    date_of_birth: z.string().trim().optional(),
    national_id: z
      .string()
      .trim()
      .refine(isNin, t("validation.invalidNationalId")),
    default_payer_id: z.string().optional(),
    coverage_pct: z.string().optional(),
    insurance_policy_no: z.string().trim().optional(),
    photo: z.string().optional(),
    notes: z.string().trim().optional(),
  });

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

const empty: FormValues = {
  full_name: "",
  phone: "",
  phone2: "",
  email: "",
  address: "",
  date_of_birth: "",
  national_id: "",
  default_payer_id: "",
  coverage_pct: "",
  insurance_policy_no: "",
  photo: "",
  notes: "",
};

function toInput(values: FormValues): PatientInput {
  const payerId = values.default_payer_id
    ? Number(values.default_payer_id)
    : null;
  return {
    full_name: values.full_name,
    phone: values.phone || null,
    phone2: values.phone2 || null,
    email: values.email || null,
    address: values.address || null,
    date_of_birth: values.date_of_birth || null,
    national_id: values.national_id || null,
    default_payer_id: payerId,
    default_coverage_pct: payerId
      ? Math.round((Number(values.coverage_pct) || 0) * 100)
      : 0,
    insurance_policy_no: values.insurance_policy_no || null,
    photo: values.photo || null,
    notes: values.notes || null,
  };
}

export default function PatientFormPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const patientId = id ? Number(id) : undefined;
  const isEdit = patientId != null;
  const navigate = useNavigate();

  const { data: patient } = usePatient(patientId);
  const { data: payers } = usePayers();
  const { data: customFields } = useAttributesForPatient(patientId);
  const create = useCreatePatient();
  const update = useUpdatePatient();

  // Simple mode: a new patient needs only a name and phone. Everything else
  // sits behind "More details" (hidden fields keep their values on submit).
  // Editing always shows everything so existing data is never out of sight.
  const simpleMode = useSimpleMode();
  const [showMore, setShowMore] = useState(false);
  const expanded = !simpleMode || isEdit || showMore;

  const [attrValues, setAttrValues] = useState<AttrValues>({});
  // Seed values for applicable custom fields without clobbering user edits.
  useEffect(() => {
    if (!customFields) return;
    setAttrValues((prev) => {
      const next = { ...prev };
      for (const a of customFields) if (!(a.id in next)) next[a.id] = a.value;
      return next;
    });
  }, [customFields]);

  const fileRef = useRef<HTMLInputElement>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupNames, setDupNames] = useState<string[]>([]);
  const pendingValues = useRef<FormValues | null>(null);

  const schema = useMemo(() => buildSchema(t), [t]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: empty,
  });

  useEffect(() => {
    if (patient) {
      form.reset({
        full_name: patient.full_name,
        phone: patient.phone ?? "",
        phone2: patient.phone2 ?? "",
        email: patient.email ?? "",
        address: patient.address ?? "",
        date_of_birth: patient.date_of_birth ?? "",
        national_id: patient.national_id ?? "",
        default_payer_id: patient.default_payer_id
          ? String(patient.default_payer_id)
          : "",
        coverage_pct: patient.default_coverage_pct
          ? String(patient.default_coverage_pct / 100)
          : "",
        insurance_policy_no: patient.insurance_policy_no ?? "",
        photo: patient.photo ?? "",
        notes: patient.notes ?? "",
      });
    }
  }, [patient, form]);

  const payerOptions = useMemo(
    () => (payers ?? []).map((p) => ({ value: String(p.id), label: p.name })),
    [payers],
  );

  function selectPayer(value: string) {
    form.setValue("default_payer_id", value);
    // Pre-fill coverage from the payer's default when none entered yet.
    if (value && !form.getValues("coverage_pct")) {
      const p = payers?.find((x) => String(x.id) === value);
      if (p)
        form.setValue("coverage_pct", String(p.default_coverage_pct / 100));
    }
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => form.setValue("photo", String(reader.result));
    reader.readAsDataURL(file);
  }

  async function persist(values: FormValues) {
    try {
      const savedId = isEdit
        ? (await update.mutateAsync({ id: patientId, input: toInput(values) }),
          patientId)
        : await create.mutateAsync(toInput(values));
      if (customFields?.length) {
        await setPatientValues(
          savedId,
          buildAttributeInputs(customFields, attrValues),
        );
      }
      toast.success(isEdit ? t("patients.updated") : t("patients.created"));
      navigate(`/patients/${savedId}`);
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  async function onSubmit(values: FormValues) {
    // Duplicate guard on creation: warn (allow override) on matching phone/NIN.
    if (!isEdit && (values.phone || values.national_id)) {
      const dups = await findPatientDuplicates(
        values.phone || null,
        values.national_id || null,
      );
      if (dups.length) {
        pendingValues.current = values;
        setDupNames(
          dups.map((d) => `${d.full_name}${d.code ? ` (${d.code})` : ""}`),
        );
        setDupOpen(true);
        return;
      }
    }
    await persist(values);
  }

  const photo = form.watch("photo");
  const payerSelected = !!form.watch("default_payer_id");

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
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {expanded && (
                <div className="flex items-center gap-4">
                  {photo ? (
                    <img
                      src={photo}
                      alt=""
                      className="size-16 rounded-full object-cover"
                    />
                  ) : (
                    <div className="bg-muted size-16 rounded-full" />
                  )}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileRef.current?.click()}
                    >
                      {t("patients.photo")}
                    </Button>
                    {photo && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => form.setValue("photo", "")}
                      >
                        <X className="size-4" />
                      </Button>
                    )}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onPhoto}
                    />
                  </div>
                </div>
              )}

              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("patients.fullName")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("patients.fullNamePlaceholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("common.phone")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("patients.phonePlaceholder")}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {expanded && (
                  <FormField
                    control={form.control}
                    name="phone2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("patients.phone2")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("patients.phonePlaceholder")}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {simpleMode && !isEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setShowMore((v) => !v)}
                >
                  <ChevronDown
                    className={cn(
                      "me-1 size-4 transition-transform",
                      showMore && "rotate-180",
                    )}
                  />
                  {t(showMore ? "common.fewerDetails" : "common.moreDetails")}
                </Button>
              )}

              {expanded && (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("patients.email")}</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="nom@example.com"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="date_of_birth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("patients.dateOfBirth")}</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="national_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          {t("patients.nationalId")}
                          <HelpHint text={t("help.nin")} />
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("patients.nationalIdPlaceholder")}
                            inputMode="numeric"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("common.address")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("patients.addressPlaceholder")}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Insurance: default payer carried onto new sales. */}
                  <div className="space-y-4 rounded-lg border p-4">
                    <p className="text-sm font-medium">
                      {t("patients.insurance")}
                    </p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="default_payer_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("patients.insurer")}</FormLabel>
                            <SearchSelect
                              options={payerOptions}
                              value={field.value || null}
                              onChange={selectPayer}
                              placeholder={t("common.none")}
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {payerSelected && (
                        <FormField
                          control={form.control}
                          name="coverage_pct"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("patients.coveragePct")}</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                    {payerSelected && (
                      <FormField
                        control={form.control}
                        name="insurance_policy_no"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("patients.policyNo")}</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  {!!customFields?.length && (
                    <div className="space-y-3 rounded-lg border p-4">
                      <p className="text-sm font-medium">
                        {t("patients.customFields")}
                      </p>
                      <ProductAttributeFields
                        attributes={customFields}
                        values={attrValues}
                        onChange={(id: number, value: AttrValue) =>
                          setAttrValues((p) => ({ ...p, [id]: value }))
                        }
                      />
                    </div>
                  )}
                </>
              )}

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.notes")}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder={t("patients.notesPlaceholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(-1)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={create.isPending || update.isPending}
                >
                  {isEdit
                    ? t("patients.saveChanges")
                    : t("patients.createPatient")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={dupOpen}
        onOpenChange={setDupOpen}
        destructive={false}
        title={t("patients.duplicateTitle")}
        description={t("patients.duplicateDesc", {
          names: dupNames.join(", "),
        })}
        confirmText={t("patients.duplicateProceed")}
        onConfirm={() => {
          setDupOpen(false);
          if (pendingValues.current) persist(pendingValues.current);
        }}
      />
    </div>
  );
}
