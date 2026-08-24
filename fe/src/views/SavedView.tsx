"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Bookmark,
  BookmarkX,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { unsaveCommunityDocument } from "../api/community.api";
import {
  createDownloadUrl,
  createPreviewUrl,
  fetchLibraryDocuments,
} from "../api/documents.api";
import { useLanguage } from "../i18n/LanguageProvider";
import { localizeLibraryDocument } from "../i18n/document-display";
import { localize } from "../i18n/localize";
import { ROUTES } from "../lib/routes";
import {
  filterAndSortSavedDocuments,
  type SavedDocumentSort,
} from "../lib/saved-documents";
import { getFullPreviewUrl, getPreviewFrameUrl } from "../lib/office-viewer";
import type { LibraryDocument } from "../types/document";

// Hiển thị giao diện đã lưu view.
export function SavedView() {
  const { locale } = useLanguage();
  const text = useCallback(
    (vi: string, en: string) => localize(locale, vi, en),
    [locale],
  );

  return (
    <main id="main-content" className="simple-workspace-page">
      <header>
        <p className="eyebrow">{text("ĐÃ LƯU", "SAVED")}</p>
        <h1>{text("Tài liệu đã lưu.", "Saved documents.")}</h1>
      </header>
    </main>
  );
}
