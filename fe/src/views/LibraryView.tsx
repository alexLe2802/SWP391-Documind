"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  Globe2,
  Grid2X2,
  List,
  Menu,
  Plus,
  Search,
  Upload,
  X,
  Check,
  MoreVertical,
  Edit2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  createCategory,
  createDownloadUrl,
  createPreviewUrl,
  createSubject,
  deleteDocument,
  fetchCategories,
  fetchDocument,
  fetchExtractionStatus,
  fetchLibraryDocuments,
  fetchSubjects,
  formatFileSize,
  retryExtraction,
  updateSubject,
  deleteSubject,
  updateCategory,
  updateDocumentVisibility,
  deleteCategory,
  type ApiExtractionStatus,
  type CategoryItem,
  type SubjectItem,
} from "../api/documents.api";
import type { LibraryDocument } from "../types/document";
import { useLanguage } from "../i18n/LanguageProvider";
import { localize } from "../i18n/localize";
import { getFullPreviewUrl, getPreviewFrameUrl } from "../lib/office-viewer";
import { ROUTES } from "../lib/routes";

const PAGE_SIZE = 12;
const EXTRACTION_POLL_INTERVAL_MS = 2_000;
const EXTRACTION_POLL_ATTEMPTS = 150;

// Thực hiện chức năng wait.
const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

// Thực hiện chức năng sort taxonomy items.
function sortTaxonomyItems<T extends { name: string }>(items: T[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

// Thực hiện chức năng unique taxonomy items.
function uniqueTaxonomyItems<T extends { id: string; name: string }>(
  items: T[],
) {
  return sortTaxonomyItems([
    ...new Map(items.map((item) => [item.id, item])).values(),
  ]);
}

// Thực hiện chức năng upsert taxonomy item.
function upsertTaxonomyItem<T extends { id: string; name: string }>(
  items: T[],
  item: T,
) {
  return uniqueTaxonomyItems([
    ...items.filter((current) => current.id !== item.id),
    item,
  ]);
}

// Hiển thị giao diện tài liệu icon.
function DocumentIcon({ type }: { type: string }) {
  return type === "XLSX" ? (
    <FileSpreadsheet size={20} />
  ) : (
    <FileText size={20} />
  );
}

// Hiển thị giao diện library view.
export function LibraryView() {
  const { locale } = useLanguage();
  const text = useCallback(
    (vi: string, en: string) => localize(locale, vi, en),
    [locale],
  );
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [fileType, setFileType] = useState("");
  const [status, setStatus] = useState("");
  const [visibility, setVisibility] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"table" | "grid">("grid");
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  // Per-subject categories loaded on expand: subjectId -> CategoryItem[]
  const [subjectCategoriesMap, setSubjectCategoriesMap] = useState<
    Record<string, CategoryItem[]>
  >({});
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(
    new Set(),
  );
  const [previewDocument, setPreviewDocument] = useState<LibraryDocument>();
  const [previewUrl, setPreviewUrl] = useState("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [folderOpen, setFolderOpen] = useState(false);
  const [addingSubject, setAddingSubject] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectCode, setNewSubjectCode] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Subject & Category CRUD
  const [activeMenu, setActiveMenu] = useState<{
    type: "subject" | "category";
    id: string;
  } | null>(null);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [editSubjectName, setEditSubjectName] = useState("");
  const [editSubjectCode, setEditSubjectCode] = useState("");
  const [editCategoryName, setEditCategoryName] = useState("");

  // Document multi-select and delete
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [retryingDocumentIds, setRetryingDocumentIds] = useState<Set<string>>(
    new Set(),
  );
  const [publishingDocumentIds, setPublishingDocumentIds] = useState<
    Set<string>
  >(new Set());

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    Promise.all([fetchSubjects(), fetchCategories()])
      .then(([subjectItems, categoryItems]) => {
        setSubjects(uniqueTaxonomyItems(subjectItems));
        setCategories(uniqueTaxonomyItems(categoryItems));
      })
      .catch((error: unknown) =>
        setErrorMessage(
          error instanceof Error
            ? error.message
            : text(
                "Không thể tải cấu trúc Library.",
                "Could not load the Library structure.",
              ),
        ),
      );
  }, [text]);

  const sort = useMemo(() => {
    if (sortBy === "oldest")
      return { sortBy: "createdAt" as const, sortOrder: "asc" as const };
    if (sortBy === "name-asc")
      return { sortBy: "title" as const, sortOrder: "asc" as const };
    if (sortBy === "size-desc")
      return { sortBy: "fileSize" as const, sortOrder: "desc" as const };
    return { sortBy: "createdAt" as const, sortOrder: "desc" as const };
  }, [sortBy]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setErrorMessage("");
    setSelectedDocIds(new Set());
    fetchLibraryDocuments({
      search: debouncedQuery || undefined,
      subjectId: subjectId || undefined,
      categoryId: categoryId || undefined,
      fileType: fileType || undefined,
      aiStatus: (status || undefined) as ApiExtractionStatus | undefined,
      visibility: visibility as "PRIVATE" | "PUBLIC" | "",
      ...sort,
      page,
      limit: PAGE_SIZE,
    })
      .then((result) => {
        if (!active) return;
        setDocuments(result.items);
        setPagination(result.pagination);
      })
      .catch((error: unknown) => {
        if (active)
          setErrorMessage(
            error instanceof Error
              ? error.message
              : text("Không thể tải tài liệu.", "Could not load documents."),
          );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    categoryId,
    debouncedQuery,
    fileType,
    page,
    sort,
    status,
    subjectId,
    text,
    visibility,
  ]);

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
        if (active)
          setPreviewError(
            error instanceof Error
              ? error.message
              : text(
                  "Không thể tải bản xem trước.",
                  "Could not load the preview.",
                ),
          );
      })
      .finally(() => {
        if (active) setIsPreviewLoading(false);
      });

    return () => {
      active = false;
    };
  }, [previewDocument, text]);

  useEffect(() => {
    const documentId = searchParams?.get("document");
    if (!documentId) return;
    fetchDocument(documentId)
      .then(setPreviewDocument)
      .catch(() => undefined);
  }, [searchParams]);

  const selectedSubject = subjects.find((item) => item.id === subjectId);
  const selectedCategory = categories.find((item) => item.id === categoryId);
  const activeFilters = Boolean(
    query ||
    subjectId ||
    categoryId ||
    fileType ||
    status ||
    visibility ||
    sortBy !== "newest",
  );

  // Close active dropdown menu when clicking anywhere
  useEffect(() => {
    // Xử lý sự kiện global click.
    function handleGlobalClick() {
      setActiveMenu(null);
    }
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  // Xử lý sự kiện menu toggle.
  function handleMenuToggle(
    event: React.MouseEvent,
    type: "subject" | "category",
    id: string,
  ) {
    event.stopPropagation();
    setActiveMenu((prev) =>
      prev?.type === type && prev?.id === id ? null : { type, id },
    );
  }

  // Xử lý sự kiện update môn học.
  async function handleUpdateSubject(id: string, event: React.FormEvent) {
    event.preventDefault();
    const name = editSubjectName.trim();
    const code = editSubjectCode.trim();
    if (!name || !code) return;
    setIsCreating(true);
    setErrorMessage("");
    try {
      const updated = await updateSubject(id, name, code.toUpperCase());
      setSubjects((current) => upsertTaxonomyItem(current, updated));
      setEditingSubjectId(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : text("Không thể cập nhật môn học.", "Could not update subject."),
      );
    } finally {
      setIsCreating(false);
    }
  }

  // Xử lý sự kiện delete môn học.
  async function handleDeleteSubject(id: string, event: React.MouseEvent) {
    event.stopPropagation();
    if (
      !window.confirm(
        text(
          "Bạn có chắc chắn muốn xóa môn học này không? Tất cả danh mục và tài liệu bên trong sẽ bị xóa vĩnh viễn.",
          "Are you sure you want to delete this subject? All categories and documents inside it will be permanently deleted.",
        ),
      )
    ) {
      return;
    }
    setIsCreating(true);
    setErrorMessage("");
    try {
      await deleteSubject(id);
      const deletedDocumentIds = new Set(
        documents
          .filter((document) => document.subjectId === id)
          .map((document) => document.id),
      );
      setSubjects((current) => current.filter((s) => s.id !== id));
      setCategories((current) =>
        current.filter((category) => category.subjectId !== id),
      );
      setDocuments((current) =>
        current.filter((document) => document.subjectId !== id),
      );
      setPagination((current) => ({
        ...current,
        total: Math.max(0, current.total - deletedDocumentIds.size),
      }));
      setSelectedDocIds(
        (current) =>
          new Set(
            [...current].filter(
              (documentId) => !deletedDocumentIds.has(documentId),
            ),
          ),
      );
      setSubjectCategoriesMap((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      if (subjectId === id) {
        selectFolder("", "");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : text("Không thể xóa môn học.", "Could not delete subject."),
      );
    } finally {
      setIsCreating(false);
    }
  }

  // Xử lý sự kiện update danh mục.
  async function handleUpdateCategory(id: string, event: React.FormEvent) {
    event.preventDefault();
    const name = editCategoryName.trim();
    if (!name) return;
    setIsCreating(true);
    setErrorMessage("");
    try {
      const updated = await updateCategory(id, name);
      setCategories((current) => upsertTaxonomyItem(current, updated));
      setSubjectCategoriesMap((current) => {
        const next = { ...current };
        Object.keys(next).forEach((subId) => {
          next[subId] = next[subId].map((c) => (c.id === id ? updated : c));
        });
        return next;
      });
      setEditingCategoryId(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : text("Không thể cập nhật danh mục.", "Could not update category."),
      );
    } finally {
      setIsCreating(false);
    }
  }

  // Xử lý sự kiện delete danh mục.
  async function handleDeleteCategory(id: string, event: React.MouseEvent) {
    event.stopPropagation();
    if (
      !window.confirm(
        text(
          "Bạn có chắc chắn muốn xóa danh mục này không? Tất cả tài liệu bên trong sẽ bị xóa vĩnh viễn.",
          "Are you sure you want to delete this category? All documents inside it will be permanently deleted.",
        ),
      )
    ) {
      return;
    }
    setIsCreating(true);
    setErrorMessage("");
    try {
      await deleteCategory(id);
      const deletedDocumentIds = new Set(
        documents
          .filter((document) => document.categoryId === id)
          .map((document) => document.id),
      );
      setCategories((current) => current.filter((c) => c.id !== id));
      setDocuments((current) =>
        current.filter((document) => document.categoryId !== id),
      );
      setPagination((current) => ({
        ...current,
        total: Math.max(0, current.total - deletedDocumentIds.size),
      }));
      setSelectedDocIds(
        (current) =>
          new Set(
            [...current].filter(
              (documentId) => !deletedDocumentIds.has(documentId),
            ),
          ),
      );
      setSubjectCategoriesMap((current) => {
        const next = { ...current };
        Object.keys(next).forEach((subId) => {
          next[subId] = next[subId].filter((c) => c.id !== id);
        });
        return next;
      });
      if (categoryId === id) {
        selectFolder(subjectId, "");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : text("Không thể xóa danh mục.", "Could not delete category."),
      );
    } finally {
      setIsCreating(false);
    }
  }

  // Thực hiện chức năng start edit môn học.
  function startEditSubject(subject: SubjectItem, event: React.MouseEvent) {
    event.stopPropagation();
    setEditingSubjectId(subject.id);
    setEditSubjectName(subject.name);
    setEditSubjectCode(subject.code);
    setActiveMenu(null);
  }

  // Thực hiện chức năng start edit danh mục.
  function startEditCategory(category: CategoryItem, event: React.MouseEvent) {
    event.stopPropagation();
    setEditingCategoryId(category.id);
    setEditCategoryName(category.name);
    setActiveMenu(null);
  }

  // Xóa hoặc giải phóng edit.
  function cancelEdit(event: React.MouseEvent) {
    event.stopPropagation();
    setEditingSubjectId(null);
    setEditingCategoryId(null);
  }

  // Thực hiện chức năng select folder.
  function selectFolder(nextSubjectId = "", nextCategoryId = "") {
    setSubjectId(nextSubjectId);
    setCategoryId(nextCategoryId);
    setPage(1);
    setFolderOpen(false);
  }

  // Cập nhật môn học.
  function toggleSubject(id: string) {
    setExpandedSubjects((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Fetch categories for this subject if not loaded yet
        if (!subjectCategoriesMap[id]) {
          fetchCategories(id)
            .then((items) => {
              setSubjectCategoriesMap((prev) => ({
                ...prev,
                [id]: uniqueTaxonomyItems(items),
              }));
            })
            .catch(() => undefined);
        }
      }
      return next;
    });
  }

  // Xóa hoặc giải phóng filters.
  function clearFilters() {
    setQuery("");
    setSubjectId("");
    setCategoryId("");
    setFileType("");
    setStatus("");
    setVisibility("");
    setSortBy("newest");
    setPage(1);
  }

  // Xử lý sự kiện create môn học.
  async function handleCreateSubject() {
    const name = newSubjectName.trim();
    if (!name) return;
    setIsCreating(true);
    setErrorMessage("");
    try {
      const item = await createSubject(
        name,
        (newSubjectCode.trim() || name.slice(0, 3)).toUpperCase(),
      );
      setSubjects((current) => upsertTaxonomyItem(current, item));
      setExpandedSubjects((current) => new Set(current).add(item.id));
      selectFolder(item.id);
      setAddingSubject(false);
      setNewSubjectName("");
      setNewSubjectCode("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : text("Không thể tạo môn học.", "Could not create subject."),
      );
    } finally {
      setIsCreating(false);
    }
  }

  // Xử lý sự kiện create danh mục.
  async function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    const targetSubject = subjectId || subjects[0]?.id || "";
    if (!targetSubject) {
      setErrorMessage(
        text(
          "Hãy tạo hoặc chọn môn học trước khi thêm danh mục.",
          "Create or select a subject before adding a category.",
        ),
      );
      return;
    }
    setIsCreating(true);
    setErrorMessage("");
    try {
      const item = await createCategory(name, targetSubject);
      setCategories((current) => upsertTaxonomyItem(current, item));
      setSubjectCategoriesMap((prev) => ({
        ...prev,
        [targetSubject]: upsertTaxonomyItem(prev[targetSubject] ?? [], item),
      }));
      setExpandedSubjects((current) => new Set(current).add(targetSubject));
      selectFolder(targetSubject, item.id);
      setAddingCategory(false);
      setNewCategoryName("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : text("Không thể tạo danh mục.", "Could not create category."),
      );
    } finally {
      setIsCreating(false);
    }
  }

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

  // Document selection
  function toggleDocSelection(id: string) {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Cập nhật select danh sách.
  function toggleSelectAll() {
    if (selectedDocIds.size === documents.length && documents.length > 0) {
      setSelectedDocIds(new Set());
    } else {
      setSelectedDocIds(new Set(documents.map((d) => d.id)));
    }
  }

  // Xử lý sự kiện delete selected tài liệu.
  async function handleDeleteSelectedDocuments() {
    const ids = Array.from(selectedDocIds);
    if (ids.length === 0) return;
    const confirmMsg =
      ids.length === 1
        ? text(
            "Bạn có chắc chắn muốn xóa tài liệu này không?",
            "Are you sure you want to delete this document?",
          )
        : text(
            `Bạn có chắc chắn muốn xóa ${ids.length} tài liệu đã chọn không?`,
            `Are you sure you want to delete ${ids.length} selected documents?`,
          );
    if (!window.confirm(confirmMsg)) return;
    setIsDeleting(true);
    setErrorMessage("");
    try {
      await Promise.all(ids.map((id) => deleteDocument(id)));
      setDocuments((current) =>
        current.filter((d) => !selectedDocIds.has(d.id)),
      );
      setPagination((p) => ({ ...p, total: p.total - ids.length }));
      setSelectedDocIds(new Set());
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : text(
              "Không thể xóa tài liệu.",
              "Could not delete the document(s).",
            ),
      );
    } finally {
      setIsDeleting(false);
    }
  }

  // Xử lý sự kiện delete single tài liệu.
  async function handleDeleteSingleDocument(id: string) {
    if (
      !window.confirm(
        text(
          "Bạn có chắc chắn muốn xóa tài liệu này không?",
          "Are you sure you want to delete this document?",
        ),
      )
    )
      return;
    setIsDeleting(true);
    setErrorMessage("");
    try {
      await deleteDocument(id);
      setDocuments((current) => current.filter((d) => d.id !== id));
      setPagination((p) => ({ ...p, total: p.total - 1 }));
      setSelectedDocIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (previewDocument?.id === id) setPreviewDocument(undefined);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : text("Không thể xóa tài liệu.", "Could not delete the document."),
      );
    } finally {
      setIsDeleting(false);
    }
  }

  // Xử lý sự kiện publish tài liệu.
  async function handlePublishDocument(document: LibraryDocument) {
    if (
      document.visibility !== "PRIVATE" ||
      publishingDocumentIds.has(document.id)
    ) {
      return;
    }
    if (
      !window.confirm(
        text(
          "Gửi tài liệu này cho admin kiểm duyệt trước khi công khai?",
          "Submit this document for admin review before publishing?",
        ),
      )
    ) {
      return;
    }

    setErrorMessage("");
    setPublishingDocumentIds((current) => new Set(current).add(document.id));
    try {
      const publishedDocument = await updateDocumentVisibility(
        document.id,
        "PUBLIC",
      );
      setDocuments((current) =>
        current.map((item) =>
          item.id === document.id ? publishedDocument : item,
        ),
      );
      setPreviewDocument((current) =>
        current?.id === document.id ? publishedDocument : current,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : text(
              "Không thể gửi tài liệu để kiểm duyệt.",
              "Could not submit the document for review.",
            ),
      );
    } finally {
      setPublishingDocumentIds((current) => {
        const next = new Set(current);
        next.delete(document.id);
        return next;
      });
    }
  }

  // Xử lý sự kiện unpublish tài liệu.
  async function handleUnpublishDocument(document: LibraryDocument) {
    if (
      document.visibility !== "PUBLIC" ||
      publishingDocumentIds.has(document.id)
    )
      return;
    const isPendingReview = document.moderationStatus !== "APPROVED";
    if (
      !window.confirm(
        text(
          isPendingReview
            ? "Hủy yêu cầu đăng công khai tài liệu này?"
            : "Gỡ tài liệu này khỏi cộng đồng? Tài liệu cũng sẽ bị xóa khỏi mục Đã lưu của những người dùng khác.",
          isPendingReview
            ? "Cancel this document's publication request?"
            : "Remove this document from Community? It will also be removed from other users' Saved libraries.",
        ),
      )
    )
      return;

    setErrorMessage("");
    setPublishingDocumentIds((current) => new Set(current).add(document.id));
    try {
      const privateDocument = await updateDocumentVisibility(
        document.id,
        "PRIVATE",
      );
      setDocuments((current) =>
        current.map((item) =>
          item.id === document.id ? privateDocument : item,
        ),
      );
      setPreviewDocument((current) =>
        current?.id === document.id ? privateDocument : current,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : text(
              "Không thể gỡ công khai tài liệu.",
              "Could not remove the document from Community.",
            ),
      );
    } finally {
      setPublishingDocumentIds((current) => {
        const next = new Set(current);
        next.delete(document.id);
        return next;
      });
    }
  }

  // Xử lý sự kiện retry extraction.
  async function handleRetryExtraction(document: LibraryDocument) {
    if (
      document.indexStatus !== "FAILED" ||
      retryingDocumentIds.has(document.id)
    ) {
      return;
    }

    setErrorMessage("");
    setRetryingDocumentIds((current) => new Set(current).add(document.id));
    setDocuments((current) =>
      current.map((item) =>
        item.id === document.id ? { ...item, indexStatus: "PROCESSING" } : item,
      ),
    );

    let retryStarted = false;
    try {
      const retryJob = await retryExtraction(document.id);
      retryStarted = true;

      for (let attempt = 0; attempt < EXTRACTION_POLL_ATTEMPTS; attempt += 1) {
        await wait(EXTRACTION_POLL_INTERVAL_MS);
        const status = await fetchExtractionStatus(document.id);

        // Ignore a stale response from an older extraction attempt.
        if (status.jobId !== retryJob.jobId) continue;

        if (
          status.extractionStatus === "COMPLETED" ||
          status.extractionStatus === "MOCKED"
        ) {
          const refreshedDocument = await fetchDocument(document.id);
          setDocuments((current) =>
            current.map((item) =>
              item.id === document.id ? refreshedDocument : item,
            ),
          );
          return;
        }

        if (status.extractionStatus === "FAILED") {
          setDocuments((current) =>
            current.map((item) =>
              item.id === document.id
                ? { ...item, indexStatus: "FAILED" }
                : item,
            ),
          );
          throw new Error(
            status.errorMessage ||
              text(
                "AI không thể đọc nội dung tài liệu này. Vui lòng kiểm tra tệp rồi thử lại.",
                "AI could not read this document. Check the file and try again.",
              ),
          );
        }
      }

      throw new Error(
        text(
          "Phân tích AI vẫn đang xử lý. Hãy kiểm tra lại sau ít phút.",
          "AI analysis is still processing. Check again in a few minutes.",
        ),
      );
    } catch (error) {
      if (!retryStarted) {
        setDocuments((current) =>
          current.map((item) =>
            item.id === document.id && item.indexStatus === "PROCESSING"
              ? { ...item, indexStatus: "FAILED" }
              : item,
          ),
        );
      }
      setErrorMessage(
        error instanceof Error
          ? error.message
          : text(
              "Không thể chạy lại phân tích AI.",
              "Could not retry AI analysis.",
            ),
      );
    } finally {
      setRetryingDocumentIds((current) => {
        const next = new Set(current);
        next.delete(document.id);
        return next;
      });
    }
  }

  // Lấy dữ liệu index trạng thái label.
  const getIndexStatusLabel = (indexStatus: LibraryDocument["indexStatus"]) => {
    if (indexStatus === "READY") return text("AI sẵn sàng", "AI ready");
    if (indexStatus === "PROCESSING") return text("Đang xử lý", "Processing");
    if (indexStatus === "FAILED") return text("Thất bại", "Failed");
    return text("Đang chờ", "Pending");
  };

  const allSelected =
    documents.length > 0 && selectedDocIds.size === documents.length;
  const someSelected = selectedDocIds.size > 0;

  return (
    <main id="main-content" className="library-page">
      <header className="library-page-heading">
        <div>
          <p className="eyebrow">{text("THƯ VIỆN CỦA TÔI", "MY LIBRARY")}</p>
          <h1>
            {text(
              "Kiến thức của bạn, được sắp xếp rõ ràng.",
              "Your knowledge, organized for deeper work.",
            )}
          </h1>
          <p>
            {text(
              "Duyệt theo môn học và danh mục, theo dõi trạng thái AI hoặc tiếp tục đặt câu hỏi.",
              "Browse by subject and category, track AI readiness, or continue asking questions.",
            )}
          </p>
        </div>
      </header>

      <div className="library-shell">
        <button
          type="button"
          className="library-folder-mobile-toggle"
          onClick={() => setFolderOpen(true)}
        >
          <Menu size={17} />
          {text("Thư mục", "Folders")}
          {selectedSubject ? <span>{selectedSubject.name}</span> : null}
        </button>
        <aside className={`library-folder-panel${folderOpen ? " open" : ""}`}>
          <div className="library-folder-header">
            <div>
              <p className="eyebrow">
                {text("CẤU TRÚC LIBRARY", "LIBRARY STRUCTURE")}
              </p>
              <strong>{text("Thư mục học tập", "Study folders")}</strong>
            </div>
            <button
              type="button"
              className="icon-button library-folder-close"
              onClick={() => setFolderOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <button
            type="button"
            className={`library-folder-root${!subjectId ? " active" : ""}`}
            onClick={() => selectFolder()}
          >
            <FolderOpen size={18} />
            <span>{text("Tất cả tài liệu", "All documents")}</span>
          </button>

          <div className="folder-group-heading">
            <span>{text("Môn học", "Subjects")}</span>
            <button
              type="button"
              onClick={() => setAddingSubject((value) => !value)}
            >
              <Plus size={14} />
              {text("Thêm nhanh", "Quick add")}
            </button>
          </div>
          {addingSubject ? (
            <div className="folder-quick-add">
              <input
                value={newSubjectName}
                onChange={(event) => setNewSubjectName(event.target.value)}
                placeholder={text("Tên môn học", "Subject name")}
              />
              <input
                value={newSubjectCode}
                onChange={(event) => setNewSubjectCode(event.target.value)}
                placeholder={text("Mã", "Code")}
              />
              <button
                type="button"
                onClick={handleCreateSubject}
                disabled={isCreating || !newSubjectName.trim()}
              >
                {text("Lưu", "Save")}
              </button>
            </div>
          ) : null}

          <div className="folder-group-heading" style={{ marginTop: "8px" }}>
            <span>{text("Danh mục", "Categories")}</span>
            <button
              type="button"
              onClick={() => setAddingCategory((value) => !value)}
            >
              <Plus size={14} />
              {text("Thêm nhanh", "Quick add")}
            </button>
          </div>
          {addingCategory ? (
            <div className="folder-quick-add folder-quick-add--category">
              <input
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder={text("Tên danh mục", "Category name")}
              />
              <button
                type="button"
                onClick={handleCreateCategory}
                disabled={isCreating || !newCategoryName.trim()}
              >
                {text("Lưu", "Save")}
              </button>
            </div>
          ) : null}

          <nav
            className="library-folder-tree"
            aria-label={text(
              "Thư mục theo môn học và danh mục",
              "Subject and category folders",
            )}
          >
            {subjects.map((subject) => {
              const expanded = expandedSubjects.has(subject.id);
              const active = subjectId === subject.id && !categoryId;
              const isEditingSubject = editingSubjectId === subject.id;
              // Use the per-subject loaded categories (from API with subjectId filter)
              const loadedCategories = subjectCategoriesMap[subject.id] ?? [];

              return (
                <div className="folder-subject" key={subject.id}>
                  {isEditingSubject ? (
                    <form
                      onSubmit={(e) => handleUpdateSubject(subject.id, e)}
                      className="folder-rename-form"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={editSubjectName}
                        onChange={(e) => setEditSubjectName(e.target.value)}
                        autoFocus
                        className="rename-input"
                        placeholder={text("Tên môn học", "Subject name")}
                      />
                      <input
                        type="text"
                        value={editSubjectCode}
                        onChange={(e) => setEditSubjectCode(e.target.value)}
                        className="rename-code-input"
                        placeholder={text("Mã", "Code")}
                      />
                      <button
                        type="submit"
                        className="folder-action-confirm-btn"
                        title={text("Lưu", "Save")}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="folder-action-cancel-btn"
                        title={text("Hủy", "Cancel")}
                      >
                        <X size={14} />
                      </button>
                    </form>
                  ) : (
                    <div
                      className={`folder-subject-row${active ? " active" : ""}`}
                    >
                      <button
                        type="button"
                        className="folder-expand"
                        onClick={() => toggleSubject(subject.id)}
                        aria-expanded={expanded}
                      >
                        {expanded ? (
                          <ChevronDown size={15} />
                        ) : (
                          <ChevronRight size={15} />
                        )}
                      </button>
                      <button
                        type="button"
                        className="folder-select"
                        onClick={() => selectFolder(subject.id)}
                      >
                        <Folder size={17} />
                        <span>{subject.name}</span>
                        <small>{subject.code}</small>
                      </button>
                      <div
                        className="folder-action-container"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className={`folder-actions-trigger${activeMenu?.type === "subject" && activeMenu?.id === subject.id ? " active" : ""}`}
                          onClick={(e) =>
                            handleMenuToggle(e, "subject", subject.id)
                          }
                          title={text("Thao tác", "Actions")}
                        >
                          <MoreVertical size={14} />
                        </button>
                        {activeMenu?.type === "subject" &&
                          activeMenu?.id === subject.id && (
                            <div className="folder-dropdown-menu">
                              <button
                                type="button"
                                className="folder-dropdown-item"
                                onClick={(e) => startEditSubject(subject, e)}
                              >
                                <Edit2 size={13} />
                                {text("Sửa tên", "Rename")}
                              </button>
                              <button
                                type="button"
                                className="folder-dropdown-item danger"
                                onClick={(e) =>
                                  handleDeleteSubject(subject.id, e)
                                }
                              >
                                <Trash2 size={13} />
                                {text("Xóa", "Delete")}
                              </button>
                            </div>
                          )}
                      </div>
                    </div>
                  )}

                  {expanded ? (
                    <div className="folder-categories">
                      {loadedCategories.length === 0 ? (
                        <p className="folder-empty-hint">
                          {text("Chưa có danh mục", "No categories yet")}
                        </p>
                      ) : (
                        loadedCategories.map((category) => {
                          const isEditingCategory =
                            editingCategoryId === category.id;
                          const isCategoryActive =
                            subjectId === subject.id &&
                            categoryId === category.id;

                          return isEditingCategory ? (
                            <form
                              key={category.id}
                              onSubmit={(e) =>
                                handleUpdateCategory(category.id, e)
                              }
                              className="folder-rename-form folder-rename-form--category"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="text"
                                value={editCategoryName}
                                onChange={(e) =>
                                  setEditCategoryName(e.target.value)
                                }
                                autoFocus
                                className="rename-input"
                                placeholder={text(
                                  "Tên danh mục",
                                  "Category name",
                                )}
                              />
                              <button
                                type="submit"
                                className="folder-action-confirm-btn"
                                title={text("Lưu", "Save")}
                              >
                                <Check size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="folder-action-cancel-btn"
                                title={text("Hủy", "Cancel")}
                              >
                                <X size={14} />
                              </button>
                            </form>
                          ) : (
                            <div
                              key={category.id}
                              className={`folder-category-row${isCategoryActive ? " active" : ""}`}
                            >
                              <button
                                type="button"
                                className={`folder-category-select${isCategoryActive ? " active" : ""}`}
                                onClick={() =>
                                  selectFolder(subject.id, category.id)
                                }
                              >
                                <FileText size={14} />
                                <span>{category.name}</span>
                              </button>
                              <div
                                className="folder-action-container"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className={`folder-actions-trigger${activeMenu?.type === "category" && activeMenu?.id === category.id ? " active" : ""}`}
                                  onClick={(e) =>
                                    handleMenuToggle(e, "category", category.id)
                                  }
                                  title={text("Thao tác", "Actions")}
                                >
                                  <MoreVertical size={14} />
                                </button>
                                {activeMenu?.type === "category" &&
                                  activeMenu?.id === category.id && (
                                    <div className="folder-dropdown-menu">
                                      <button
                                        type="button"
                                        className="folder-dropdown-item"
                                        onClick={(e) =>
                                          startEditCategory(category, e)
                                        }
                                      >
                                        <Edit2 size={13} />
                                        {text("Sửa tên", "Rename")}
                                      </button>
                                      <button
                                        type="button"
                                        className="folder-dropdown-item danger"
                                        onClick={(e) =>
                                          handleDeleteCategory(category.id, e)
                                        }
                                      >
                                        <Trash2 size={13} />
                                        {text("Xóa", "Delete")}
                                      </button>
                                    </div>
                                  )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>
        </aside>

        <section className="library-content">
          <section className="library-controls">
            <div className="library-controls-row-1">
              <label className="library-search">
                <Search size={18} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={text(
                    "Tìm theo tiêu đề, mô tả hoặc tên tệp...",
                    "Search title, description, or file name...",
                  )}
                />
              </label>
              <Link
                href={ROUTES.upload}
                className="primary-button upload-btn-cta"
              >
                <Upload size={17} />
                {text("Tải tài liệu lên", "Upload document")}
              </Link>
            </div>
            <div className="library-breadcrumb">
              <button type="button" onClick={() => selectFolder()}>
                {text("Tất cả tài liệu", "All documents")}
              </button>
              {selectedSubject ? (
                <>
                  <ChevronRight size={14} />
                  <button
                    type="button"
                    onClick={() => selectFolder(selectedSubject.id)}
                  >
                    {selectedSubject.name}
                  </button>
                </>
              ) : null}
              {selectedCategory ? (
                <>
                  <ChevronRight size={14} />
                  <strong>{selectedCategory.name}</strong>
                </>
              ) : null}
            </div>
            <div className="library-controls-row-2">
              <div className="library-filters-scroll-container">
                <div className="library-filters">
                  <select
                    value={fileType}
                    onChange={(event) => {
                      setFileType(event.target.value);
                      setPage(1);
                    }}
                    className={fileType ? "filter-active" : ""}
                  >
                    <option value="">
                      {text("Tất cả loại tệp", "All file types")}
                    </option>
                    {["PDF", "DOCX", "PPTX", "XLSX"].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                  <select
                    value={status}
                    onChange={(event) => {
                      setStatus(event.target.value);
                      setPage(1);
                    }}
                    className={status ? "filter-active" : ""}
                  >
                    <option value="">
                      {text("Tất cả trạng thái AI", "All AI statuses")}
                    </option>
                    <option value="COMPLETED">
                      {text("AI sẵn sàng", "AI ready")}
                    </option>
                    <option value="PROCESSING">
                      {text("Đang xử lý", "Processing")}
                    </option>
                    <option value="PENDING">
                      {text("Đang chờ", "Pending")}
                    </option>
                    <option value="FAILED">{text("Thất bại", "Failed")}</option>
                  </select>
                  <select
                    value={visibility}
                    onChange={(event) => {
                      setVisibility(event.target.value);
                      setPage(1);
                    }}
                    className={visibility ? "filter-active" : ""}
                  >
                    <option value="">
                      {text("Tất cả quyền hiển thị", "All visibility")}
                    </option>
                    <option value="PUBLIC">
                      {text("Công khai", "Public")}
                    </option>
                    <option value="PRIVATE">
                      {text("Riêng tư", "Private")}
                    </option>
                  </select>
                  <select
                    value={sortBy}
                    onChange={(event) => {
                      setSortBy(event.target.value);
                      setPage(1);
                    }}
                    className={sortBy !== "newest" ? "filter-active" : ""}
                  >
                    <option value="newest">{text("Mới nhất", "Newest")}</option>
                    <option value="oldest">{text("Cũ nhất", "Oldest")}</option>
                    <option value="name-asc">
                      {text("Tên A-Z", "Name A-Z")}
                    </option>
                    <option value="size-desc">
                      {text("Dung lượng", "File size")}
                    </option>
                  </select>
                  {activeFilters ? (
                    <button
                      type="button"
                      className="clear-filters-btn"
                      onClick={clearFilters}
                    >
                      <X size={14} />
                      {text("Xóa bộ lọc", "Clear filters")}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="view-toggle">
                <button
                  type="button"
                  className={view === "table" ? "active" : ""}
                  onClick={() => setView("table")}
                >
                  <List size={17} />
                </button>
                <button
                  type="button"
                  className={view === "grid" ? "active" : ""}
                  onClick={() => setView("grid")}
                >
                  <Grid2X2 size={17} />
                </button>
              </div>
            </div>
          </section>

          {errorMessage ? (
            <div className="library-api-error" role="alert">
              <strong>
                {text(
                  "Không thể hoàn tất yêu cầu",
                  "The request could not be completed",
                )}
              </strong>
              <p>{errorMessage}</p>
              <button type="button" onClick={() => window.location.reload()}>
                {text("Thử lại", "Retry")}
              </button>
            </div>
          ) : null}

          <div className="library-result-count">
            <strong>
              {pagination.total} {text("tài liệu", "documents")}
            </strong>
            <span>
              {selectedCategory?.name ||
                selectedSubject?.name ||
                text("Toàn bộ Library", "Entire Library")}
            </span>
            {someSelected && (
              <span className="library-selection-info">
                ·{" "}
                {text(
                  `Đã chọn ${selectedDocIds.size}`,
                  `${selectedDocIds.size} selected`,
                )}
                <button
                  type="button"
                  className="delete-selected-btn"
                  onClick={handleDeleteSelectedDocuments}
                  disabled={isDeleting}
                >
                  <Trash2 size={14} />
                  {text("Xóa đã chọn", "Delete selected")}
                </button>
                <button
                  type="button"
                  className="clear-selection-btn"
                  onClick={() => setSelectedDocIds(new Set())}
                >
                  <X size={14} />
                  {text("Bỏ chọn", "Clear")}
                </button>
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="library-loading" aria-live="polite">
              <span className="spinner" />
              {text("Đang tải tài liệu...", "Loading documents...")}
            </div>
          ) : documents.length === 0 ? (
            <div className="soft-empty-state library-empty">
              <Search size={28} />
              <strong>
                {text("Không có tài liệu phù hợp", "No matching documents")}
              </strong>
              <p>
                {text(
                  "Thử thư mục khác, xóa bộ lọc hoặc tải tài liệu mới.",
                  "Try another folder, clear filters, or upload a new document.",
                )}
              </p>
            </div>
          ) : view === "table" ? (
            <div className="library-table-wrap">
              <table className="library-table">
                <thead>
                  <tr>
                    <th className="library-table-check">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        aria-label={text("Chọn tất cả", "Select all")}
                      />
                    </th>
                    <th className="library-table-document">
                      {text("Tên file", "File name")}
                    </th>
                    <th className="library-table-actions">
                      {text("Thao tác", "Actions")}
                    </th>
                    <th className="library-table-ai">
                      {text("AI", "AI status")}
                    </th>
                    <th className="library-table-date">
                      {text("Ngày tải", "Uploaded")}
                    </th>
                    <th className="library-table-taxonomy">
                      {text("Môn học / Danh mục", "Subject / Category")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((document) => (
                    <tr
                      key={document.id}
                      className={
                        selectedDocIds.has(document.id) ? "row-selected" : ""
                      }
                    >
                      <td className="library-table-check">
                        <input
                          type="checkbox"
                          checked={selectedDocIds.has(document.id)}
                          onChange={() => toggleDocSelection(document.id)}
                          aria-label={text(
                            `Chọn ${document.title}`,
                            `Select ${document.title}`,
                          )}
                        />
                      </td>
                      <td className="library-table-document">
                        <div className="library-document-cell">
                          <span className="document-type-icon">
                            <DocumentIcon type={document.fileType} />
                          </span>
                          <span>
                            <strong title={document.title}>
                              {document.title}
                            </strong>
                            <small>
                              {document.fileType} ·{" "}
                              {formatFileSize(document.fileSize)} ·{" "}
                              {document.visibility === "PRIVATE"
                                ? text("riêng tư", "private")
                                : text("công khai", "public")}{" "}
                              ·{" "}
                              {document.moderationStatus === "APPROVED"
                                ? text("đã duyệt", "approved")
                                : document.moderationStatus === "REJECTED"
                                  ? text("bị từ chối", "rejected")
                                  : text("chờ duyệt", "pending review")}
                            </small>
                            {document.rejectionReason ? (
                              <small className="form-error">
                                {document.rejectionReason}
                              </small>
                            ) : null}
                          </span>
                        </div>
                      </td>
                      <td className="library-table-actions">
                        <DocumentActions
                          document={document}
                          text={text}
                          isRetrying={retryingDocumentIds.has(document.id)}
                          isPublishing={publishingDocumentIds.has(document.id)}
                          onPreview={() => setPreviewDocument(document)}
                          onDownload={() =>
                            void openObject(document, "download")
                          }
                          onRetry={() => void handleRetryExtraction(document)}
                          onPublish={() => void handlePublishDocument(document)}
                          onUnpublish={() =>
                            void handleUnpublishDocument(document)
                          }
                          onDelete={() =>
                            void handleDeleteSingleDocument(document.id)
                          }
                        />
                      </td>
                      <td className="library-table-ai">
                        <span
                          className={`index-status index-status--${document.indexStatus.toLowerCase()}`}
                        >
                          {getIndexStatusLabel(document.indexStatus)}
                        </span>
                      </td>
                      <td className="library-table-date">
                        {new Date(document.uploadedAt).toLocaleDateString(
                          locale === "vi" ? "vi-VN" : "en-US",
                        )}
                      </td>
                      <td className="library-table-taxonomy">
                        <span className="library-taxonomy-cell">
                          <strong>{document.subject}</strong>
                          <small>{document.category}</small>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <section className="library-card-grid">
              {documents.map((document) => (
                <article
                  className={`library-document-card${selectedDocIds.has(document.id) ? " card-selected" : ""}`}
                  key={document.id}
                >
                  <div className="library-card-top">
                    <label
                      className="card-select-label"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDocIds.has(document.id)}
                        onChange={() => toggleDocSelection(document.id)}
                        aria-label={text(
                          `Chọn ${document.title}`,
                          `Select ${document.title}`,
                        )}
                      />
                    </label>
                    <span className="document-type-icon">
                      <DocumentIcon type={document.fileType} />
                    </span>
                    <span
                      className={`index-status index-status--${document.indexStatus.toLowerCase()}`}
                    >
                      {getIndexStatusLabel(document.indexStatus)}
                    </span>
                  </div>
                  <div>
                    <h2>{document.title}</h2>
                    <p>
                      {document.description ||
                        text("Chưa có mô tả.", "No description yet.")}
                    </p>
                  </div>
                  <div className="library-card-meta">
                    <span>{document.subject}</span>
                    <span>{document.category}</span>
                    <span>{formatFileSize(document.fileSize)}</span>
                  </div>
                  <DocumentActions
                    document={document}
                    text={text}
                    isRetrying={retryingDocumentIds.has(document.id)}
                    isPublishing={publishingDocumentIds.has(document.id)}
                    onPreview={() => setPreviewDocument(document)}
                    onDownload={() => void openObject(document, "download")}
                    onRetry={() => void handleRetryExtraction(document)}
                    onPublish={() => void handlePublishDocument(document)}
                    onUnpublish={() => void handleUnpublishDocument(document)}
                    onDelete={() =>
                      void handleDeleteSingleDocument(document.id)
                    }
                  />
                </article>
              ))}
            </section>
          )}

          {pagination.totalPages > 1 ? (
            <nav
              className="library-pagination"
              aria-label={text("Phân trang tài liệu", "Document pagination")}
            >
              <button
                type="button"
                onClick={() => setPage((value) => value - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft size={16} />
                {text("Trước", "Previous")}
              </button>
              <span>
                {text(
                  `Trang ${page} / ${pagination.totalPages}`,
                  `Page ${page} of ${pagination.totalPages}`,
                )}
              </span>
              <button
                type="button"
                onClick={() => setPage((value) => value + 1)}
                disabled={page >= pagination.totalPages}
              >
                {text("Sau", "Next")}
                <ChevronRight size={16} />
              </button>
            </nav>
          ) : null}
        </section>
      </div>

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

// Hiển thị các thao tác được phép đối với một tài liệu trong thư viện.
export function DocumentActions({
  document,
  text,
  isRetrying,
  isPublishing,
  onPreview,
  onDownload,
  onRetry,
  onPublish,
  onUnpublish,
  onDelete,
}: {
  document: LibraryDocument;
  text: (vi: string, en: string) => string;
  isRetrying: boolean;
  isPublishing: boolean;
  onPreview: () => void;
  onDownload: () => void;
  onRetry: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
}) {
  const retryLabel = isRetrying
    ? text("Đang chạy lại", "Retrying")
    : text("Chạy lại AI", "Retry AI");
  const isApprovedPublic =
    document.visibility === "PUBLIC" &&
    document.moderationStatus === "APPROVED";
  const isPendingPublic =
    document.visibility === "PUBLIC" &&
    document.moderationStatus !== "APPROVED";

  return (
    <div className="document-actions">
      <button
        type="button"
        title={text("Xem", "View")}
        aria-label={text(`Xem ${document.title}`, `View ${document.title}`)}
        onClick={onPreview}
      >
        <Eye size={16} />
      </button>
      <button
        type="button"
        title={text("Tải xuống", "Download")}
        aria-label={text(`Tải ${document.title}`, `Download ${document.title}`)}
        onClick={onDownload}
      >
        <Download size={16} />
      </button>
      {document.visibility === "PRIVATE" ? (
        <button
          type="button"
          className="publish-document-action"
          title={text("Gửi admin kiểm duyệt", "Submit for admin review")}
          aria-label={text(
            `Gửi ${document.title} để kiểm duyệt`,
            `Submit ${document.title} for review`,
          )}
          onClick={onPublish}
          disabled={isPublishing}
        >
          <Globe2 size={16} />
          <span>
            {isPublishing
              ? text("Đang gửi duyệt", "Submitting")
              : text("Gửi kiểm duyệt", "Submit for review")}
          </span>
        </button>
      ) : (
        <button
          type="button"
          className="publish-document-action"
          title={
            isPendingPublic
              ? text("Hủy yêu cầu đăng công khai", "Cancel publication request")
              : text("Gỡ khỏi cộng đồng", "Remove from Community")
          }
          aria-label={
            isPendingPublic
              ? text(
                  `Hủy kiểm duyệt ${document.title}`,
                  `Cancel review for ${document.title}`,
                )
              : text(
                  `Gỡ công khai ${document.title}`,
                  `Make ${document.title} private`,
                )
          }
          onClick={onUnpublish}
          disabled={isPublishing}
        >
          <Globe2 size={16} />
          <span>
            {isPublishing
              ? text("Đang hủy", "Cancelling")
              : isApprovedPublic
                ? text("Công khai", "Public")
                : text("Chờ kiểm duyệt", "Pending review")}
          </span>
        </button>
      )}
      {document.indexStatus === "READY" ? (
        <Link
          href={`${ROUTES.aiChat}?scope=document&document=${document.id}`}
          className="ask-document-action"
        >
          <Bot size={16} />
          <span>{text("Hỏi AI", "Ask AI")}</span>
        </Link>
      ) : document.indexStatus === "FAILED" || isRetrying ? (
        <button
          type="button"
          className="ask-document-action retry-document-action"
          title={retryLabel}
          aria-label={`${retryLabel}: ${document.title}`}
          onClick={onRetry}
          disabled={isRetrying}
        >
          <RefreshCw size={16} className={isRetrying ? "spin" : ""} />
          <span>{retryLabel}</span>
        </button>
      ) : (
        <button type="button" className="ask-document-action disabled" disabled>
          <Bot size={16} />
          <span>{text("Hỏi AI", "Ask AI")}</span>
        </button>
      )}
      <button
        type="button"
        className="delete-document-action"
        title={text("Xóa", "Delete")}
        aria-label={text(`Xóa ${document.title}`, `Delete ${document.title}`)}
        onClick={onDelete}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
