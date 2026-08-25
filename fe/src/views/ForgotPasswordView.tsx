"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { forgotPassword } from "../api/auth.api";
import { useLanguage } from "../i18n/LanguageProvider";
import { ROUTES } from "../lib/routes";

// Hiển thị giao diện forgot password view.
export function ForgotPasswordView() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Xử lý sự kiện submit.
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    setIsSubmitting(true);

    try {
      await forgotPassword(email);
      setMessage(t("auth.resetSent"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.sendFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-card">
      <p className="eyebrow">{t("auth.recovery")}</p>
      <h2>{t("auth.forgotTitle")}</h2>
      <p className="auth-copy">{t("auth.forgotBody")}</p>
      <form onSubmit={handleSubmit} className="form-stack">
        <label>
          {t("auth.email")}
          <input
            name="email"
            autoComplete="email"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
          />
        </label>
        {message ? <p className="form-success">{message}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        <button
          className="primary-button"
          type="submit"
          disabled={isSubmitting}
        >
          <Mail size={18} />
          {isSubmitting ? t("auth.sending") : t("auth.sendRequest")}
        </button>
      </form>
      <div className="form-links">
        <Link href={ROUTES.login}>{t("auth.backLogin")}</Link>
      </div>
    </section>
  );
}
