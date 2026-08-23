"use client";

import { Languages } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageProvider";

// Hiển thị giao diện language switcher.
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useLanguage();

  return (
    <div
      className={`language-switcher${compact ? " language-switcher--compact" : ""}`}
      aria-label={t("common.language")}
    >
      {!compact ? <Languages size={16} aria-hidden="true" /> : null}
      <button
        type="button"
        lang="vi"
        className={locale === "vi" ? "active" : ""}
        onClick={() => setLocale("vi")}
        aria-pressed={locale === "vi"}
      >
        VI
      </button>
      <span aria-hidden="true">/</span>
      <button
        type="button"
        lang="en"
        className={locale === "en" ? "active" : ""}
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
      >
        EN
      </button>
    </div>
  );
}
