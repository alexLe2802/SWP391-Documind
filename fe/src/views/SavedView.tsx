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

  // Xử lý sự kiện tải xuống.
  async function handleDownload(document: LibraryDocument) {
    setErrorMessage("");
    setDownloadingDocumentId(document.id);

    try {
      await openObject(document, "download");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : text(
              "Không thể tải xuống tài liệu.",
              "Unable to download the document.",
            ),
      );
    } finally {
      setDownloadingDocumentId(null);
    }
  }

  // Xử lý sự kiện unsave.
  async function handleUnsave(document: LibraryDocument) {
    setErrorMessage("");
    setUnsavingDocumentId(document.id);

    try {
      await unsaveCommunityDocument(document.id);
      setSavedDocuments((current) =>
        current.filter((item) => item.id !== document.id),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : text(
              "Không thể hủy lưu tài liệu.",
              "Unable to remove the saved document.",
            ),
      );
    } finally {
      setUnsavingDocumentId(null);
    }
  }

  return (
    <main id="main-content" className="simple-workspace-page">
      <header>
        <p className="eyebrow">{text("ĐÃ LƯU", "SAVED")}</p>
        <h1>{text("Tài liệu đã lưu.", "Saved documents.")}</h1>
      </header>
      <section
        className="saved-controls"
        aria-label={text(
          "Tìm kiếm và lọc tài liệu đã lưu",
          "Search and filter saved documents",
        )}
      >
        <label className="saved-search">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={text(
              "Tìm theo tên, môn học, thẻ...",
              "Search title, subject, tags...",
            )}
          />
        </label>
        <select
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          aria-label={text("Lọc theo môn học", "Filter by subject")}
        >
          <option value="">{text("Tất cả môn học", "All subjects")}</option>
          {subjects.map((item) => (
            <option value={item} key={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          value={fileType}
          onChange={(event) => setFileType(event.target.value)}
          aria-label={text("Lọc theo loại tệp", "Filter by file type")}
        >
          <option value="">{text("Tất cả loại tệp", "All file types")}</option>
          {fileTypes.map((item) => (
            <option value={item} key={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SavedDocumentSort)}
          aria-label={text("Sắp xếp tài liệu", "Sort documents")}
        >
          <option value="newest">{text("Mới nhất", "Newest")}</option>
          <option value="oldest">{text("Cũ nhất", "Oldest")}</option>
          <option value="title-asc">{text("Tên A–Z", "Name A–Z")}</option>
          <option value="size-desc">
            {text("Dung lượng lớn nhất", "Largest file")}
          </option>
        </select>
        {hasActiveFilters ? (
          <button type="button" onClick={clearFilters}>
            <X size={15} />
            {text("Xóa bộ lọc", "Clear filters")}
          </button>
        ) : null}
      </section>
      {!isLoading && !errorMessage ? (
        <p className="saved-results-count">
          {text(
            `${filteredDocuments.length} tài liệu`,
            `${filteredDocuments.length} documents`,
          )}
        </p>
      ) : null}
      <section className="saved-source-list">
        {isLoading ? (
          <article>
            <span>
              <Sparkles size={20} />
            </span>
            <div>
              <strong>
                {text(
                  "Đang tải tài liệu đã lưu...",
                  "Loading saved documents...",
                )}
              </strong>
            </div>
          </article>
        ) : errorMessage ? (
          <article>
            <span>
              <Bookmark size={20} />
            </span>
            <div>
              <strong>{errorMessage}</strong>
            </div>
            <Link href={ROUTES.community}>
              <Sparkles size={15} />
              {text("Xem cộng đồng", "Browse Community")}
            </Link>
          </article>
        ) : filteredDocuments.length > 0 ? (
          filteredDocuments.map((document) => (
            <article key={document.id}>
              <span>
                <DocumentIcon type={document.fileType} />
              </span>
              <div>
                <strong>{document.title}</strong>
                <p>
                  {document.subject} /{" "}
                  {text("Đã lưu từ cộng đồng", "Saved from Community")}
                </p>
              </div>
              <div className="saved-source-actions">
                <button
                  type="button"
                  onClick={() => setPreviewDocument(document)}
                >
                  <Eye size={15} />
                  {text("Xem", "View")}
                </button>
                <button
                  type="button"
                  disabled={downloadingDocumentId === document.id}
                  onClick={() => void handleDownload(document)}
                >
                  <Download size={15} />
                  {downloadingDocumentId === document.id
                    ? text("Đang tải...", "Downloading...")
                    : text("Tải xuống", "Download")}
                </button>
                <Link
                  href={`${ROUTES.aiChat}?scope=document&document=${document.id}`}
                >
                  <Sparkles size={15} />
                  {text("Hỏi AI", "Ask AI")}
                </Link>
                <button
                  type="button"
                  className="saved-source-unsave"
                  disabled={unsavingDocumentId === document.id}
                  onClick={() => void handleUnsave(document)}
                >
                  <BookmarkX size={15} />
                  {unsavingDocumentId === document.id
                    ? text("Đang hủy...", "Removing...")
                    : text("Hủy lưu", "Unsave")}
                </button>
              </div>
            </article>
          ))
        ) : savedDocuments.length === 0 ? (
          <article>
            <span>
              <Bookmark size={20} />
            </span>
            <div>
              <strong>
                {text("Chưa có tài liệu đã lưu", "No saved documents yet")}
              </strong>
              <p>
                {text(
                  "Lưu tài liệu từ trang Cộng đồng để xem lại ở đây.",
                  "Save documents from Community to see them here.",
                )}
              </p>
            </div>
            <Link href={ROUTES.community}>
              <Sparkles size={15} />
              {text("Xem cộng đồng", "Browse Community")}
            </Link>
          </article>
        ) : (
          <article>
            <span>
              <Search size={20} />
            </span>
            <div>
              <strong>
                {text(
                  "Không tìm thấy tài liệu phù hợp",
                  "No matching documents",
                )}
              </strong>
              <p>
                {text(
                  "Thử từ khóa khác hoặc xóa bộ lọc.",
                  "Try another keyword or clear the filters.",
                )}
              </p>
            </div>
            <button type="button" onClick={clearFilters}>
              {text("Xóa bộ lọc", "Clear filters")}
            </button>
          </article>
        )}
      </section>

      {previewDocument ? (
        <div
          className="preview-overlay"
          role="presentation"
          onMouseDown={() => setPreviewDocument(undefined)}
        >
          <article
            className="preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`${text("Xem tài liệu", "View document")} ${previewDocument.title}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="document-type-icon">
                  <DocumentIcon type={previewDocument.fileType} />
                </span>
                <span>
                  <strong>{previewDocument.title}</strong>
                  <small>{previewDocument.fileName}</small>
                </span>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setPreviewDocument(undefined)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="preview-document-sheet">
              {isPreviewLoading ? (
                <div className="preview-frame-state">
                  <span className="spinner" />
                  {text("Đang tải bản xem trước...", "Loading preview...")}
                </div>
              ) : previewError ? (
                <div className="preview-frame-state preview-frame-state--error">
                  <strong>
                    {text(
                      "Không thể hiển thị bản xem trước",
                      "Preview unavailable",
                    )}
                  </strong>
                  <p>{previewError}</p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void openObject(previewDocument, "preview")}
                  >
                    <Eye size={16} />
                    {text("Mở bản gốc", "Open original")}
                  </button>
                </div>
              ) : previewUrl ? (
                <iframe
                  className="preview-frame"
                  src={previewUrl}
                  title={previewDocument.title}
                />
              ) : (
                <div className="preview-frame-state">
                  <p>
                    {text("Chưa có bản xem trước.", "No preview available.")}
                  </p>
                </div>
              )}
            </div>
            <div className="preview-details">
              <p className="eyebrow">
                {previewDocument.subject} / {previewDocument.category}
              </p>
              <p>
                {previewDocument.description ||
                  text("Chưa có mô tả.", "No description yet.")}
              </p>
              {previewDocument.tags.length ? (
                <div className="preview-tag-list">
                  {previewDocument.tags.map((tag, index) => (
                    <span key={`${tag}-${index}`}>{tag}</span>
                  ))}
                </div>
              ) : null}
            </div>
            <footer>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void openObject(previewDocument, "preview")}
              >
                <Eye size={16} />
                {text("Mở bản gốc", "Open original")}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void openObject(previewDocument, "download")}
              >
                <Download size={16} />
                {text("Tải xuống", "Download")}
              </button>
              {previewDocument.indexStatus === "READY" ? (
                <Link
                  href={`${ROUTES.aiChat}?scope=document&document=${previewDocument.id}`}
                  className="primary-button"
                >
                  <Bot size={16} />
                  {text("Hỏi AI", "Ask AI")}
                </Link>
              ) : (
                <button type="button" className="primary-button" disabled>
                  <Bot size={16} />
                  {text("AI chưa sẵn sàng", "AI not ready")}
                </button>
              )}
            </footer>
          </article>
        </div>
      ) : null}
    </main>
  );
}
