import { useEffect } from "react";
import { useAppStore } from "@/store/use-app-store";
import { isRtl } from "@/lib/i18n";
import { DirectionProvider } from "@/components/ui/direction";

/**
 * Applies the selected language's direction to the document root and provides
 * the radix DirectionProvider so RTL-aware primitives (sidebar, menus, etc.)
 * mirror correctly when Arabic is active.
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const language = useAppStore((s) => s.language);
  const dir = isRtl(language) ? "rtl" : "ltr";

  useEffect(() => {
    const root = document.documentElement;
    root.lang = language;
    root.dir = dir;
  }, [language, dir]);

  return <DirectionProvider dir={dir}>{children}</DirectionProvider>;
}
