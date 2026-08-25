import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  Playfair_Display,
  Plus_Jakarta_Sans,
  Source_Code_Pro,
} from "next/font/google";
import "../index.css";
import "../ai-workspaces.css";
import { FlashMessageToast } from "../components/ui/FlashMessageToast";
import { AuthProvider } from "../features/auth/AuthProvider";
import { LanguageProvider } from "../i18n/LanguageProvider";

const headingFont = Playfair_Display({
  subsets: ["latin", "vietnamese"],
  variable: "--font-heading",
  display: "swap",
});

const bodyFont = Plus_Jakarta_Sans({
  subsets: ["latin", "vietnamese"],
  variable: "--font-body",
  display: "swap",
});

const monoFont = Source_Code_Pro({
  subsets: ["latin", "vietnamese"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "DocuMind | AI study workspace",
    template: "%s | DocuMind",
  },
  description:
    "Store, search, and understand study documents with source-aware AI.",
  icons: {
    icon: "/Logo.png",
  },
};

// Hiển thị giao diện root layout.
export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi" data-scroll-behavior="smooth">
      <body
        className={`${headingFont.variable} ${bodyFont.variable} ${monoFont.variable}`}
      >
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <LanguageProvider>
          <AuthProvider>{children}</AuthProvider>
          <FlashMessageToast />
        </LanguageProvider>
      </body>
    </html>
  );
}
