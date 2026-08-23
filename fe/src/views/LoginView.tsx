"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { useAuth } from "../features/auth/useAuth";
import { useLanguage } from "../i18n/LanguageProvider";
import { setFlashMessage } from "../lib/flash-message";
import { ROUTES, getAuthenticatedHomeRoute } from "../lib/routes";

const GOOGLE_LOGIN_SUCCESS_MESSAGE = "Đã đăng nhập thành công bằng google";
const FLASH_DURATION_MS = 5000;

// Lấy dữ liệu lỗi code.
function getErrorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return undefined;
}

// Kiểm tra điều kiện google popup closed lỗi.
function isGooglePopupClosedError(error: unknown) {
  const code = getErrorCode(error);

  return (
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request" ||
    code === "auth/popup-blocked"
  );
}

// Hiển thị giao diện đăng nhập view.
export function LoginView() {
  const { user, isLoading, login, loginWithGoogle } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const redirectAfterLogin = useCallback(
    (role: "ADMIN" | "USER") => {
      const from = searchParams?.get("from");
      router.replace(from ?? getAuthenticatedHomeRoute(role));
    },
    [router, searchParams],
  );

  useEffect(() => {
    if (!isLoading && user) {
      redirectAfterLogin(user.role);
    }
  }, [isLoading, redirectAfterLogin, user]);

  if (isLoading || user) {
    return (
      <div className="screen-message">
        <span className="loading-line" />
        <strong>{t("auth.checking")}</strong>
      </div>
    );
  }

  // Xử lý sự kiện submit.
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const user = await login({ email, password });
      redirectAfterLogin(user.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.loginFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  // Xử lý sự kiện google đăng nhập.
  async function handleGoogleLogin() {
    setError("");
    setIsGoogleSubmitting(true);

    try {
      const result = await loginWithGoogle();

      if (result.status === "registration-required") {
        router.push(ROUTES.register);
        return;
      }

      setFlashMessage({
        type: "success",
        message: GOOGLE_LOGIN_SUCCESS_MESSAGE,
        durationMs: FLASH_DURATION_MS,
      });
      redirectAfterLogin(result.user.role);
    } catch (err) {
      if (isGooglePopupClosedError(err)) {
        setError(t("auth.googleFailed"));
        return;
      }

      setError(err instanceof Error ? err.message : t("auth.googleFailed"));
    } finally {
      setIsGoogleSubmitting(false);
    }
  }

  return (
    <section className="auth-card">
      <p className="eyebrow">DOCUMIND</p>
      <h2>{t("auth.loginTitle")}</h2>
      <p className="auth-copy">{t("auth.loginBody")}</p>
      <button
        className="google-button"
        type="button"
        disabled={isSubmitting || isGoogleSubmitting}
        onClick={handleGoogleLogin}
      >
        <Image
          src="/google.svg"
          alt=""
          aria-hidden="true"
          width={18}
          height={18}
        />
        {isGoogleSubmitting ? t("auth.connecting") : t("auth.google")}
      </button>
      <div className="auth-divider">
        <span>{t("auth.or")}</span>
      </div>
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
        <label>
          {t("auth.password")}
          <input
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button
          className="primary-button"
          type="submit"
          disabled={isSubmitting || isGoogleSubmitting}
        >
          <LogIn size={18} />
          {isSubmitting ? t("auth.processing") : t("common.login")}
        </button>
      </form>
      <div className="form-links">
        <Link href={ROUTES.forgotPassword}>{t("auth.forgot")}</Link>
        <Link href={ROUTES.register}>{t("auth.create")}</Link>
      </div>
    </section>
  );
}
