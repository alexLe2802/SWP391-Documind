export type DocumentVisibility = "PRIVATE" | "PUBLIC";
export type DocumentIndexStatus = "READY" | "PROCESSING" | "FAILED" | "PENDING";
export type ExtractionQuality = "READY" | "PARTIAL" | "UNREADABLE";

export type LibraryDocument = {
  id: string;
  title: string;
  description: string;
  subjectId: string;
  subject: string;
  categoryId: string;
  category: string;
  tags: string[];
  visibility: DocumentVisibility;
  fileName: string;
  fileType: string;
  fileSize: number;
  pages: number;
  uploadedAt: string;
  indexStatus: DocumentIndexStatus;
  extractionQuality?: ExtractionQuality;
  extractionWarnings?: string[];
  moderationStatus?: "PENDING" | "APPROVED" | "REJECTED";
  moderationFlag?: "NORMAL" | "FLAGGED" | "SCAN_FAILED";
  rejectionReason?: string;
  version?: number;
};

export type UploadDocumentInput = {
  title: string;
  description: string;
  subjectId: string;
  categoryId: string;
  tags: string[];
  visibility: DocumentVisibility;
  file: File;
};
