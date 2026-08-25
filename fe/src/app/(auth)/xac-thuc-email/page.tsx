import { Suspense } from "react";
import { VerifyEmailView } from "../../../views/VerifyEmailView";

// Hiển thị giao diện verify email page.
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="screen-message">Đang tải...</div>}>
      <VerifyEmailView />
    </Suspense>
  );
}
