"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./useAuth";
import type { UserRole } from "../../types/auth";
import { useLanguage } from "../../i18n/LanguageProvider";
import { ROUTES } from "../../lib/routes";

type ProtectedRouteProps = {
  allowedRoles?: UserRole[];
  children: ReactNode;
};

// Hiển thị giao diện protected route.
export function ProtectedRoute({
  allowedRoles,
  children,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      const redirectPath = pathname ?? ROUTES.dashboard;
      router.replace(
        `${ROUTES.login}?from=${encodeURIComponent(redirectPath)}`,
      );
      return;
    }

    if (user.status !== "ACTIVE") {
      router.replace(ROUTES.unauthorized);
      return;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
      router.replace(ROUTES.unauthorized);
    }
  }, [allowedRoles, isLoading, pathname, router, user]);

  if (isLoading) {
    return (
      <div className="screen-message">
        <span className="loading-line" />
        <strong>{t("auth.checking")}</strong>
      </div>
    );
  }

  if (
    !user ||
    user.status !== "ACTIVE" ||
    (allowedRoles && !allowedRoles.includes(user.role))
  ) {
    return null;
  }

  return children;
}
