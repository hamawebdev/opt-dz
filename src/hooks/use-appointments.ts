import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAppointment,
  deleteAppointment,
  linkAppointmentPrescription,
  listAppointments,
  listPatientAppointments,
  setAppointmentStatus,
  updateAppointment,
  type AppointmentInput,
} from "@/db/appointments";
import { logActivity } from "@/db/activity";
import type { AppointmentStatus } from "@/types";

export const appointmentKeys = {
  all: ["appointments"] as const,
  range: (from: string, to: string) =>
    ["appointments", "range", from, to] as const,
  patient: (patientId: number) =>
    ["appointments", "patient", patientId] as const,
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: appointmentKeys.all });

export function useAppointments(range: { from: string; to: string }) {
  return useQuery({
    queryKey: appointmentKeys.range(range.from, range.to),
    queryFn: () => listAppointments(range),
  });
}

export function usePatientAppointments(patientId: number | undefined) {
  return useQuery({
    queryKey: appointmentKeys.patient(patientId ?? 0),
    queryFn: () => listPatientAppointments(patientId as number),
    enabled: patientId != null,
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AppointmentInput) => createAppointment(input),
    onSuccess: (id, input) => {
      void logActivity(input.patient_id, "appointment", input.starts_at, id);
      qc.invalidateQueries({ queryKey: ["patient-activity", input.patient_id] });
      invalidate(qc);
    },
  });
}

export function useUpdateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; input: AppointmentInput }) =>
      updateAppointment(args.id, args.input),
    onSuccess: () => invalidate(qc),
  });
}

export function useSetAppointmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; status: AppointmentStatus }) =>
      setAppointmentStatus(args.id, args.status),
    onSuccess: () => invalidate(qc),
  });
}

export function useLinkAppointmentPrescription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; prescriptionId: number }) =>
      linkAppointmentPrescription(args.id, args.prescriptionId),
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteAppointment(id),
    onSuccess: () => invalidate(qc),
  });
}
