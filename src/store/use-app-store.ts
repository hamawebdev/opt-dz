import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import i18n, { DEFAULT_LANGUAGE, type Language } from "@/lib/i18n";

type Theme = "light" | "dark" | "system";

interface AppState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  language: Language;
  setLanguage: (language: Language) => void;
  /** First-run flag: false until the setup wizard is completed or skipped. */
  onboarded: boolean;
  setOnboarded: (onboarded: boolean) => void;
  /**
   * "Simple mode" hides advanced modules (suppliers, insurance, reports) and
   * extra detail to lower cognitive load for low-literacy staff. Reversible
   * from Settings.
   */
  simpleMode: boolean;
  setSimpleMode: (simpleMode: boolean) => void;
  /** The staff member currently at the till — stamped onto the audit log. */
  currentStaffId: number | null;
  currentStaffName: string | null;
  setCurrentStaff: (id: number | null, name: string | null) => void;
}

/**
 * Global UI state, persisted to localStorage. Swap the storage for
 * `@tauri-apps/plugin-store` if you need it persisted outside the webview.
 */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: "system",
      setTheme: (theme) => set({ theme }),
      language: DEFAULT_LANGUAGE,
      setLanguage: (language) => {
        void i18n.changeLanguage(language);
        set({ language });
      },
      onboarded: false,
      setOnboarded: (onboarded) => set({ onboarded }),
      simpleMode: false,
      setSimpleMode: (simpleMode) => set({ simpleMode }),
      currentStaffId: null,
      currentStaffName: null,
      setCurrentStaff: (currentStaffId, currentStaffName) =>
        set({ currentStaffId, currentStaffName }),
    }),
    {
      name: "app-store",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** Convenience selector for the simple-mode flag. */
export const useSimpleMode = () => useAppStore((s) => s.simpleMode);
