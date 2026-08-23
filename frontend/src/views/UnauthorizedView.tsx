"use client";

import Link from "next/link";
import { ShieldX } from "lucide-react";
import { useLanguage } from "../i18n/LanguageProvider";
import { ROUTES } from "../lib/routes";

// Hiển thị giao diện unauthorized view.
export function UnauthorizedView() {
  const { t } = useLanguage();

  return (
    <main className="center-page" id="main-content">
      <section className="content-panel narrow">
        <ShieldX size={38} />
        <p className="eyebrow">403 / DOCUMIND</p>
        <h2>{t("unauthorized.title")}</h2>
        <p>{t("unauthorized.body")}</p>
        <Link className="primary-button" href={ROUTES.profile}>
          {t("unauthorized.action")}
        </Link>
      </section>
    </main>
  );
}
