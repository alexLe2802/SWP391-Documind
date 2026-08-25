"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { translations, type Locale, type TranslationKey } from "./translations";

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
};

const STORAGE_KEY = "documind-locale";
const LanguageContext = createContext<LanguageContextValue | null>(null);

// Hiển thị giao diện language provider.
export function LanguageProvider({ children }: { children: ReactNode }) {
  // Keep the server render and the client's first render identical. The saved
  // browser preference is restored only after React has hydrated the page.
  const [locale, setLocaleState] = useState<Locale>("vi");

  useEffect(() => {
    const storedLocale = window.localStorage.getItem(STORAGE_KEY);
    const nextLocale: Locale = storedLocale === "en" ? "en" : "vi";

    setLocaleState(nextLocale);
    document.documentElement.lang = nextLocale;
  }, []);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    document.documentElement.lang = nextLocale;
    window.localStorage.setItem(STORAGE_KEY, nextLocale);
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => translations[locale][key],
    }),
    [locale, setLocale],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

// Thực hiện chức năng use language.
export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }

  return context;
}
