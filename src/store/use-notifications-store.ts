import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface NotificationsState {
  /** Ids the owner has dismissed; hidden until the condition recurs with a new id. */
  dismissed: string[];
  dismiss: (id: string) => void;
  dismissMany: (ids: string[]) => void;
  restoreAll: () => void;
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set) => ({
      dismissed: [],
      dismiss: (id) =>
        set((s) => ({ dismissed: [...new Set([...s.dismissed, id])] })),
      dismissMany: (ids) =>
        set((s) => ({ dismissed: [...new Set([...s.dismissed, ...ids])] })),
      restoreAll: () => set({ dismissed: [] }),
    }),
    {
      name: "notifications-store",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
