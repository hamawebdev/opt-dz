import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createJob,
  listJobs,
  listJobsForPatient,
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
    mutationFn: (args: { id: number; status: JobStatus }) =>
      updateJobStatus(args.id, args.status),
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
