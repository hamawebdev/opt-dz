import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Glasses, Languages, Check } from "lucide-react";
import { useAppStore } from "@/store/use-app-store";
import { SUPPORTED_LANGUAGES, type Language } from "@/lib/i18n";
import { useSaveSettings } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ShopSettings } from "@/types";
import { cn } from "@/lib/utils";

// Each language shown in its own script so it's recognisable without reading
// the others — a low-literacy / first-run essential.
const LANG_LABEL: Record<Language, string> = {
  ar: "العربية",
  fr: "Français",
  en: "English",
};

const TOTAL_STEPS = 3;

/**
 * First-run setup: pick a language, name the shop, and choose simple vs full
 * mode. Skippable in one tap. Renders as a full-screen overlay until the
 * `onboarded` flag is set, so a first-time user is never dropped onto a dense
 * dashboard with no guidance.
 */
export function Onboarding() {
  const { t } = useTranslation();
  const onboarded = useAppStore((s) => s.onboarded);
  const setOnboarded = useAppStore((s) => s.setOnboarded);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const setSimpleMode = useAppStore((s) => s.setSimpleMode);
  const saveSettings = useSaveSettings();

  const [step, setStep] = useState(0);
  const [shopName, setShopName] = useState("");
  const [currency, setCurrency] = useState("DA");

  if (onboarded) return null;

  function finish(simple: boolean) {
    setSimpleMode(simple);
    const patch: Partial<ShopSettings> = {
      currency_symbol: currency.trim() || "DA",
    };
    if (shopName.trim()) patch.shop_name = shopName.trim();
    // Best-effort: the app proceeds even if the write fails.
    saveSettings.mutate(patch);
    setOnboarded(true);
  }

  return (
    <div className="bg-background fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-auto p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="bg-primary text-primary-foreground flex size-14 items-center justify-center rounded-2xl shadow-sm">
            <Glasses className="size-7" />
          </div>
          <p className="text-muted-foreground text-sm">
            {t("onboarding.stepOf", { n: step + 1, total: TOTAL_STEPS })}
          </p>
        </div>

        {step === 0 && (
          <div className="space-y-6">
            <h1 className="text-center text-2xl font-semibold tracking-tight">
              {t("onboarding.chooseLanguage")}
            </h1>
            <div className="grid gap-3">
              {SUPPORTED_LANGUAGES.map((lng) => (
                <button
                  key={lng}
                  type="button"
                  onClick={() => {
                    setLanguage(lng);
                    setStep(1);
                  }}
                  className={cn(
                    "flex h-14 items-center justify-between rounded-xl border px-5 text-lg font-medium transition-colors",
                    language === lng
                      ? "border-primary bg-primary/5"
                      : "hover:bg-accent",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <Languages className="text-muted-foreground size-5" />
                    {LANG_LABEL[lng]}
                  </span>
                  {language === lng && (
                    <Check className="text-primary size-5" />
                  )}
                </button>
              ))}
            </div>
            <p className="text-muted-foreground text-center text-sm">
              {t("onboarding.languageHint")}
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div className="space-y-1 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">
                {t("onboarding.welcomeTitle")}
              </h1>
              <p className="text-muted-foreground">
                {t("onboarding.welcomeBody")}
              </p>
            </div>
            <div className="space-y-4">
              <div className="grid gap-1.5">
                <Label htmlFor="ob-shop">{t("onboarding.shopNameLabel")}</Label>
                <Input
                  id="ob-shop"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  placeholder={t("onboarding.shopNamePlaceholder")}
                  autoFocus
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ob-cur">{t("onboarding.currencyLabel")}</Label>
                <Input
                  id="ob-cur"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-28"
                />
              </div>
              <p className="text-muted-foreground bg-muted/40 rounded-lg border p-3 text-sm">
                <span className="text-foreground font-medium">
                  {t("onboarding.taxTitle")}.{" "}
                </span>
                {t("onboarding.taxBody")}
              </p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" onClick={() => setOnboarded(true)}>
                {t("onboarding.skip")}
              </Button>
              <Button size="lg" onClick={() => setStep(2)}>
                {t("onboarding.next")}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h1 className="text-center text-2xl font-semibold tracking-tight">
              {t("onboarding.modeTitle")}
            </h1>
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => finish(true)}
                className="hover:bg-accent rounded-xl border p-4 text-start transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg font-medium">
                    {t("mode.simpleTitle")}
                  </span>
                  <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
                    {t("mode.recommended")}
                  </span>
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {t("mode.simpleBody")}
                </p>
              </button>
              <button
                type="button"
                onClick={() => finish(false)}
                className="hover:bg-accent rounded-xl border p-4 text-start transition-colors"
              >
                <span className="text-lg font-medium">
                  {t("mode.fullTitle")}
                </span>
                <p className="text-muted-foreground mt-1 text-sm">
                  {t("mode.fullBody")}
                </p>
              </button>
            </div>
            <div className="flex justify-start">
              <Button variant="ghost" onClick={() => setStep(1)}>
                {t("common.back")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
