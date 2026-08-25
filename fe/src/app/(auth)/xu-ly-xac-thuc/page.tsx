"use client";

import { Suspense, useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { ROUTES } from "../../../lib/routes";

// Hiển thị giao diện xác thực action dispatcher.
function AuthActionDispatcher() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const mode = searchParams?.get("mode");
    const code = searchParams?.get("oobCode");

    if (!code) {
      router.replace(ROUTES.login);
      return;
    }

    const target =
      mode === "resetPassword"
        ? ROUTES.resetPassword
        : mode === "verifyEmail"
          ? ROUTES.verifyEmail
          : ROUTES.login;

    router.replace(
      `${target}?mode=${encodeURIComponent(mode ?? "")}&oobCode=${encodeURIComponent(code)}`,
    );
  }, [router, searchParams]);

  return (
    <section className="auth-card reset-link-state">
      <LoaderCircle className="spin" size={24} />
      <h2>Đang xử lý yêu cầu</h2>
      <p className="auth-copy">
        DocuMind đang kiểm tra liên kết và chuyển bạn đến trang phù hợp.
      </p>
    </section>
  );
}

// Hiển thị giao diện xác thực action page.
export default function AuthActionPage() {
  return (
    <Suspense fallback={<div className="screen-message">Đang tải...</div>}>
      <AuthActionDispatcher />
    </Suspense>
  );
}
