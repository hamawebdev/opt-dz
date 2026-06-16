import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPatient,
  deletePatient,
  getPatient,
  getPatientStatement,
  getPatientSummary,
  listPatients,
  updatePatient,
  type PatientFilters,
  type PatientInput,
} from "@/db/patients";
import {
  createPrescription,
  deletePrescription,
  listPrescriptions,
  type PrescriptionInput,
} from "@/db/prescriptions";
import { logActivity } from "@/db/activity";

export const patientKeys = {
  all: ["patients"] as const,
  list: (filters: PatientFilters) => ["patients", "list", filters] as const,
  detail: (id: number) => ["patients", "detail", id] as const,
  summary: (id: number) => ["patients", "summary", id] as const,
  prescriptions: (patientId: number) => ["prescriptions", patientId] as const,
};

export function usePatients(filters: PatientFilters = {}) {
  return useQuery({
    queryKey: patientKeys.list(filters),
    queryFn: () => listPatients(filters),
  });
}

export function usePatientSummary(id: number | undefined) {
  return useQuery({
    queryKey: patientKeys.summary(id ?? 0),
    queryFn: () => getPatientSummary(id as number),
    enabled: id != null,
  });
}

export function usePatientStatement(
  id: number | undefined,
  range?: { from?: string; to?: string },
) {
  return useQuery({
    queryKey: ["patients", "statement", id ?? 0, range ?? {}],
    queryFn: () => getPatientStatement(id as number, range),
    enabled: id != null,
  });
}

export function usePatient(id: number | undefined) {
  return useQuery({
    queryKey: patientKeys.detail(id ?? 0),
    queryFn: () => getPatient(id as number),
    enabled: id != null,
  });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PatientInput) => createPatient(input),
    onSuccess: (newId) => {
      void logActivity(newId, "created");
      qc.invalidateQueries({ queryKey: patientKeys.all });
    },
  });
}

export function useUpdatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: PatientInput }) =>
      updatePatient(id, input),
    onSuccess: (_res, { id }) => {
      void logActivity(id, "edited");
      qc.invalidateQueries({ queryKey: patientKeys.all });
      qc.invalidateQueries({ queryKey: ["patient-activity", id] });
    },
  });
}

export function useDeletePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deletePatient(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: patientKeys.all }),
  });
}

export function usePrescriptions(patientId: number | undefined) {
  return useQuery({
    queryKey: patientKeys.prescriptions(patientId ?? 0),
    queryFn: () => listPrescriptions(patientId as number),
    enabled: patientId != null,
  });
}

export function useCreatePrescription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PrescriptionInput) => createPrescription(input),
    onSuccess: (id, input) => {
      void logActivity(input.patient_id, "prescription", null, id);
      qc.invalidateQueries({ queryKey: patientKeys.prescriptions(input.patient_id) });
      qc.invalidateQueries({ queryKey: ["patient-activity", input.patient_id] });
    },
  });
}

export function useDeletePrescription(patientId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deletePrescription(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: patientKeys.prescriptions(patientId) }),
  });
}
