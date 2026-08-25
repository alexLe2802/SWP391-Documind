import type { Locale } from "./translations";

// Thực hiện chức năng localize.
export function localize(locale: Locale, vi: string, en: string) {
  return locale === "vi" ? vi : en;
}
