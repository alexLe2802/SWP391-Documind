"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  Search,
  X,
} from "lucide-react";
import {
  getAdminDocuments,
  approveDocument,
  rejectDocument,
  unhideDocument,
  createAdminDocumentPreviewUrl,
  type DocumentQuery,
  type DocumentListResponse,
} from "../api/admin.api";
import type { AdminDocument } from "../api/admin.mock";
import { useLanguage } from "../i18n/LanguageProvider";
import { localize } from "../i18n/localize";
import { formatFileSize } from "../api/documents.api";
import { getFullPreviewUrl } from "../lib/office-viewer";

const DEFAULT_QUERY: DocumentQuery = {
  page: 1,
  limit: 8,
  moderationStatus: "PENDING",
};

// Hiển thị giao diện admin tài liệu view.
export function AdminDocumentsView() {
  const { locale, t } = useLanguage();
  // Thực hiện chức năng text.
  const text = (vi: string, en: string) => localize(locale, vi, en);

  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [aiStatus, setAiStatus] = useState("");
  const [moderationStatus, setModerationStatus] = useState("PENDING");
  const [moderationFlag, setModerationFlag] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<DocumentListResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Moderation state
  const [selectedDoc, setSelectedDoc] = useState<AdminDocument | null>(null);
  const [isModerationModalOpen, setIsModerationModalOpen] = useState(false);
  const [moderationReason, setModerationReason] = useState("");
  const [isSubmitingAction, setIsSubmitingAction] = useState(false);

  const loadDocuments = useCallback(
    async (query: DocumentQuery = DEFAULT_QUERY) => {
      setError("");
      setIsLoading(true);
      try {
        const response = await getAdminDocuments(query);
        setData(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("common.error"));
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadDocuments({
      ...DEFAULT_QUERY,
      page,
      keyword,
      status,
      aiStatus,
      moderationStatus,
      moderationFlag,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDocuments, page, status, aiStatus, moderationStatus, moderationFlag]);

  // Xử lý sự kiện search.
  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    await loadDocuments({
      page: 1,
      limit: DEFAULT_QUERY.limit,
      keyword,
      status,
      aiStatus,
      moderationStatus,
      moderationFlag,
    });
  }

  // Xử lý sự kiện action click.
  const handleActionClick = (doc: AdminDocument) => {
    setSelectedDoc(doc);
    setIsModerationModalOpen(true);
    setModerationReason("");
  };

  // Xử lý sự kiện confirm action.
  const handleConfirmAction = async () => {
    if (!selectedDoc) return;
    setIsSubmitingAction(true);
    setError("");
    try {
      if (!moderationReason.trim()) {
        setError(
          text("Lý do từ chối là bắt buộc.", "A rejection reason is required."),
        );
        return;
      }
      await rejectDocument(selectedDoc.id, moderationReason.trim());
      setSelectedDoc(null);
      setIsModerationModalOpen(false);
      // Reload current page
      await loadDocuments({
        page,
        limit: DEFAULT_QUERY.limit,
        keyword,
        status,
        aiStatus,
        moderationStatus,
        moderationFlag,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setIsSubmitingAction(false);
    }
  };

  // Xử lý sự kiện approve tài liệu.
  const handleApproveDocument = async (doc: AdminDocument) => {
    setError("");
    setIsLoading(true);
    try {
      await approveDocument(doc.id);
      if (doc.status === "HIDDEN") {
        await unhideDocument(doc.id);
      }
      await loadDocuments({
        page,
        limit: DEFAULT_QUERY.limit,
        keyword,
        status,
        aiStatus,
        moderationStatus,
        moderationFlag,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setIsLoading(false);
    }
  };

  // Xử lý sự kiện xem trước tài liệu.
  const handlePreviewDocument = async (id: string, doc?: AdminDocument) => {
    try {
      const result = await createAdminDocumentPreviewUrl(id);
      const url = getFullPreviewUrl(result, doc);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    }
  };

  // Xử lý sự kiện page change.
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const items = data?.items ?? [];
  const meta = data?.meta ?? {
    page: 1,
    limit: 10,
    totalItems: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false,
  };

  return (
    <main className="page" id="main-content">
      <div className="page-header page-header--editorial">
        <div>
          <p className="eyebrow">
            {text("BẢNG ĐIỀU KHIỂN QUẢN TRỊ", "ADMIN CONSOLE")}
          </p>
          <h1>{text("Kiểm duyệt tài liệu", "Document Moderation")}</h1>
          <p>
            {text(
              "Xem xét tài liệu được đăng tải và ẩn các tài liệu vi phạm quy chế học tập khỏi cộng đồng.",
              "Review uploaded documents and hide materials that violate academic integrity from the community.",
            )}
          </p>
        </div>
        <span className="page-number">03 / ADMIN</span>
      </div>

      {/* Toolbar filters */}
      <form className="toolbar" onSubmit={handleSearch}>
        <label className="search-box">
          <Search size={18} />
          <input
            name="documentSearch"
            aria-label={text(
              "Tìm kiếm tiêu đề, tên tệp...",
              "Search title, fileName...",
            )}
            autoComplete="off"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={`${text("Tìm kiếm tiêu đề, tên tệp...", "Search title, fileName...")}…`}
          />
        </label>

        <select
          aria-label={text("Trạng thái kiểm duyệt", "Moderation status")}
          value={moderationStatus}
          onChange={(event) => {
            setModerationStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">
            {text("Mọi trạng thái duyệt", "All moderation statuses")}
          </option>
          <option value="PENDING">PENDING</option>
          <option value="APPROVED">APPROVED</option>
          <option value="REJECTED">REJECTED</option>
        </select>

        <select
          aria-label={text("Cờ kiểm duyệt", "Moderation flag")}
          value={moderationFlag}
          onChange={(event) => {
            setModerationFlag(event.target.value);
            setPage(1);
          }}
        >
          <option value="">{text("Mọi mức cảnh báo", "All scan flags")}</option>
          <option value="FLAGGED">FLAGGED</option>
          <option value="SCAN_FAILED">SCAN_FAILED</option>
          <option value="NORMAL">NORMAL</option>
        </select>

        <select
          name="statusFilter"
          aria-label={text("Trạng thái tài liệu", "Status")}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">{text("Tất cả trạng thái", "All statuses")}</option>
          <option value="ACTIVE">{text("Hoạt động", "ACTIVE")}</option>
          <option value="HIDDEN">{text("Bị ẩn", "HIDDEN")}</option>
          <option value="DELETED">{text("Đã xóa", "DELETED")}</option>
        </select>

        <select
          name="aiStatusFilter"
          aria-label={text("Trạng thái Chỉ mục AI", "AI status")}
          value={aiStatus}
          onChange={(event) => {
            setAiStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">{text("Trạng thái AI", "All AI statuses")}</option>
          <option value="COMPLETED">
            {text("Sẵn sàng (COMPLETED)", "COMPLETED")}
          </option>
          <option value="PROCESSING">
            {text("Đang xử lý (PROCESSING)", "PROCESSING")}
          </option>
          <option value="PENDING">
            {text("Chờ xử lý (PENDING)", "PENDING")}
          </option>
          <option value="FAILED">{text("Thất bại (FAILED)", "FAILED")}</option>
        </select>

        <button className="secondary-button" type="submit" disabled={isLoading}>
          {isLoading ? t("common.searching") : t("common.search")}
        </button>
      </form>

      <section className="content-panel">
        {error ? <p className="form-error">{error}</p> : null}
        {isLoading ? (
          <div className="loading-state">
            <span className="loading-line" />
            <p>
              {text("Đang tải danh sách tài liệu...", "Loading documents...")}
            </p>
          </div>
        ) : null}
        {!isLoading && items.length === 0 ? (
          <div className="empty-state">
            <FileText size={28} />
            <p>
              {text(
                "Không tìm thấy tài liệu phù hợp.",
                "No matching documents found.",
              )}
            </p>
          </div>
        ) : null}

        {!isLoading && items.length > 0 ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{text("Tài liệu", "Document")}</th>
                    <th>{text("Chủ đề / Phân loại", "Subject / Category")}</th>
                    <th>{text("Người sở hữu", "Owner")}</th>
                    <th>{text("Quét nội dung", "Content scan")}</th>
                    <th>{text("Kiểm duyệt", "Moderation")}</th>
                    <th>{text("Từ khóa", "Keywords")}</th>
                    <th>{text("Hành động", "Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((doc) => (
                    <tr key={doc.id}>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.65rem",
                          }}
                        >
                          <span style={{ color: "var(--muted)" }}>
                            {doc.fileType === "XLSX" ? (
                              <FileSpreadsheet size={18} />
                            ) : (
                              <FileText size={18} />
                            )}
                          </span>
                          <div style={{ display: "grid", lineHeight: 1.3 }}>
                            <strong style={{ fontSize: "0.86rem" }}>
                              {doc.title}
                            </strong>
                            <small
                              style={{
                                color: "var(--subtle)",
                                fontSize: "0.72rem",
                              }}
                            >
                              {doc.fileName} ({formatFileSize(doc.fileSize)})
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "grid", lineHeight: 1.3 }}>
                          <strong>{doc.subject}</strong>
                          <span
                            style={{
                              color: "var(--subtle)",
                              fontSize: "0.74rem",
                            }}
                          >
                            {doc.category}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "grid", lineHeight: 1.3 }}>
                          <strong>{doc.owner.fullName}</strong>
                          <span
                            style={{
                              color: "var(--subtle)",
                              fontSize: "0.74rem",
                            }}
                          >
                            {doc.owner.email}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={
                            doc.moderationFlag === "FLAGGED"
                              ? "status-pill hidden"
                              : doc.moderationFlag === "SCAN_FAILED"
                                ? "status-pill deleted"
                                : "status-pill success"
                          }
                        >
                          {doc.moderationFlag === "FLAGGED" ? (
                            <AlertTriangle size={13} />
                          ) : null}
                          {doc.moderationFlag ?? "NORMAL"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            doc.moderationStatus === "APPROVED"
                              ? "status-pill success"
                              : doc.moderationStatus === "REJECTED"
                                ? "status-pill deleted"
                                : "status-pill ai-processing"
                          }
                        >
                          {doc.moderationStatus ?? "PENDING"}
                        </span>
                      </td>
                      <td>
                        {doc.matchedKeywords?.length
                          ? doc.matchedKeywords.join(", ")
                          : "—"}
                      </td>
                      <td>
                        <div className="btn-action-row">
                          <button
                            type="button"
                            className="btn-icon-action"
                            title={text("Xem file", "Preview file")}
                            onClick={() => void handlePreviewDocument(doc.id, doc)}
                          >
                            <Eye size={15} />
                          </button>
                          {doc.moderationStatus === "PENDING" ||
                          doc.moderationStatus === "REJECTED" ||
                          (doc.moderationStatus === "APPROVED" &&
                            doc.status === "HIDDEN") ? (
                            <button
                              type="button"
                              className="btn-icon-action"
                              title={
                                doc.moderationStatus === "REJECTED" ||
                                doc.status === "HIDDEN"
                                  ? text("Duyệt lại", "Approve again")
                                  : text("Duyệt", "Approve")
                              }
                              onClick={() => void handleApproveDocument(doc)}
                            >
                              <CheckCircle2 size={15} />
                            </button>
                          ) : null}
                          {doc.moderationStatus === "PENDING" ||
                          doc.moderationStatus === "APPROVED" ? (
                            <button
                              type="button"
                              className="btn-icon-action btn-warn"
                              title={text("Từ chối", "Reject")}
                              onClick={() => handleActionClick(doc)}
                            >
                              <X size={15} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {meta.totalPages > 1 ? (
              <div className="pagination-wrap">
                <span className="pagination-info">
                  {text("Trang", "Page")} {meta.page} {text("trên", "of")}{" "}
                  {meta.totalPages} ({meta.totalItems}{" "}
                  {text("tài liệu", "documents")})
                </span>
                <div className="pagination-buttons">
                  <button
                    type="button"
                    className="pagination-btn"
                    disabled={!meta.hasPrevious}
                    onClick={() => handlePageChange(meta.page - 1)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map(
                    (pNum) => (
                      <button
                        key={pNum}
                        type="button"
                        className={`pagination-btn ${meta.page === pNum ? "active" : ""}`}
                        onClick={() => handlePageChange(pNum)}
                      >
                        {pNum}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    className="pagination-btn"
                    disabled={!meta.hasNext}
                    onClick={() => handlePageChange(meta.page + 1)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {/* Moderation Confirmation Modal */}
      {selectedDoc && isModerationModalOpen ? (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <header className="admin-modal-header">
              <h3>{text("Từ chối tài liệu", "Reject document")}</h3>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => {
                  setSelectedDoc(null);
                  setIsModerationModalOpen(false);
                }}
              >
                <X size={18} />
              </button>
            </header>
            <div className="admin-modal-body">
              <p>
                {text(
                  `Tài liệu "${selectedDoc.title}" sẽ bị từ chối, ẩn khỏi cộng đồng và người tải lên sẽ thấy lý do bên dưới.`,
                  `"${selectedDoc.title}" will be rejected, hidden from the community, and the uploader will see the reason below.`,
                )}
              </p>

              {selectedDoc.matchedContexts?.length ? (
                <div className="moderation-contexts">
                  {selectedDoc.matchedContexts.map((match, index) => (
                    <blockquote key={`${match.keyword}-${index}`}>
                      <strong>{match.keyword}</strong>
                      <p>{match.excerpt}</p>
                    </blockquote>
                  ))}
                </div>
              ) : null}

              <div style={{ marginTop: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.45rem",
                    fontWeight: 700,
                    color: "var(--ink)",
                    fontSize: "0.8rem",
                  }}
                >
                  {text(
                    "Lý do từ chối (bắt buộc)",
                    "Rejection reason (required)",
                  )}
                </label>
                <div className="moderation-reason-presets">
                  {[
                    text("Nội dung không phù hợp", "Inappropriate content"),
                    text(
                      "Sai hoặc thiếu thông tin",
                      "Incorrect or incomplete information",
                    ),
                    text(
                      "File lỗi/không đọc được",
                      "Unreadable or corrupted file",
                    ),
                    text("Nội dung trùng lặp", "Duplicate content"),
                    text("Vi phạm bản quyền", "Copyright violation"),
                  ].map((reason) => (
                    <button
                      type="button"
                      key={reason}
                      onClick={() => setModerationReason(reason)}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
                <textarea
                  value={moderationReason}
                  onChange={(event) => setModerationReason(event.target.value)}
                  placeholder={text(
                    "Nhập lý do để người tải lên có thể chỉnh sửa...",
                    "Enter a reason so the uploader can revise the document...",
                  )}
                />
              </div>
            </div>
            <footer className="admin-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setSelectedDoc(null);
                  setIsModerationModalOpen(false);
                }}
                disabled={isSubmitingAction}
              >
                {text("Hủy bỏ", "Cancel")}
              </button>
              <button
                type="button"
                className="primary-button"
                style={{
                  background: "var(--ink)",
                  borderColor: "var(--ink)",
                }}
                onClick={() => void handleConfirmAction()}
                disabled={isSubmitingAction}
              >
                {isSubmitingAction
                  ? text("Đang xử lý...", "Processing...")
                  : text("Từ chối tài liệu", "Reject document")}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}
