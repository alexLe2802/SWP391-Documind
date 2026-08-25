"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CheckCircle2, UserPlus } from "lucide-react";
import { useAuth } from "../features/auth/useAuth";
import { useLanguage } from "../i18n/LanguageProvider";
import { getFirebaseAuth } from "../lib/firebase";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import {
  clearPendingGoogleRegistration,
  readPendingGoogleRegistration,
} from "../lib/google-registration";
import { ROUTES, getAuthenticatedHomeRoute } from "../lib/routes";

// Hiển thị giao diện đăng ký view.
export function RegisterView() {
  const { loginWithGoogle, pendingGoogleRegistration, register } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isGoogleRegistration, setIsGoogleRegistration] = useState(false);
  const [isRegistrationComplete, setIsRegistrationComplete] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  useEffect(() => {
    let isActive = true;

    // Thực hiện chức năng restore google hồ sơ.
    async function restoreGoogleProfile() {
      const profile =
        pendingGoogleRegistration ?? readPendingGoogleRegistration();
      if (!profile) return;

      const firebaseAuth = getFirebaseAuth();
      await firebaseAuth.authStateReady();
      const firebaseUser = firebaseAuth.currentUser;
      const isMatchingGoogleUser =
        firebaseUser?.email === profile.email &&
        firebaseUser.providerData.some(
          (provider) => provider.providerId === "google.com",
        );

      if (!isMatchingGoogleUser) {
        clearPendingGoogleRegistration();
        return;
      }

      if (isActive) {
        setFullName(profile.fullName || firebaseUser.displayName || "");
        setEmail(profile.email);
        setIsGoogleRegistration(true);
      }
    }

    void restoreGoogleProfile();

    return () => {
      isActive = false;
    };
  }, [pendingGoogleRegistration]);

  useEffect(() => {
    let isActive = true;

    // Thực hiện chức năng restore mobile google registration.
    async function restoreMobileGoogleRegistration() {
      const params = new URLSearchParams(window.location.search);
      if (params.get("source") !== "mobile-google") return;

      const emailFromMobile = params.get("email") ?? "";
      const fullNameFromMobile = params.get("fullName") ?? "";
      if (isActive) {
        setEmail(emailFromMobile);
        setFullName(fullNameFromMobile);
      }

      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const googleIdToken = fragment.get("googleIdToken");
      window.history.replaceState({}, "", window.location.pathname);
      if (!googleIdToken) {
        if (isActive) {
          setError(
            "Phiên Google đã hết hạn. Vui lòng tiếp tục lại với Google.",
          );
        }
        return;
      }

      try {
        const credential = GoogleAuthProvider.credential(googleIdToken);
        const result = await signInWithCredential(
          getFirebaseAuth(),
          credential,
        );
        if (!isActive) return;
        setFullName(fullNameFromMobile || result.user.displayName || "");
        setEmail(emailFromMobile || result.user.email || "");
        setIsGoogleRegistration(true);
      } catch {
        if (isActive) {
          setError(
            "Không thể tiếp tục phiên Google từ ứng dụng. Vui lòng chọn Tiếp tục với Google.",
          );
        }
      }
    }

    void restoreMobileGoogleRegistration();
    return () => {
      isActive = false;
    };
  }, []);

  // Xử lý sự kiện submit.
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    // Kiểm tra tên hiển thị không chứa ký tự đặc biệt.
    const INVALID_NAME_CHARS = /[.,@#$%^&*_+=!'"<>?/\\|;:{}[\]()~`]/;
    if (!fullName.trim()) {
      setError("Vui lòng nhập họ và tên.");
      return;
    }
    if (INVALID_NAME_CHARS.test(fullName)) {
      setError(
        "Tên hiển thị không được chứa các ký tự đặc biệt như: . , @ # $ % ^ & * _ + = ! \" ' < > ? / \\ | ; : { } [ ] ( ). Vui lòng đặt tên lại.",
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    if (!acceptedTerms) {
      setError("Bạn cần đồng ý với Điều khoản dịch vụ và Chính sách bảo mật.");
      return;
    }

    setIsSubmitting(true);

    try {
      await register({
        fullName,
        email,
        password,
        confirmPassword,
        acceptedTerms,
      });
      setIsRegistrationComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.registerFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  // Xử lý sự kiện google đăng ký.
  async function handleGoogleRegister() {
    setError("");
    setIsGoogleSubmitting(true);

    try {
      const result = await loginWithGoogle();
      if (result.status === "authenticated") {
        router.replace(getAuthenticatedHomeRoute(result.user.role));
        return;
      }

      setFullName(result.profile.fullName);
      setEmail(result.profile.email);
      setIsGoogleRegistration(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.googleFailed"));
    } finally {
      setIsGoogleSubmitting(false);
    }
  }

  if (isRegistrationComplete) {
    return (
      <section className="auth-card verification-card">
        <CheckCircle2
          className="verification-icon verification-icon--success"
          size={36}
        />
        <p className="eyebrow">KÍCH HOẠT TÀI KHOẢN</p>
        <h2>Kiểm tra email của bạn</h2>
        <p className="auth-copy">
          DocuMind đã gửi liên kết kích hoạt đến <strong>{email}</strong>. Tài
          khoản chỉ có thể đăng nhập sau khi bạn xác thực email.
        </p>
        <Link className="primary-button" href={ROUTES.login}>
          Về trang đăng nhập
        </Link>
      </section>
    );
  }

  return (
    <section className="auth-card">
      <p className="eyebrow">{t("auth.registerEyebrow")}</p>
      <h2>{t("auth.registerTitle")}</h2>
      <p className="auth-copy">{t("auth.registerBody")}</p>
      {!isGoogleRegistration ? (
        <>
          <button
            className="google-button"
            type="button"
            disabled={isSubmitting || isGoogleSubmitting}
            onClick={handleGoogleRegister}
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
        </>
      ) : null}
      <form onSubmit={handleSubmit} className="form-stack">
        <label>
          {t("auth.fullName")}
          <input
            name="fullName"
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
          />
        </label>
        <label>
          {t("auth.email")}
          <input
            name="email"
            autoComplete="email"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            readOnly={isGoogleRegistration}
            required
          />
        </label>
        <label>
          {t("auth.password")}
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
          Xác nhận mật khẩu
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
        <label className="terms-checkbox">
          <input
            name="acceptedTerms"
            type="checkbox"
            checked={acceptedTerms}
            onChange={(event) => setAcceptedTerms(event.target.checked)}
            required
          />
          <span>
            Tôi đồng ý với <Link href={ROUTES.terms}>Điều khoản dịch vụ</Link>{" "}
            và <Link href={ROUTES.privacy}>Chính sách bảo mật</Link>.
          </span>
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button
          className="primary-button"
          type="submit"
          disabled={isSubmitting || isGoogleSubmitting || !acceptedTerms}
        >
          <UserPlus size={18} />
          {isSubmitting ? t("auth.creating") : t("auth.signup")}
        </button>
      </form>
      {!isGoogleRegistration ? (
        <div className="form-links">
          <Link href={ROUTES.login}>{t("auth.haveAccount")}</Link>
        </div>
      ) : null}
    </section>
  );
}
