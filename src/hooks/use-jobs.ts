import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createJob,
  getJob,
  getJobBySale,
  jobStageCounts,
  listJobEvents,
  listJobs,
  listJobsForPatient,
  listLabNames,
  updateJobDetails,
  updateJobStatus,
  type CreateJobInput,
  type JobListFilters,
} from "@/db/jobs";
import type { JobStatus } from "@/types";

export function useJobs(filters: JobListFilters = {}) {
  return useQuery({
    queryKey: ["jobs", "list", filters],
    queryFn: () => listJobs(filters),
  });
}

export function useJob(id: number | undefined) {
  return useQuery({
    queryKey: ["jobs", "detail", id ?? 0],
    queryFn: () => getJob(id as number),
    enabled: id != null,
  });
}

export function useJobEvents(id: number | undefined) {
  return useQuery({
    queryKey: ["jobs", "events", id ?? 0],
    queryFn: () => listJobEvents(id as number),
    enabled: id != null,
  });
}

export function useJobForSale(saleId: number | undefined) {
  return useQuery({
    queryKey: ["jobs", "sale", saleId ?? 0],
    queryFn: () => getJobBySale(saleId as number),
    enabled: saleId != null,
  });
}

export function useJobStageCounts() {
  return useQuery({
    queryKey: ["jobs", "counts"],
    queryFn: jobStageCounts,
  });
}

export function useLabNames() {
  return useQuery({
    queryKey: ["jobs", "labs"],
    queryFn: listLabNames,
  });
}

export function usePatientJobs(patientId: number | undefined) {
  return useQuery({
    queryKey: ["jobs", "patient", patientId ?? 0],
    queryFn: () => listJobsForPatient(patientId as number),
    enabled: patientId != null,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["jobs"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  qc.invalidateQueries({ queryKey: ["notifications"] });
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateJobInput) => createJob(input),
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateJobStatus() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silenceGlobal: true }, // callers notify errors themselves
    mutationFn: (args: { id: number; status: JobStatus; note?: string | null }) =>
      updateJobStatus(args.id, args.status, args.note),
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateJobDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: number;
      input: {
        lab?: string | null;
        expected_ready?: string | null;
        notes?: string | null;
      };
    }) => updateJobDetails(args.id, args.input),
    onSuccess: () => invalidate(qc),
  });
}
