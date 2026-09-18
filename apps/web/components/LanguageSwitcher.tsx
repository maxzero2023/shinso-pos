"use client";

import { LOCALES, type Locale } from "@shinso/api";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const LABELS: Record<Locale, string> = {
  ja: "日本語",
  zh: "中文",
  en: "EN",
};

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useLocale();

  return (
    <div
      className={className}
      role="group"
      aria-label={t("language")}
      style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}
    >
      {LOCALES.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            className={`btn lang-btn touch-target${active ? " lang-btn-active" : " ghost"}`}
            aria-pressed={active}
            onClick={() => setLocale(code)}
          >
            {LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}
