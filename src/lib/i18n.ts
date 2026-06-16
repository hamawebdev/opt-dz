import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en/translation.json";
import fr from "@/locales/fr/translation.json";
import ar from "@/locales/ar/translation.json";

export const SUPPORTED_LANGUAGES = ["fr", "ar", "en"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = "fr";

/** Languages that render right-to-left. */
export const RTL_LANGUAGES: Language[] = ["ar"];

export function isRtl(lang: string): boolean {
  return RTL_LANGUAGES.includes(lang as Language);
}

/**
 * Reads the persisted language from the zustand store's localStorage entry
 * before React mounts, so the very first paint is already in the right language.
 * The store (use-app-store) owns this value; we only peek at it here to avoid a
 * circular import at module-init time.
 */
function readPersistedLanguage(): Language {
  try {
    const raw = localStorage.getItem("app-store");
    if (!raw) return DEFAULT_LANGUAGE;
    const lang = JSON.parse(raw)?.state?.language;
    return SUPPORTED_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
    ar: { translation: ar },
  },
  lng: readPersistedLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  interpolation: { escapeValue: false },
});

export default i18n;
