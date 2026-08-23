import { apiRequest } from "../lib/http";
import type { CommunityDocument } from "../types/community";

type ApiCommunityDocument = {
  id: string;
  title: string;
  description: string | null;
  fileName: string;
  fileType: string;
  fileSize: string | number;
  subject: { id: string; name: string; code?: string };
  category: { id: string; name: string };
  owner: {
    id: string;
    fullName: string | null;
    email: string;
    avatarUrl?: string | null;
  };
  tags: Array<{ tag: { id: string; name: string } }>;
  summary: string | null;
  saveCount: number;
  saved: boolean;
  owned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CommunityDocumentQuery = {
  q?: string;
  categoryId?: string;
  subjectId?: string;
  fileType?: "pdf" | "docx" | "pptx" | "xlsx";
  sortBy?:
    | "createdAt"
    | "updatedAt"
    | "title"
    | "downloadCount"
    | "saveCount"
    | "viewCount";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
};

type CommunityDocumentListResult = {
  items: CommunityDocument[];
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
};

// Thực hiện chức năng tệp type from mime.
function fileTypeFromMime(mime: string, fileName: string) {
  const extension = fileName.split(".").pop()?.toUpperCase();
  if (
    extension &&
    ["PDF", "DOC", "DOCX", "PPT", "PPTX", "XLS", "XLSX"].includes(extension)
  )
    return extension;
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("word")) return "DOCX";
  if (mime.includes("presentation") || mime.includes("powerpoint"))
    return "PPTX";
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "XLSX";
  return extension ?? "FILE";
}

// Chuyển đổi hoặc chuẩn hóa tệp size.
function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Thực hiện chức năng accent for tài liệu.
function accentForDocument(
  document: ApiCommunityDocument,
): CommunityDocument["accent"] {
  const accents: Array<CommunityDocument["accent"]> = [
    "blue",
    "amber",
    "green",
    "rose",
  ];
  const seed = document.id
    .split("")
    .reduce((total, char) => total + char.charCodeAt(0), 0);
  return accents[seed % accents.length];
}

// Chuyển đổi hoặc chuẩn hóa api cộng đồng tài liệu.
export function mapApiCommunityDocument(
  document: ApiCommunityDocument,
): CommunityDocument {
  return {
    id: document.id,
    title: document.title,
    description: document.description || document.summary || "",
    subject: document.subject.name,
    category: document.category.name,
    fileType: fileTypeFromMime(document.fileType, document.fileName),
    fileSize: formatFileSize(Number(document.fileSize)),
    pages: 0,
    owner: document.owner.fullName || document.owner.email,
    savedCount: document.saveCount,
    saved: document.saved,
    owned: document.owned,
    updatedAt: document.updatedAt,
    accent: accentForDocument(document),
  };
}

// Lấy dữ liệu cộng đồng tài liệu.
export async function fetchCommunityDocuments(
  query: CommunityDocumentQuery = {},
): Promise<CommunityDocumentListResult> {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });

  const path = `/community/documents${params.size ? `?${params}` : ""}`;
  const result = await apiRequest<{
    items: ApiCommunityDocument[];
    meta: CommunityDocumentListResult["meta"];
  }>(path);

  return {
    items: result.items.map(mapApiCommunityDocument),
    meta: result.meta,
  };
}

// Tạo hoặc lưu cộng đồng tài liệu.
export function saveCommunityDocument(id: string) {
  return apiRequest<{ documentId: string; saved: true; savedAt: string }>(
    `/community/documents/${id}/save`,
    { method: "POST" },
  );
}

// Thực hiện chức năng unsave cộng đồng tài liệu.
export function unsaveCommunityDocument(id: string) {
  return apiRequest<void>(`/community/documents/${id}/save`, {
    method: "DELETE",
  });
}

// Tạo hoặc lưu cộng đồng xem trước url.
export function createCommunityPreviewUrl(id: string) {
  return apiRequest<{
    url: string;
    contentType?: string;
    fallbackToOfficeViewer?: boolean;
  }>(`/community/documents/${id}/preview`);
}
