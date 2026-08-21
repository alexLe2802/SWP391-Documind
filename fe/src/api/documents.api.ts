import type { Locale } from "../i18n/translations";
import { API_BASE_URL, ApiError, apiRequest } from "../lib/http";
import type {
  DocumentIndexStatus,
  DocumentVisibility,
  LibraryDocument,
  UploadDocumentInput,
} from "../types/document";

export const MAX_FILE_SIZE = 80 * 1024 * 1024;
export const ACCEPTED_FILE_EXTENSIONS = [
  "pdf",
  "docx",
  "pptx",
  "xlsx",
] as const;

export type SubjectItem = {
  id: string;
  code: string;
  name: string;
  description?: string;
};

export type CategoryItem = {
  id: string;
  subjectId?: string | null;
  name: string;
  description?: string;
};

export type ApiExtractionStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "MOCKED"
  | "FAILED";

export type ApiDocument = {
  id: string;
  title: string;
  description: string | null;
  fileName: string;
  fileType: string;
  fileSize: string | number;
  subject: { id: string; name: string; code?: string };
  category: { id: string; name: string };
  tags: Array<{ id: string; name: string }>;
  aiStatus: ApiExtractionStatus;
  visibility: DocumentVisibility;
  status: string;
  createdAt: string;
  updatedAt: string;
  moderationStatus?: LibraryDocument["moderationStatus"];
  moderationFlag?: LibraryDocument["moderationFlag"];
  rejectionReason?: string | null;
  version?: number;
};

export type ExtractionStatusResponse = {
  documentId: string;
  jobId: string;
  extractionStatus: ApiExtractionStatus;
  progress?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  updatedAt: string;
};

export type DocumentListQuery = {
  search?: string;
  subjectId?: string;
  categoryId?: string;
  fileType?: string;
  aiStatus?: ApiExtractionStatus;
  visibility?: DocumentVisibility | "";
  savedOnly?: boolean;
  ownerOnly?: boolean;
  sortBy?: "createdAt" | "title" | "fileSize";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
};

export type DocumentListResult = {
  items: LibraryDocument[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type DocumentListApiResponse = {
  data: ApiDocument[];
  pagination: DocumentListResult["pagination"];
};

// Kiểm tra điều kiện tài liệu tệp.
export function validateDocumentFile(
  file: File,
  locale: Locale = "vi",
): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !ACCEPTED_FILE_EXTENSIONS.includes(extension as never)) {
    return locale === "vi"
      ? "Hãy sử dụng tệp PDF, DOCX, PPTX hoặc XLSX."
      : "Use a PDF, DOCX, PPTX, or XLSX file.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return locale === "vi"
      ? "Kích thước tệp không được vượt quá 80 MB."
      : "File size must be 80 MB or smaller.";
  }
  if (file.size === 0) {
    return locale === "vi"
      ? "Tệp không được để trống."
      : "The file cannot be empty.";
  }
  return null;
}

// Lấy dữ liệu missing tải lên fields.
export function getMissingUploadFields(input: {
  file?: File;
  title: string;
  subjectId: string;
  categoryId: string;
}) {
  const missing: Array<"file" | "title" | "subject" | "category"> = [];
  if (!input.file) missing.push("file");
  if (!input.title.trim()) missing.push("title");
  if (!input.subjectId) missing.push("subject");
  if (!input.categoryId) missing.push("category");
  return missing;
}

// Thực hiện chức năng tệp type from mime.
function fileTypeFromMime(mime: string, fileName: string) {
  const extension = fileName.split(".").pop()?.toUpperCase();
  if (extension && ["PDF", "DOCX", "PPTX", "XLSX"].includes(extension))
    return extension;
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("wordprocessing")) return "DOCX";
  if (mime.includes("presentation")) return "PPTX";
  if (mime.includes("spreadsheet")) return "XLSX";
  return extension ?? "FILE";
}

// Chuyển đổi hoặc chuẩn hóa index trạng thái.
function mapIndexStatus(status: ApiExtractionStatus): DocumentIndexStatus {
  if (status === "COMPLETED" || status === "MOCKED") return "READY";
  if (status === "FAILED") return "FAILED";
  if (status === "PENDING") return "PENDING";
  return "PROCESSING";
}

// Chuyển đổi hoặc chuẩn hóa api tài liệu.
export function mapApiDocument(document: ApiDocument): LibraryDocument {
  return {
    id: document.id,
    title: document.title,
    description: document.description ?? "",
    subjectId: document.subject.id,
    subject: document.subject.name,
    categoryId: document.category.id,
    category: document.category.name,
    tags: document.tags.map((tag) => tag.name),
    visibility: document.visibility,
    fileName: document.fileName,
    fileType: fileTypeFromMime(document.fileType, document.fileName),
    fileSize: Number(document.fileSize),
    pages: 0,
    uploadedAt: document.createdAt,
    indexStatus: mapIndexStatus(document.aiStatus),
    moderationStatus: document.moderationStatus,
    moderationFlag: document.moderationFlag,
    rejectionReason: document.rejectionReason ?? undefined,
    version: document.version,
  };
}

// Lấy dữ liệu môn học.
export function fetchSubjects() {
  return apiRequest<SubjectItem[]>("/subjects");
}

// Tạo hoặc lưu môn học.
export function createSubject(name: string, code: string) {
  return apiRequest<SubjectItem>("/subjects", {
    method: "POST",
    body: { name, code, description: "" },
  });
}

// Lấy dữ liệu danh mục.
export function fetchCategories(subjectId?: string) {
  const params = new URLSearchParams();
  if (subjectId) params.set("subjectId", subjectId);
  return apiRequest<CategoryItem[]>(
    `/categories${params.size ? `?${params}` : ""}`,
  );
}

// Tạo hoặc lưu danh mục.
export function createCategory(name: string, subjectId: string) {
  return apiRequest<CategoryItem>("/categories", {
    method: "POST",
    body: { name, subjectId, description: "" },
  });
}

// Cập nhật môn học.
export function updateSubject(id: string, name: string, code: string) {
  return apiRequest<SubjectItem>(`/subjects/${id}`, {
    method: "PATCH",
    body: { name, code, description: "" },
  });
}

// Xóa hoặc giải phóng môn học.
export function deleteSubject(id: string) {
  return apiRequest<{ success: boolean }>(`/subjects/${id}`, {
    method: "DELETE",
  });
}

// Cập nhật danh mục.
export function updateCategory(id: string, name: string, subjectId?: string) {
  return apiRequest<CategoryItem>(`/categories/${id}`, {
    method: "PATCH",
    body: { name, subjectId, description: "" },
  });
}

// Xóa hoặc giải phóng danh mục.
export function deleteCategory(id: string) {
  return apiRequest<{ success: boolean }>(`/categories/${id}`, {
    method: "DELETE",
  });
}

// Xóa hoặc giải phóng tài liệu.
export function deleteDocument(id: string) {
  return apiRequest<{ success: boolean }>(`/documents/${id}`, {
    method: "DELETE",
  });
}

// Cập nhật tài liệu quyền hiển thị.
export async function updateDocumentVisibility(
  id: string,
  visibility: DocumentVisibility,
): Promise<LibraryDocument> {
  const document = await apiRequest<ApiDocument>(
    `/documents/${id}/visibility`,
    {
      method: "PUT",
      body: { visibility },
    },
  );
  return mapApiDocument(document);
}

// Lấy dữ liệu library tài liệu.
export async function fetchLibraryDocuments(
  query: DocumentListQuery = {},
): Promise<DocumentListResult> {
  const { ownerOnly, ...rest } = query;
  const params = new URLSearchParams();
  const shouldLimitToOwner = ownerOnly ?? !query.savedOnly;
  if (shouldLimitToOwner) params.set("ownerOnly", "true");
  Object.entries(rest).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const result = await apiRequest<DocumentListApiResponse>(
    `/documents?${params}`,
  );
  return {
    items: result.data.map(mapApiDocument),
    pagination: result.pagination,
  };
}

// Lấy dữ liệu tài liệu.
export async function fetchDocument(id: string) {
  return mapApiDocument(await apiRequest<ApiDocument>(`/documents/${id}`));
}

// Lấy dữ liệu extraction trạng thái.
export function fetchExtractionStatus(id: string) {
  return apiRequest<ExtractionStatusResponse>(
    `/documents/${id}/extraction-status`,
  );
}

// Xử lý extraction.
export function retryExtraction(id: string) {
  return apiRequest<{
    documentId: string;
    jobId: string;
    extractionStatus: ApiExtractionStatus;
  }>(`/documents/${id}/extract`, { method: "POST" });
}

// Tạo hoặc lưu xem trước url.
export function createPreviewUrl(id: string) {
  return apiRequest<{
    url: string;
    expiresAt?: string;
    contentType?: string;
    fallbackToOfficeViewer?: boolean;
  }>(`/documents/${id}/preview`, { preserveSessionOnUnauthorized: true });
}

// Tạo hoặc lưu tải xuống url.
export function createDownloadUrl(id: string) {
  return apiRequest<{ url: string; expiresAt?: string }>(
    `/documents/${id}/download`,
  );
}

// Tạo hoặc lưu tải lên tài liệu.
export async function uploadDocument(
  input: UploadDocumentInput,
  onProgress: (progress: number) => void,
): Promise<LibraryDocument> {
  const body = new FormData();
  body.append("file", input.file);
  body.append("title", input.title);
  body.append("description", input.description);
  body.append("subjectId", input.subjectId);
  body.append("categoryId", input.categoryId);
  body.append("visibility", input.visibility);
  if (input.tags.length) body.append("tags", JSON.stringify(input.tags));

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/documents`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () =>
      reject(new ApiError("Network error while uploading", 0));
    xhr.onload = () => {
      let payload: unknown;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        reject(new ApiError("Invalid upload response", xhr.status));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const envelope = payload as {
          error?: { message?: string };
          message?: string;
        };
        reject(
          new ApiError(
            envelope.error?.message ?? envelope.message ?? "Upload failed",
            xhr.status,
          ),
        );
        return;
      }
      const envelope = payload as { success?: boolean; data?: ApiDocument };
      const document = envelope.success
        ? envelope.data
        : (payload as ApiDocument);
      if (!document) {
        reject(
          new ApiError(
            "Upload response did not include a document",
            xhr.status,
          ),
        );
        return;
      }
      resolve(mapApiDocument(document));
    };
    xhr.send(body);
  });
}

// Chuyển đổi hoặc chuẩn hóa tệp size.
export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
