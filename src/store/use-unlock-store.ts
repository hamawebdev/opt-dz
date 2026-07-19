import { create } from "zustand";

interface UnlockState {
  /** True once the shop password has been entered in THIS run of the app. */
  unlocked: boolean;
  unlock: () => void;
  lock: () => void;
}

/**
 * Manager-unlock flag for the gated sections (inventory, reports, settings).
 *
 * A plain store with no persist middleware and no localStorage, deliberately:
 * the unlock has to die with the process, so the next person to open the app on
 * a shared till starts locked.
 *
 * Kept out of use-app-store (which is wrapped in `persist`) so that guarantee is
 * structural — this module imports nothing that can write to disk — rather than
 * a `partialize` option someone later "tidies up" into a silent security
 * regression with no test to catch it.
 */
export const useUnlockStore = create<UnlockState>((set) => ({
  unlocked: false,
  unlock: () => set({ unlocked: true }),
  lock: () => set({ unlocked: false }),
}));
