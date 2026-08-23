"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, KeyRound, LoaderCircle } from "lucide-react";
import { resetPassword, verifyResetPasswordCode } from "../api/auth.api";
import { useLanguage } from "../i18n/LanguageProvider";
import { ROUTES } from "../lib/routes";

type LinkState = "checking" | "valid" | "invalid" | "completed";

// Hiển thị giao diện reset password view.
export function ResetPasswordView() {
  const { t } = useLanguage();
  const [code, setCode] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const actionCode = searchParams.get("oobCode") ?? "";
    const mode = searchParams.get("mode");

    if (!actionCode || (mode && mode !== "resetPassword")) {
      setLinkState("invalid");
      return;
    }

    setCode(actionCode);
    verifyResetPasswordCode(actionCode)
      .then((email) => {
        setAccountEmail(email);
        setLinkState("valid");
      })
      .catch(() => setLinkState("invalid"));
  }, []);

  // Xử lý sự kiện submit.
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (linkState !== "valid" || !code) {
      setError(t("auth.invalidResetLink"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }

    setIsSubmitting(true);

    try {
      await resetPassword(code, password);
      setPassword("");
      setConfirmPassword("");
      setLinkState("completed");
    } catch {
      setError(t("auth.expiredResetLink"));
      setLinkState("invalid");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (linkState === "checking") {
    return (
      <section className="auth-card reset-link-state">
        <LoaderCircle className="spin" size={24} />
        <h2>Checking reset link...</h2>
        <p className="auth-copy">
          Please wait while DocuMind verifies this request.
        </p>
      </section>
    );
  }

  if (linkState === "invalid") {
    return (
      <section className="auth-card reset-link-state">
        <KeyRound size={24} />
        <p className="eyebrow">{t("auth.recovery")}</p>
        <h2>{t("auth.invalidResetLink")}</h2>
        <p className="auth-copy">{t("auth.expiredResetLink")}</p>
        <Link href={ROUTES.forgotPassword} className="primary-button">
          {t("auth.sendRequest")}
        </Link>
        <Link href={ROUTES.login} className="reset-secondary-link">
          {t("auth.backLogin")}
        </Link>
      </section>
    );
  }

  if (linkState === "completed") {
    return (
      <section className="auth-card reset-link-state reset-link-state--success">
        <CheckCircle2 size={28} />
        <p className="eyebrow">{t("auth.recovery")}</p>
        <h2>{t("auth.passwordUpdated")}</h2>
        <p className="auth-copy">
          Your new password is ready. You can now sign in to DocuMind.
        </p>
        <Link href={ROUTES.login} className="primary-button">
          {t("auth.backLogin")}
        </Link>
      </section>
    );
  }

  return (
    <section className="auth-card">
      <p className="eyebrow">{t("auth.recovery")}</p>
      <h2>{t("auth.resetTitle")}</h2>
      <p className="auth-copy">{t("auth.resetBody")}</p>
      {accountEmail ? (
        <p className="reset-account-email">{accountEmail}</p>
      ) : null}
      <form onSubmit={handleSubmit} className="form-stack">
        <label>
          {t("auth.newPassword")}
          <input
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            minLength={8}
            required
          />
        </label>
        <label>
          {t("auth.confirmPassword")}
          <input
            name="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            type="password"
            minLength={8}
            required
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button
          className="primary-button"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <KeyRound size={18} />
          )}
          {isSubmitting ? t("auth.updating") : t("auth.updatePassword")}
        </button>
      </form>
      <div className="form-links">
        <Link href={ROUTES.login}>{t("auth.backLogin")}</Link>
      </div>
    </section>
  );
}
