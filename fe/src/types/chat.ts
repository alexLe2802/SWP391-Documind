export type Citation = {
  citationId?: string;
  chunkId?: string;
  sourceNumber: number;
  documentId: string;
  title: string;
  snippet: string;
  quote?: string;
  relevanceScore: number | null;
  sourceLocator?: string[];
};

export type AiChatResponse = {
  answer: string;
  sessionId: string;
  messageId: string;
  suggestedPrompts: string[];
  sources: Citation[];
  answerStatus: "ANSWERED" | "FALLBACK_WITH_SOURCES" | "NO_SOURCES";
  errorCode?: string | null;
};

export type ChatMessage = {
  id: string;
  sender: "USER" | "AI";
  content: string;
  sources: Citation[];
  answerStatus?: AiChatResponse["answerStatus"];
  errorCode?: string | null;
  scope?: "MY_LIBRARY" | "SELECTED_SOURCES";
  status?: "pending" | "streaming" | "completed" | "interrupted" | "failed";
  interruptionReason?: string | null;
};

export type ChatSessionSummary = {
  id: string;
  mode: "ASK_THIS_DOCUMENT" | "ASK_MY_LIBRARY";
  documentId: string | null;
  title: string | null;
  document: { id: string; title: string } | null;
  messageCount: number;
  lastMessage: {
    id: string;
    sender: "USER" | "AI";
    content: string;
    createdAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

export type ChatSessionListResponse = {
  items: ChatSessionSummary[];
  meta: PaginationMeta;
};

export type ChatMessageRecord = {
  id: string;
  sessionId: string;
  sender: "USER" | "AI";
  content: string;
  sources: Citation[];
  createdAt: string;
};

export type ChatMessageListResponse = {
  items: ChatMessageRecord[];
  meta: PaginationMeta;
};

export type LibraryFilters = {
  subjectId?: string;
  subjectIds?: string[];
  categoryId?: string;
  fileType?: string;
  documentIds?: string[];
};
