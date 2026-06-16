import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSettings, saveSettings } from "@/db/settings";
import type { ShopSettings } from "@/types";

const KEY = ["settings"];

export function useSettings() {
  return useQuery({ queryKey: KEY, queryFn: getSettings, staleTime: 60_000 });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<ShopSettings>) => saveSettings(settings),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
