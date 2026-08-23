import { apiRequest } from "../lib/http";
import * as mock from "./admin.mock";

export type DocumentQuery = {
  page?: number;
  limit?: number;
  keyword?: string;
  visibility?: string;
  status?: string;
  aiStatus?: string;
  moderationStatus?: string;
  moderationFlag?: string;
};

export type DocumentListResponse = {
  items: mock.AdminDocument[];
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
};

type ApiAdminDocument = {
  id: string;
  title: string;
  description: string | null;
  fileName: string;
  fileType: string;
  fileSize: string | number;
  subject: { id: string; name: string };
  category: { id: string; name: string };
  tags: Array<{ id: string; name: string }>;
  aiStatus: mock.AdminDocument["aiStatus"];
  visibility: mock.AdminDocument["visibility"];
  status: mock.AdminDocument["status"];
  moderationReason?: string | null;
  moderationStatus?: mock.AdminDocument["moderationStatus"];
  moderationFlag?: mock.AdminDocument["moderationFlag"];
  rejectionReason?: string | null;
  matchedKeywords?: string[];
  matchedContexts?: Array<{ keyword: string; excerpt: string }>;
  submittedAt?: string;
  reviewedAt?: string | null;
  version?: number;
  owner: {
    fullName: string | null;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
};

type ApiAdminDocumentListResponse =
  | {
      data: ApiAdminDocument[];
      meta: DocumentListResponse["meta"];
    }
  | {
      items: ApiAdminDocument[];
      meta: DocumentListResponse["meta"];
    };

const USE_MOCKS =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_USE_MOCK_API === "true";

// Chuyển đổi hoặc chuẩn hóa query string.
function toQueryString(query: Record<string, unknown>) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  });
  const text = params.toString();
  return text ? `?${text}` : "";
}

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

// Chuyển đổi hoặc chuẩn hóa admin tài liệu.
function mapAdminDocument(document: ApiAdminDocument): mock.AdminDocument {
  return {
    id: document.id,
    title: document.title,
    description: document.description ?? "",
    fileName: document.fileName,
    fileType: fileTypeFromMime(document.fileType, document.fileName),
    fileSize: Number(document.fileSize),
    subjectId: document.subject.id,
    subject: document.subject.name,
    categoryId: document.category.id,
    category: document.category.name,
    tags: document.tags.map((tag) => tag.name),
    pages: 0,
    visibility: document.visibility,
    aiStatus: document.aiStatus,
    status: document.status,
    moderationReason: document.moderationReason ?? undefined,
    moderationStatus: document.moderationStatus,
    moderationFlag: document.moderationFlag,
    rejectionReason: document.rejectionReason ?? undefined,
    matchedKeywords: document.matchedKeywords ?? [],
    matchedContexts: document.matchedContexts ?? [],
    submittedAt: document.submittedAt,
    reviewedAt: document.reviewedAt,
    version: document.version,
    owner: {
      fullName: document.owner.fullName ?? document.owner.email,
      email: document.owner.email,
    },
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    indexStatus:
      document.aiStatus === "COMPLETED" || document.aiStatus === "MOCKED"
        ? "READY"
        : document.aiStatus === "FAILED"
          ? "FAILED"
          : document.aiStatus === "PENDING"
            ? "PENDING"
            : "PROCESSING",
  };
}

// Chuyển đổi hoặc chuẩn hóa admin tài liệu list.
function normalizeAdminDocumentList(
  response: ApiAdminDocumentListResponse,
): DocumentListResponse {
  const items = "items" in response ? response.items : response.data;
  return {
    items: items.map(mapAdminDocument),
    meta: response.meta,
  };
}

// ----------------------------------------------------
// Dashboard Service Functions
// ----------------------------------------------------

export async function getDashboardSummary(): Promise<mock.AdminDashboardSummary> {
  if (USE_MOCKS) {
    return mock.mockGetDashboardSummary();
  }
  const res = await apiRequest<{
    totalUsers: number;
    totalDocuments: number;
    totalPublicDocuments: number;
    totalPrivateDocuments: number;
    totalChats: number;
    totalDownloads: number;
  }>("/admin/dashboard/summary");

  return {
    totalUsers: res.totalUsers,
    totalDocuments: res.totalDocuments,
    publicDocuments: res.totalPublicDocuments,
    privateDocuments: res.totalPrivateDocuments,
    totalChats: res.totalChats,
    totalDownloads: res.totalDownloads,
  };
}

// Lấy dữ liệu dashboard statistics.
export async function getDashboardStatistics(): Promise<{
  bySubject: mock.SubjectStat[];
  byCategory: mock.CategoryStat[];
}> {
  if (USE_MOCKS) {
    return mock.mockGetDashboardStatistics();
  }
  const res = await apiRequest<{
    documents: {
      bySubject: { id: string; code: string; name: string; count: number }[];
      byCategory: { id: string; name: string; count: number }[];
    };
  }>("/admin/dashboard/statistics");

  return {
    bySubject: res.documents.bySubject.map((s) => ({
      id: s.id,
      subject: s.name,
      count: s.count,
    })),
    byCategory: res.documents.byCategory.map((c) => ({
      id: c.id,
      category: c.name,
      count: c.count,
    })),
  };
}

// Lấy dữ liệu tải lên statistics.
export async function getUploadStatistics(): Promise<mock.UploadStatItem[]> {
  if (USE_MOCKS) {
    return mock.mockGetUploadStatistics();
  }
  const res = await apiRequest<{
    data: mock.UploadStatItem[];
  }>("/admin/dashboard/upload-statistics");
  return res.data;
}

// ----------------------------------------------------
// Document Moderation Service Functions
// ----------------------------------------------------

export async function getAdminDocuments(
  query: DocumentQuery = {},
): Promise<DocumentListResponse> {
  if (USE_MOCKS) {
    return mock.mockGetAdminDocuments(query);
  }
  const response = await apiRequest<ApiAdminDocumentListResponse>(
    `/admin/documents${toQueryString(query)}`,
  );
  return normalizeAdminDocumentList(response);
}

// Thực hiện chức năng hide tài liệu.
export function hideDocument(
  id: string,
  reason?: string,
): Promise<mock.AdminDocument> {
  if (USE_MOCKS) {
    return mock.mockHideDocument(id, reason);
  }
  return apiRequest<mock.AdminDocument>(`/admin/documents/${id}/hide`, {
    method: "PUT",
    body: {
      hidden: true,
      reason: reason || "Violation of academic integrity.",
    },
  });
}

// Thực hiện chức năng unhide tài liệu.
export function unhideDocument(id: string): Promise<mock.AdminDocument> {
  if (USE_MOCKS) {
    return mock.mockUnhideDocument(id);
  }
  return apiRequest<mock.AdminDocument>(`/admin/documents/${id}/hide`, {
    method: "PUT",
    body: { hidden: false },
  });
}

type ModerationActionResponse = Pick<
  mock.AdminDocument,
  "id" | "moderationStatus" | "moderationFlag" | "rejectionReason" | "updatedAt"
>;

// Thực hiện nghiệp vụ approve tài liệu.
export function approveDocument(id: string) {
  return apiRequest<ModerationActionResponse>(
    `/admin/documents/${id}/approve`,
    { method: "PUT" },
  );
}

// Thực hiện nghiệp vụ reject tài liệu.
export function rejectDocument(id: string, reason: string) {
  return apiRequest<ModerationActionResponse>(`/admin/documents/${id}/reject`, {
    method: "PUT",
    body: { reason },
  });
}

// Tạo hoặc lưu admin tài liệu xem trước url.
export function createAdminDocumentPreviewUrl(id: string) {
  return apiRequest<{
    url: string;
    contentType?: string;
    fallbackToOfficeViewer?: boolean;
  }>(`/admin/documents/${id}/preview`, {
    preserveSessionOnUnauthorized: true,
  });
}
