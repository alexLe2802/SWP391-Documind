import type { ReactNode } from "react";
import { AuthLayout } from "../../layouts/AuthLayout";

// Hiển thị giao diện xác thực route layout.
export default function AuthRouteLayout({ children }: { children: ReactNode }) {
  return <AuthLayout>{children}</AuthLayout>;
}
