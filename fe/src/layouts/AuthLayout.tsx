"use client";

import type { ReactNode } from "react";
import {
  FileSearch,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Brand } from "../components/ui/Brand";
import { LanguageSwitcher } from "../components/ui/LanguageSwitcher";
import { useLanguage } from "../i18n/LanguageProvider";

// Hiển thị giao diện xác thực layout.
export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useLanguage();

  return (
    <main className="auth-shell" id="main-content">
      <section className="auth-brand">
        <div className="auth-brand-top">
          <Brand />
          <LanguageSwitcher />
        </div>
        <div className="auth-brand-copy">
          <p className="eyebrow">{t("auth.sideEyebrow")}</p>
          <h1>{t("auth.sideTitle")}</h1>
          <p>{t("auth.sideBody")}</p>
        </div>
        <div className="auth-preview" aria-label="DocuMind AI document preview">
          <div className="auth-preview-header">
            <span>DOCUMIND / SOURCE VIEW</span>
            <Sparkles size={16} />
          </div>
          <div className="preview-content">
            <FileSearch size={22} />
            <div>
              <strong>{t("auth.previewFile")}</strong>
              <p>{t("auth.previewBody")}</p>
            </div>
          </div>
          <div className="preview-answer">
            <MessageSquareText size={18} />
            <span>
              Grounded answer <b>[1]</b>
            </span>
          </div>
        </div>
        <div className="auth-trust">
          <ShieldCheck size={18} />
          <span>Firebase Auth · Role-based access · Source citations</span>
        </div>
      </section>
      <section className="auth-form-column">{children}</section>
    </main>
  );
}
