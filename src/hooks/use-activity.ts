import { useQuery } from "@tanstack/react-query";
import { listActivity } from "@/db/activity";

export const activityKey = (patientId: number) =>
  ["patient-activity", patientId] as const;

export function useActivity(patientId: number | undefined) {
  return useQuery({
    queryKey: activityKey(patientId ?? 0),
    queryFn: () => listActivity(patientId as number),
    enabled: patientId != null,
  });
}
