"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { verifyEmailActionCode } from "../api/auth.api";
import { ROUTES } from "../lib/routes";

type VerificationState = "loading" | "success" | "error";

// Hiển thị giao diện verify email view.
export function VerifyEmailView() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<VerificationState>("loading");
  const processedCodeRef = useRef<string | null>(null);

  useEffect(() => {
    const code = searchParams?.get("oobCode");
    const mode = searchParams?.get("mode");
    const verifiedByFirebase = searchParams?.get("verified") === "true";

    if (verifiedByFirebase) {
      setState("success");
      return;
    }

    if (!code || mode !== "verifyEmail") {
      setState("error");
      return;
    }

    // React Strict Mode may run effects twice in development. Firebase action
    // codes are single-use, so applying the same code again would turn a
    // successful verification into an auth/invalid-action-code error.
    if (processedCodeRef.current === code) {
      return;
    }
    processedCodeRef.current = code;

    void verifyEmailActionCode(code)
      .then(() => setState("success"))
      .catch(() => setState("error"));
  }, [searchParams]);

  return (
    <section className="auth-card verification-card">
      {state === "loading" ? (
        <>
          <LoaderCircle
            className="verification-icon verification-icon--spin"
            size={36}
          />
          <h2>Đang xác thực email</h2>
          <p className="auth-copy">
            DocuMind đang kiểm tra liên kết kích hoạt của bạn.
          </p>
        </>
      ) : null}
      {state === "success" ? (
        <>
          <CheckCircle2
            className="verification-icon verification-icon--success"
            size={36}
          />
          <h2>Tài khoản đã được kích hoạt</h2>
          <p className="auth-copy">
            Bạn có thể đăng nhập và bắt đầu sử dụng DocuMind.
          </p>
          <Link className="primary-button" href={ROUTES.login}>
            Đăng nhập
          </Link>
        </>
      ) : null}
      {state === "error" ? (
        <>
          <XCircle
            className="verification-icon verification-icon--error"
            size={36}
          />
          <h2>Liên kết không hợp lệ</h2>
          <p className="auth-copy">
            Liên kết kích hoạt đã hết hạn hoặc đã được sử dụng.
          </p>
          <Link className="primary-button" href={ROUTES.login}>
            Về trang đăng nhập
          </Link>
        </>
      ) : null}
    </section>
  );
}
