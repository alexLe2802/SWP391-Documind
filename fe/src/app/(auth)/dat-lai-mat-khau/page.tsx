import { Suspense } from "react";
import { ResetPasswordView } from "../../../views/ResetPasswordView";

// Hiển thị giao diện reset password page.
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={<div className="screen-message">Loading reset form...</div>}
    >
      <ResetPasswordView />
    </Suspense>
  );
}
