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

// Hiển thị giao diện tài liệu icon.
function DocumentIcon({ type }: { type: string }) {
  return type === "XLSX" ? (
    <FileSpreadsheet size={20} />
  ) : (
    <FileText size={20} />
  );
}

// Hiển thị giao diện đã lưu view.
export function SavedView() {
  const { locale } = useLanguage();
  const text = useCallback(
    (vi: string, en: string) => localize(locale, vi, en),
    [locale],
  );
  const [savedDocuments, setSavedDocuments] = useState<LibraryDocument[]>([]);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [fileType, setFileType] = useState("");
  const [sort, setSort] = useState<SavedDocumentSort>("newest");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<
    string | null
  >(null);
  const [unsavingDocumentId, setUnsavingDocumentId] = useState<string | null>(
    null,
  );
  const [previewDocument, setPreviewDocument] = useState<LibraryDocument>();
  const [previewUrl, setPreviewUrl] = useState("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    let isMounted = true;

    // Cập nhật đã lưu tài liệu.
    async function refreshSavedDocuments() {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const result = await fetchLibraryDocuments({
          savedOnly: true,
          limit: 100,
        });
        if (isMounted) setSavedDocuments(result.items);
      } catch {
        if (isMounted) {
          setErrorMessage(
            text(
              "Không thể tải tài liệu đã lưu.",
              "Unable to load saved documents.",
            ),
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void refreshSavedDocuments();
    window.addEventListener("focus", refreshSavedDocuments);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", refreshSavedDocuments);
    };
  }, [locale, text]);

  const displayedDocuments = useMemo(
    () =>
      savedDocuments.map((document) =>
        localizeLibraryDocument(document, locale),
      ),
    [locale, savedDocuments],
  );
  const subjects = useMemo(
    () =>
      [
        ...new Set(displayedDocuments.map((document) => document.subject)),
      ].sort(),
    [displayedDocuments],
  );
  const fileTypes = useMemo(
    () =>
      [
        ...new Set(displayedDocuments.map((document) => document.fileType)),
      ].sort(),
    [displayedDocuments],
  );
  const filteredDocuments = useMemo(
    () =>
      filterAndSortSavedDocuments(displayedDocuments, {
        query,
        subject,
        fileType,
        sort,
      }),
    [displayedDocuments, fileType, query, sort, subject],
  );
  const hasActiveFilters = Boolean(
    query || subject || fileType || sort !== "newest",
  );

  
  // Xóa hoặc giải phóng filters.
  function clearFilters() {
    setQuery("");
    setSubject("");
    setFileType("");
    setSort("newest");
  }

  useEffect(() => {
    if (!previewDocument) {
      setPreviewUrl("");
      setPreviewError("");
      setIsPreviewLoading(false);
      return;
    }
    let active = true;
    setPreviewUrl("");
    setPreviewError("");
    setIsPreviewLoading(true);

    createPreviewUrl(previewDocument.id)
      .then((result) => {
        if (active) setPreviewUrl(getPreviewFrameUrl(result, previewDocument));
      })
      .catch((error: unknown) => {
        if (active) {
          setPreviewError(
            error instanceof Error
              ? error.message
              : text(
                  "Không thể tải bản xem trước.",
                  "Could not load the preview.",
                ),
          );
        }
      })
      .finally(() => {
        if (active) setIsPreviewLoading(false);
      });

    return () => {
      active = false;
    };
  }, [previewDocument, text]);

  // Hiển thị hoặc mở object.
  async function openObject(
    document: LibraryDocument,
    mode: "preview" | "download",
  ) {
    try {
      const result =
        mode === "preview"
          ? await createPreviewUrl(document.id)
          : await createDownloadUrl(document.id);
      const url =
        mode === "preview"
          ? getFullPreviewUrl(result, document)
          : result.url;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : text("Không thể mở tài liệu.", "Could not open the document."),
      );
    }
  }

	return (
		<main className="simple-workspace-page">
			<header><p className="eyebrow">SAVED</p><h1>Saved documents</h1></header>
			<section className="saved-controls" aria-label="Search and filter saved documents">
				<label className="saved-search"><Search size={18} /><input value={query} onChange={(event) => updateFilter(setQuery, event.target.value)} placeholder="Search title, subject, tags..." /></label>
				<select value={subject} onChange={(event) => updateFilter(setSubject, event.target.value)} aria-label="Filter by subject"><option value="">All subjects</option>{subjects.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
				<select value={fileType} onChange={(event) => updateFilter(setFileType, event.target.value)} aria-label="Filter by file type"><option value="">All file types</option>{fileTypes.map((item) => <option value={item} key={item}>{item}</option>)}</select>
				<select value={`${sortBy}:${sortOrder}`} onChange={(event) => { const [nextSortBy, nextSortOrder] = event.target.value.split(":") as [typeof sortBy, typeof sortOrder]; setSortBy(nextSortBy); setSortOrder(nextSortOrder); setPage(1); }} aria-label="Sort documents">
					<option value="createdAt:desc">Newest</option><option value="createdAt:asc">Oldest</option><option value="title:asc">Name A-Z</option><option value="fileSize:desc">Largest file</option>
				</select>
				{query || subject || fileType || sortBy !== "createdAt" || sortOrder !== "desc" ? <button type="button" onClick={clearFilters}><X size={15} /> Clear filters</button> : null}
			</section>
			<p className="saved-results-count">{pagination.total} documents</p>
			<section className="saved-source-list">
				{isLoading ? <article><strong>Loading saved documents...</strong></article> : errorMessage ? <article><strong>{errorMessage}</strong></article> : documents.length ? documents.map((document) => (
					<article key={document.id}><span><DocumentIcon type={document.fileType} /></span><div><strong>{document.title}</strong><p>{document.subject} / {document.fileName}</p></div><Link href={`/hoi-ai?scope=document&document=${document.id}`}>Ask AI</Link></article>
				)) : <article><Bookmark size={20} /><strong>No saved documents found</strong></article>}
			</section>
			{pagination.totalPages > 1 ? <nav className="saved-pagination" aria-label="Saved document pages"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} aria-label="Previous page"><ChevronLeft size={18} /></button><span>Page {page} of {pagination.totalPages}</span><button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)} aria-label="Next page"><ChevronRight size={18} /></button></nav> : null}
		</main>
	);
}