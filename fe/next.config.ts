import type { NextConfig } from "next";
import { validateProductionEnvironment } from "./src/config/production-env";

validateProductionEnvironment(process.env);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin-allow-popups",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

function getApiProxyTarget() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001/api";

  return configuredUrl.replace(/\/+$/, "").replace(/\/api$/, "");
}

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    const apiProxyTarget = getApiProxyTarget();

    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
      {
        source: "/__/auth/action",
        destination: "/xu-ly-xac-thuc",
      },
      { source: "/auth/action", destination: "/xu-ly-xac-thuc" },
      { source: "/login", destination: "/dang-nhap" },
      { source: "/register", destination: "/dang-ky" },
      { source: "/forgot-password", destination: "/quen-mat-khau" },
      { source: "/reset-password", destination: "/dat-lai-mat-khau" },
      { source: "/verify-email", destination: "/xac-thuc-email" },
      { source: "/dashboard", destination: "/tong-quan" },
      { source: "/library", destination: "/thu-vien" },
      { source: "/upload", destination: "/tai-len" },
      { source: "/community", destination: "/cong-dong" },
      { source: "/saved", destination: "/da-luu" },
      { source: "/ask", destination: "/hoi-ai" },
      { source: "/ask-document", destination: "/hoi-ai?scope=document" },
      { source: "/ask-library", destination: "/hoi-ai" },
      { source: "/subscription", destination: "/goi-dich-vu" },
      { source: "/profile", destination: "/ho-so" },
      { source: "/admin/users", destination: "/quan-tri/nguoi-dung" },
      { source: "/admin/dashboard", destination: "/quan-tri/tong-quan" },
      { source: "/admin/documents", destination: "/quan-tri/tai-lieu" },
      { source: "/unauthorized", destination: "/khong-co-quyen" },
      { source: "/terms", destination: "/dieu-khoan-dich-vu" },
      { source: "/privacy", destination: "/chinh-sach-bao-mat" },
    ];
  },
};

export default nextConfig;
