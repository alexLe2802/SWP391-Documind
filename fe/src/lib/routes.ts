export const ROUTES = {
  home: "/",
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  verifyEmail: "/verify-email",
  unauthorized: "/unauthorized",
  dashboard: "/dashboard",
  library: "/library",
  upload: "/upload",
  community: "/community",
  saved: "/saved",
  aiChat: "/ask",
  askDocument: "/ask-document",
  askLibrary: "/ask-library",
  subscription: "/subscription",
  profile: "/profile",
  adminUsers: "/admin/users",
  adminDashboard: "/admin/dashboard",
  adminDocuments: "/admin/documents",
  terms: "/terms",
  privacy: "/privacy",
} as const;

// Lấy dữ liệu authenticated home route.
export function getAuthenticatedHomeRoute(role: "ADMIN" | "USER") {
  return role === "ADMIN" ? ROUTES.adminDashboard : ROUTES.dashboard;
}
