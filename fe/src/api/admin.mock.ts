import type { CurrentUser } from "../types/auth";
import type { LibraryDocument } from "../types/document";

export type AdminDashboardSummary = {
  totalUsers: number;
  totalDocuments: number;
  publicDocuments: number;
  privateDocuments: number;
  totalChats: number;
  totalDownloads: number;
};

export type SubjectStat = {
  id: string;
  subject: string;
  count: number;
};

export type CategoryStat = {
  id: string;
  category: string;
  count: number;
};

export type UploadStatItem = {
  date: string;
  count: number;
};

export type AdminDocument = Omit<LibraryDocument, "uploadedAt"> & {
  aiStatus: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "MOCKED";
  status: "ACTIVE" | "HIDDEN" | "DELETED";
  moderationReason?: string;
  moderationStatus?: "PENDING" | "APPROVED" | "REJECTED";
  moderationFlag?: "NORMAL" | "FLAGGED" | "SCAN_FAILED";
  rejectionReason?: string;
  matchedKeywords?: string[];
  matchedContexts?: Array<{ keyword: string; excerpt: string }>;
  submittedAt?: string;
  reviewedAt?: string | null;
  version?: number;
  owner: {
    fullName: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
};

// ----------------------------------------------------
// Mock Data Store (In-Memory for Demo Statefulness)
// ----------------------------------------------------

let mockUsers: CurrentUser[] = [
  {
    id: "u-1",
    fullName: "Lê Đăng Khoa",
    email: "khoa.le@fpt.edu.vn",
    avatarUrl: null,
    role: "ADMIN",
    status: "ACTIVE",
    createdAt: "2026-05-10T08:00:00.000Z",
    lastLogin: "2026-06-19T21:30:00.000Z",
    authProvider: "EMAIL_PASSWORD",
  },
  {
    id: "u-2",
    fullName: "Nguyễn Văn A",
    email: "a.nguyen@fpt.edu.vn",
    avatarUrl:
      "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60",
    role: "USER",
    status: "ACTIVE",
    createdAt: "2026-06-01T12:00:00.000Z",
    lastLogin: "2026-06-18T10:15:00.000Z",
    authProvider: "GOOGLE",
  },
  {
    id: "u-3",
    fullName: "Trần Thị B",
    email: "b.tran@fpt.edu.vn",
    avatarUrl: null,
    role: "USER",
    status: "BLOCKED",
    createdAt: "2026-06-03T15:30:00.000Z",
    lastLogin: "2026-06-05T09:20:00.000Z",
    authProvider: "EMAIL_PASSWORD",
  },
  {
    id: "u-4",
    fullName: "Phạm Văn C",
    email: "c.pham@fpt.edu.vn",
    avatarUrl: null,
    role: "USER",
    status: "INACTIVE",
    createdAt: "2026-06-10T11:45:00.000Z",
    lastLogin: null,
    authProvider: "EMAIL_PASSWORD",
  },
  {
    id: "u-5",
    fullName: "Hoàng Thị D",
    email: "d.hoang@fpt.edu.vn",
    avatarUrl: null,
    role: "USER",
    status: "ACTIVE",
    createdAt: "2026-06-12T09:10:00.000Z",
    lastLogin: "2026-06-19T14:00:00.000Z",
    authProvider: "GOOGLE",
  },
];

let mockDocuments: AdminDocument[] = [
  {
    id: "d-1",
    title: "Distributed Systems Field Notes",
    description:
      "Consensus, replication, failure models, and practical system design tradeoffs.",
    fileName: "distributed-systems-notes.pdf",
    fileType: "PDF",
    fileSize: 4820000,
    subjectId: "subject-cs",
    subject: "Computer Science",
    categoryId: "category-systems",
    category: "Systems",
    tags: ["consensus", "replication"],
    aiStatus: "COMPLETED",
    visibility: "PRIVATE",
    status: "ACTIVE",
    owner: {
      fullName: "Lê Đăng Khoa",
      email: "khoa.le@fpt.edu.vn",
    },
    pages: 42,
    createdAt: "2026-06-12T08:30:00.000Z",
    updatedAt: "2026-06-12T08:40:00.000Z",
    indexStatus: "READY",
  },
  {
    id: "d-2",
    title: "Research Methods Handbook",
    description:
      "Research questions, literature reviews, sampling, and evidence quality.",
    fileName: "research-methods.docx",
    fileType: "DOCX",
    fileSize: 2140000,
    subjectId: "subject-research",
    subject: "Research",
    categoryId: "category-methodology",
    category: "Methodology",
    tags: ["research", "evidence"],
    aiStatus: "COMPLETED",
    visibility: "PUBLIC",
    status: "ACTIVE",
    owner: {
      fullName: "Nguyễn Văn A",
      email: "a.nguyen@fpt.edu.vn",
    },
    pages: 68,
    createdAt: "2026-06-09T11:10:00.000Z",
    updatedAt: "2026-06-09T11:15:00.000Z",
    indexStatus: "READY",
  },
  {
    id: "d-3",
    title: "Applied Machine Learning Review",
    description:
      "Model selection, evaluation metrics, leakage, and deployment checks.",
    fileName: "applied-ml-review.pptx",
    fileType: "PPTX",
    fileSize: 8630000,
    subjectId: "subject-ai",
    subject: "Artificial Intelligence",
    categoryId: "category-ml",
    category: "Machine Learning",
    tags: ["ml", "evaluation"],
    aiStatus: "PROCESSING",
    visibility: "PRIVATE",
    status: "ACTIVE",
    owner: {
      fullName: "Trần Thị B",
      email: "b.tran@fpt.edu.vn",
    },
    pages: 31,
    createdAt: "2026-06-07T15:45:00.000Z",
    updatedAt: "2026-06-07T15:45:00.000Z",
    indexStatus: "PROCESSING",
  },
  {
    id: "d-4",
    title: "Database Indexing Explained",
    description:
      "B-trees, composite indexes, query plans, and common performance pitfalls.",
    fileName: "database-indexing.pdf",
    fileType: "PDF",
    fileSize: 3270000,
    subjectId: "subject-cs",
    subject: "Computer Science",
    categoryId: "category-database",
    category: "Database",
    tags: ["database", "performance"],
    aiStatus: "COMPLETED",
    visibility: "PRIVATE",
    status: "HIDDEN",
    moderationReason: "Contains unauthorized solution manual solutions.",
    owner: {
      fullName: "Phạm Văn C",
      email: "c.pham@fpt.edu.vn",
    },
    pages: 35,
    createdAt: "2026-06-02T09:15:00.000Z",
    updatedAt: "2026-06-15T14:20:00.000Z",
    indexStatus: "READY",
  },
  {
    id: "d-5",
    title: "Cheating Sheet Final Exam Math 101",
    description: "Quick math formulas, exam hacks, and shortcuts for calculus.",
    fileName: "math101-cheat.xlsx",
    fileType: "XLSX",
    fileSize: 120000,
    subjectId: "subject-math",
    subject: "Mathematics",
    categoryId: "category-calculus",
    category: "Calculus",
    tags: ["math", "exam"],
    aiStatus: "FAILED",
    visibility: "PUBLIC",
    status: "DELETED",
    moderationReason: "Violates academic integrity policies (cheating sheet).",
    owner: {
      fullName: "Hoàng Thị D",
      email: "d.hoang@fpt.edu.vn",
    },
    pages: 3,
    createdAt: "2026-06-18T10:00:00.000Z",
    updatedAt: "2026-06-18T11:00:00.000Z",
    indexStatus: "FAILED",
  },
];

// Thực hiện chức năng delay.
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ----------------------------------------------------
// Mock Users API Handlers
// ----------------------------------------------------

export async function mockGetUsers(query: {
  page?: number;
  limit?: number;
  keyword?: string;
  role?: string;
  status?: string;
}) {
  await delay(400);
  const page = query.page ?? 1;
  const limit = query.limit ?? 10;
  const keyword = (query.keyword ?? "").toLowerCase();
  const role = query.role ?? "";
  const status = query.status ?? "";

  let filtered = [...mockUsers];

  if (keyword) {
    filtered = filtered.filter(
      (u) =>
        u.fullName.toLowerCase().includes(keyword) ||
        u.email.toLowerCase().includes(keyword),
    );
  }

  if (role) {
    filtered = filtered.filter((u) => u.role === role);
  }

  if (status) {
    filtered = filtered.filter((u) => u.status === status);
  }

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / limit);
  const startIndex = (page - 1) * limit;
  const items = filtered.slice(startIndex, startIndex + limit);

  return {
    items,
    meta: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    },
  };
}

// Thực hiện chức năng mock update người dùng trạng thái.
export async function mockUpdateUserStatus(
  id: string,
  status: "ACTIVE" | "BLOCKED",
) {
  await delay(300);
  const userIndex = mockUsers.findIndex((u) => u.id === id);
  if (userIndex === -1) {
    throw new Error("User not found");
  }
  mockUsers = mockUsers.map((u) => (u.id === id ? { ...u, status } : u));
  return mockUsers[userIndex];
}

// ----------------------------------------------------
// Mock Dashboard API Handlers
// ----------------------------------------------------

export async function mockGetDashboardSummary(): Promise<AdminDashboardSummary> {
  await delay(300);
  const activeDocs = mockDocuments.filter((d) => d.status !== "DELETED");
  return {
    totalUsers: mockUsers.length,
    totalDocuments: mockDocuments.filter((d) => d.status !== "DELETED").length,
    publicDocuments: activeDocs.filter((d) => d.visibility === "PUBLIC").length,
    privateDocuments: activeDocs.filter((d) => d.visibility === "PRIVATE")
      .length,
    totalChats: 248,
    totalDownloads: 135,
  };
}

// Thực hiện chức năng mock get dashboard statistics.
export async function mockGetDashboardStatistics(): Promise<{
  bySubject: SubjectStat[];
  byCategory: CategoryStat[];
}> {
  await delay(400);
  // Count by subject
  const subjectMap: Record<string, number> = {};
  // Count by category
  const categoryMap: Record<string, number> = {};

  mockDocuments
    .filter((d) => d.status !== "DELETED")
    .forEach((d) => {
      subjectMap[d.subject] = (subjectMap[d.subject] || 0) + 1;
      categoryMap[d.category] = (categoryMap[d.category] || 0) + 1;
    });

  const bySubject = Object.entries(subjectMap).map(
    ([subject, count], index) => ({
      id: `mock-subject-${index}`,
      subject,
      count,
    }),
  );

  const byCategory = Object.entries(categoryMap).map(
    ([category, count], index) => ({
      id: `mock-category-${index}`,
      category,
      count,
    }),
  );

  return { bySubject, byCategory };
}

// Thực hiện chức năng mock get tải lên statistics.
export async function mockGetUploadStatistics(): Promise<UploadStatItem[]> {
  await delay(300);
  return [
    { date: "2026-06-13", count: 1 },
    { date: "2026-06-14", count: 0 },
    { date: "2026-06-15", count: 2 },
    { date: "2026-06-16", count: 3 },
    { date: "2026-06-17", count: 1 },
    { date: "2026-06-18", count: 5 },
    { date: "2026-06-19", count: 2 },
  ];
}

// ----------------------------------------------------
// Mock Documents API Handlers
// ----------------------------------------------------

export async function mockGetAdminDocuments(query: {
  page?: number;
  limit?: number;
  keyword?: string;
  visibility?: string;
  status?: string;
  aiStatus?: string;
}) {
  await delay(450);
  const page = query.page ?? 1;
  const limit = query.limit ?? 10;
  const keyword = (query.keyword ?? "").toLowerCase();
  const visibility = query.visibility ?? "";
  const status = query.status ?? "";
  const aiStatus = query.aiStatus ?? "";

  let filtered = [...mockDocuments];

  if (keyword) {
    filtered = filtered.filter(
      (d) =>
        d.title.toLowerCase().includes(keyword) ||
        d.fileName.toLowerCase().includes(keyword) ||
        d.description.toLowerCase().includes(keyword),
    );
  }

  if (visibility) {
    filtered = filtered.filter((d) => d.visibility === visibility);
  }

  if (status) {
    filtered = filtered.filter((d) => d.status === status);
  }

  if (aiStatus) {
    filtered = filtered.filter((d) => d.aiStatus === aiStatus);
  }

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / limit);
  const startIndex = (page - 1) * limit;
  const items = filtered.slice(startIndex, startIndex + limit);

  return {
    items,
    meta: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    },
  };
}

// Thực hiện chức năng mock hide tài liệu.
export async function mockHideDocument(
  id: string,
  reason?: string,
): Promise<AdminDocument> {
  await delay(300);
  const docIndex = mockDocuments.findIndex((d) => d.id === id);
  if (docIndex === -1) {
    throw new Error("Document not found");
  }
  mockDocuments = mockDocuments.map((d) =>
    d.id === id
      ? {
          ...d,
          status: "HIDDEN" as const,
          moderationReason: reason || "Violation of terms.",
        }
      : d,
  );
  return mockDocuments[docIndex];
}

// Thực hiện chức năng mock unhide tài liệu.
export async function mockUnhideDocument(id: string): Promise<AdminDocument> {
  await delay(300);
  const docIndex = mockDocuments.findIndex((d) => d.id === id);
  if (docIndex === -1) {
    throw new Error("Document not found");
  }
  mockDocuments = mockDocuments.map((d) =>
    d.id === id
      ? { ...d, status: "ACTIVE" as const, moderationReason: undefined }
      : d,
  );
  return mockDocuments[docIndex];
}

// Thực hiện chức năng mock delete tài liệu.
export async function mockDeleteDocument(id: string): Promise<AdminDocument> {
  await delay(300);
  const docIndex = mockDocuments.findIndex((d) => d.id === id);
  if (docIndex === -1) {
    throw new Error("Document not found");
  }
  mockDocuments = mockDocuments.map((d) =>
    d.id === id ? { ...d, status: "DELETED" as const } : d,
  );
  return mockDocuments[docIndex];
}
