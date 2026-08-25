import { Suspense } from "react";
import { LoginView } from "../../../views/LoginView";

// Hiển thị giao diện đăng nhập page.
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="screen-message">Loading...</div>}>
      <LoginView />
    </Suspense>
  );
}
