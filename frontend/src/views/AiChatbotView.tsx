"use client";

import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bot,
  FileSearch,
  FileText,
  Library,
  Search,
  Sparkles,
  Plus,
  X,
  ArrowUp,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Database,
  ChevronRight,
  Info,
  AlertTriangle,
  FileCode,
  FileSpreadsheet,
  FileArchive,
  ArrowDownToLine,
  Check,
  ChevronDown,
  History,
  MessageSquarePlus,
} from "lucide-react";
import {
  askLibraryStream,
  fetchChatMessages,
  fetchChatSessions,
} from "../api/chat.api";
import { createDownloadUrl, fetchLibraryDocuments } from "../api/documents.api";
import { useLanguage } from "../i18n/LanguageProvider";
import { localize } from "../i18n/localize";
import type { ChatMessage, ChatSessionSummary, Citation } from "../types/chat";
import { ROUTES } from "../lib/routes";
import type { LibraryDocument } from "../types/document";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ActiveMode = "SELECTED_SOURCES" | "MY_LIBRARY";

// Hiển thị giao diện copy button.
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  // Xử lý sự kiện copy.
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      type="button"
      className="text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1 border border-slate-700 rounded px-2 py-0.5 text-xs bg-slate-800"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// Chuyển đổi hoặc chuẩn hóa tokenize text.
function tokenizeText(
  text: string,
): { type: "text" | "citation"; content?: string; numbers?: number[] }[] {
  const regex =
    /(\[\[cite:\s*\d+(?:\s*,\s*\d+)*\]\]|\[(?:Source\s+)?\d+(?:\s*,\s*\d+)*\](?!\())/gi;
  const parts = text.split(regex);
  const tokens: {
    type: "text" | "citation";
    content?: string;
    numbers?: number[];
  }[] = [];

  for (const part of parts) {
    if (!part) continue;

    const canonicalMatch = part.match(
      /^\[\[cite:\s*(\d+(?:\s*,\s*\d+)*)\]\]$/i,
    );
    if (canonicalMatch) {
      const numbers = canonicalMatch[1]
        .split(",")
        .map((num) => parseInt(num.trim(), 10))
        .filter((n) => !isNaN(n));
      tokens.push({ type: "citation", numbers });
      continue;
    }

    const legacyMatch = part.match(/^\[(?:Source\s+)?(\d+(?:\s*,\s*\d+)*)\]$/i);
    if (legacyMatch) {
      const numbers = legacyMatch[1]
        .split(",")
        .map((num) => parseInt(num.trim(), 10))
        .filter((n) => !isNaN(n));
      tokens.push({ type: "citation", numbers });
      continue;
    }

    tokens.push({ type: "text", content: part });
  }

  return tokens;
}

// Chuyển đổi hoặc chuẩn hóa text for citations.
function parseTextForCitations(
  text: string,
  citations: Citation[] = [],
  onCitationClick?: (citation: Citation) => void,
): React.ReactNode {
  const tokens = tokenizeText(text);
  return tokens.flatMap((token, idx) => {
    if (token.type === "citation" && token.numbers) {
      return (
        <span key={`cite-group-${idx}`} className="ws-inline-citation-group">
          {token.numbers.map((sourceNumber, numIdx) => {
            const citation = citations.find(
              (c) => c.sourceNumber === sourceNumber,
            );
            if (citation && onCitationClick) {
              return (
                <button
                  key={`cite-${idx}-${numIdx}`}
                  type="button"
                  className="ws-inline-citation"
                  onClick={() => onCitationClick(citation)}
                  title={citation.title}
                >
                  [{sourceNumber}]
                </button>
              );
            }
            return (
              <span key={`cite-text-${idx}-${numIdx}`}>[{sourceNumber}]</span>
            );
          })}
        </span>
      );
    }
    return token.content || "";
  });
}

// Hiển thị hoặc mở tin nhắn nội dung.
function renderMessageContent(
  content: string,
  citations: Citation[] = [],
  onCitationClick?: (citation: Citation) => void,
) {
  // Hiển thị hoặc mở children.
  const renderChildren = (children: React.ReactNode): React.ReactNode => {
    return React.Children.map(children, (child) => {
      if (typeof child === "string") {
        return parseTextForCitations(child, citations, onCitationClick);
      }
      return child;
    });
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="ws-chat-p">{renderChildren(children)}</p>
        ),
        li: ({ children }) => <li>{renderChildren(children)}</li>,
        h1: ({ children }) => (
          <h1 className="text-2xl font-bold my-3">
            {renderChildren(children)}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-xl font-bold my-2">{renderChildren(children)}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-lg font-bold my-2">{renderChildren(children)}</h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-base font-bold my-1">
            {renderChildren(children)}
          </h4>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto max-w-full my-4 rounded-lg border border-slate-200">
            <table className="min-w-max w-full text-sm border-collapse">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-slate-50 border-b border-slate-200">
            {children}
          </thead>
        ),
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => (
          <tr className="border-b border-slate-100 last:border-0">
            {children}
          </tr>
        ),
        th: ({ children }) => (
          <th className="px-4 py-2 text-left font-semibold text-slate-700">
            {renderChildren(children)}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-4 py-2 text-slate-600 break-words">
            {renderChildren(children)}
          </td>
        ),
        code: ({
          className,
          children,
          inline,
          node,
          ...props
        }: React.ComponentPropsWithoutRef<"code"> & {
          inline?: boolean;
          node?: unknown;
        }) => {
          // Avoid unused variable warnings
          void inline;
          void node;
          const match = /language-(\w+)/.exec(className || "");
          const isInline = !match;
          if (isInline) {
            return (
              <code
                className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-sm font-mono"
                {...props}
              >
                {children}
              </code>
            );
          }
          const codeString = String(children).replace(/\n$/, "");
          return (
            <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-950 my-4 text-left">
              <div className="flex items-center justify-between px-4 py-2 bg-slate-900 text-slate-400 text-xs border-b border-slate-800 select-none">
                <span className="font-mono">{match ? match[1] : "code"}</span>
                <CopyButton value={codeString} />
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-slate-100 text-sm whitespace-pre">
                <code>{children}</code>
              </pre>
            </div>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// Hiển thị giao diện ai chatbot view.
export function AiChatbotView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLanguage();
  const text = useCallback(
    (vi: string, en: string) => localize(locale, vi, en),
    [locale],
  );

  // 1. Fetch Library Documents (Uploaded & Saved from Community)
  const [documents, setDocuments] = useState<
    (LibraryDocument & { isCommunitySaved?: boolean })[]
  >([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchLibraryDocuments({ limit: 100 }),
      fetchLibraryDocuments({ savedOnly: true, limit: 100 }).catch(() => ({
        items: [],
      })),
    ])
      .then(([uploadedResult, savedResult]) => {
        if (!active) return;

        const mergedMap = new Map<
          string,
          LibraryDocument & { isCommunitySaved?: boolean }
        >();
        uploadedResult.items.forEach((doc) => mergedMap.set(doc.id, doc));
        savedResult.items.forEach((doc) => {
          mergedMap.set(doc.id, {
            ...doc,
            isCommunitySaved: true,
          });
        });

        setDocuments(Array.from(mergedMap.values()));
      })
      .catch(() => {
        if (active) setDocuments([]);
      });

    return () => {
      active = false;
    };
  }, []);

  // 2. React State
  const [activeMode, setActiveMode] = useState<ActiveMode>("MY_LIBRARY");
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [currentDocumentId, setCurrentDocumentId] = useState<string>("");

  const [searchQuery, setSearchQuery] = useState("");
  const [fileTypeFilter, setFileTypeFilter] = useState<
    "ALL" | "PDF" | "DOCX" | "PPTX" | "XLSX"
  >("ALL");
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [subjectDropdownOpen, setSubjectDropdownOpen] = useState(false);

  const [question, setQuestion] = useState("");
  const [sessionId, setSessionId] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sources, setSources] = useState<Citation[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySessions, setHistorySessions] = useState<ChatSessionSummary[]>(
    [],
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  useEffect(() => {
    const requestedSessionId = searchParams?.get("session");
    if (!requestedSessionId) return;

    let active = true;
    fetchChatMessages(requestedSessionId)
      .then((result) => {
        if (!active) return;
        setSessionId(requestedSessionId);
        setMessages(result.items);
        const latestSourcedMessage = [...result.items]
          .reverse()
          .find(
            (message) => message.sender === "AI" && message.sources.length > 0,
          );
        setSources(latestSourcedMessage?.sources ?? []);
      })
      .catch(() => {
        if (active) setSessionId(undefined);
      });
    return () => {
      active = false;
    };
  }, [searchParams]);
  const visibleSources = useMemo(
    () =>
      sources.filter(
        (source) =>
          source.relevanceScore === null || source.relevanceScore >= 0.62,
      ),
    [sources],
  );

  // UI Panel states
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);
  // References duplicate selected-source information until an answer exists.
  // Start collapsed so the conversation remains the visual focus; users can
  // still open the panel from the existing header toggle.
  const [referencesCollapsed, setReferencesCollapsed] = useState(true);
  const [sourcesDrawerOpen, setSourcesDrawerOpen] = useState(false);
  const [referencesDrawerOpen, setReferencesDrawerOpen] = useState(false);

  // Citation Preview Drawer state
  const [previewCitation, setPreviewCitation] = useState<
    Citation | undefined
  >();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const subjectDropdownRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const lastScopeKeyRef = useRef<Record<ActiveMode, string | undefined>>({
    MY_LIBRARY: undefined,
    SELECTED_SOURCES: undefined,
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [question]);

  const subjects = useMemo(() => {
    const uniqueSubjects = new Map<string, { id: string; name: string }>();
    documents.forEach((document) => {
      uniqueSubjects.set(document.subjectId, {
        id: document.subjectId,
        name: document.subject,
      });
    });
    return [...uniqueSubjects.values()].sort((a, b) =>
      a.name.localeCompare(b.name, locale === "vi" ? "vi" : "en"),
    );
  }, [documents, locale]);

  const selectedSubjectNames = useMemo(
    () =>
      subjects
        .filter((subject) => selectedSubjectIds.includes(subject.id))
        .map((subject) => subject.name),
    [selectedSubjectIds, subjects],
  );

  const subjectFilterLabel =
    selectedSubjectIds.length === 0
      ? text("Tất cả môn học", "All subjects")
      : selectedSubjectIds.length === 1
        ? selectedSubjectNames[0]
        : text(
            `${selectedSubjectIds.length} môn học`,
            `${selectedSubjectIds.length} subjects`,
          );

  useEffect(() => {
    // Xóa hoặc giải phóng môn học dropdown.
    function closeSubjectDropdown(event: MouseEvent) {
      if (
        subjectDropdownRef.current &&
        !subjectDropdownRef.current.contains(event.target as Node)
      ) {
        setSubjectDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", closeSubjectDropdown);
    return () =>
      document.removeEventListener("mousedown", closeSubjectDropdown);
  }, []);

  useEffect(() => {
    // Xóa hoặc giải phóng lịch sử dropdown.
    function closeHistoryDropdown(event: MouseEvent) {
      if (
        historyRef.current &&
        !historyRef.current.contains(event.target as Node)
      ) {
        setHistoryOpen(false);
      }
    }

    document.addEventListener("mousedown", closeHistoryDropdown);
    return () =>
      document.removeEventListener("mousedown", closeHistoryDropdown);
  }, []);

  // 4. Load sessionStorage on mount (hydration-safe)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedDocument = params.get("document");
    const requestedScope = params.get("scope");
    const requestedQuestion = params.get("q");

    if (requestedScope === "document") {
      setActiveMode("SELECTED_SOURCES");

      if (requestedDocument) {
        setSelectedDocumentIds([requestedDocument]);
        setCurrentDocumentId(requestedDocument);
        setSelectedSubjectIds([]);
      }
    }

    const savedMode = sessionStorage.getItem("documind.workspace.activeMode");
    if (
      requestedScope !== "document" &&
      savedMode &&
      ["SELECTED_SOURCES", "MY_LIBRARY"].includes(savedMode)
    ) {
      setActiveMode(savedMode as ActiveMode);
    }

    const savedSelected = sessionStorage.getItem(
      "documind.workspace.selectedDocumentIds",
    );
    if (!requestedDocument && savedSelected) {
      try {
        setSelectedDocumentIds(JSON.parse(savedSelected));
      } catch {
        /* ignore */
      }
    }

    const savedSubjects = sessionStorage.getItem(
      "documind.workspace.selectedSubjectIds",
    );
    if (!requestedDocument && savedSubjects) {
      try {
        setSelectedSubjectIds(JSON.parse(savedSubjects));
      } catch {
        /* ignore */
      }
    }

    const savedCurrent = sessionStorage.getItem(
      "documind.workspace.currentDocumentId",
    );
    if (requestedDocument) {
      setCurrentDocumentId(requestedDocument);
    } else if (savedCurrent) {
      setCurrentDocumentId(savedCurrent);
    } else {
      setCurrentDocumentId(documents[0]?.id || "");
    }

    if (requestedQuestion) setQuestion(requestedQuestion);
  }, [documents]);

  // 5. Persist state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem("documind.workspace.activeMode", activeMode);
  }, [activeMode]);
  useEffect(() => {
    sessionStorage.setItem(
      "documind.workspace.selectedDocumentIds",
      JSON.stringify(selectedDocumentIds),
    );
  }, [selectedDocumentIds]);
  useEffect(() => {
    sessionStorage.setItem(
      "documind.workspace.selectedSubjectIds",
      JSON.stringify(selectedSubjectIds),
    );
  }, [selectedSubjectIds]);
  useEffect(() => {
    if (currentDocumentId)
      sessionStorage.setItem(
        "documind.workspace.currentDocumentId",
        currentDocumentId,
      );
  }, [currentDocumentId]);

  // Auto-scroll
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Filtered document list
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        doc.title.toLowerCase().includes(q) ||
        (doc.subject || "").toLowerCase().includes(q) ||
        (doc.category || "").toLowerCase().includes(q);
      const matchesType =
        fileTypeFilter === "ALL" || doc.fileType === fileTypeFilter;
      const matchesSubject =
        selectedSubjectIds.length === 0 ||
        selectedSubjectIds.includes(doc.subjectId);
      return matchesSearch && matchesType && matchesSubject;
    });
  }, [documents, searchQuery, fileTypeFilter, selectedSubjectIds]);

  useEffect(() => {
    if (filteredDocuments.length === 0) {
      if (currentDocumentId) setCurrentDocumentId("");
      return;
    }
    if (
      !currentDocumentId ||
      !filteredDocuments.some((document) => document.id === currentDocumentId)
    ) {
      setCurrentDocumentId(filteredDocuments[0].id);
    }
  }, [currentDocumentId, filteredDocuments]);

  // Cập nhật môn học.
  const toggleSubject = (subjectId: string) => {
    setSelectedSubjectIds((current) =>
      current.includes(subjectId)
        ? current.filter((id) => id !== subjectId)
        : [...current, subjectId],
    );
  };

  // Xử lý sự kiện checkbox toggle.
  const handleCheckboxToggle = (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDocumentIds((prev) =>
      prev.includes(docId)
        ? prev.filter((id) => id !== docId)
        : [...prev, docId],
    );
  };

  // Xóa hoặc giải phóng selection.
  const clearSelection = () => setSelectedDocumentIds([]);

  // Xử lý sự kiện tài liệu row click.
  const handleDocumentRowClick = (docId: string) => {
    setCurrentDocumentId(docId);
    const doc = documents.find((d) => d.id === docId);
    if (doc) {
      openCitationDrawer({
        sourceNumber: 0,
        documentId: doc.id,
        title: doc.title,
        snippet:
          doc.description ||
          text(
            "Tài liệu chưa có mô tả chi tiết.",
            "No detailed description for this document.",
          ),
        relevanceScore: null,
      });
    }
  };

  // Hiển thị hoặc mở citation drawer.
  const openCitationDrawer = (citation: Citation) => {
    setPreviewCitation(citation);
    setDrawerOpen(true);
  };

  // Xử lý sự kiện prompt card click.
  const handlePromptCardClick = (key: string) => {
    const map: Record<string, [string, string]> = {
      summarize: [
        "Tóm tắt các điểm chính và thông tin quan trọng nhất trong tài liệu này.",
        "Summarize the main points and most important details in this document.",
      ],
      quiz: [
        "Tạo một bộ câu hỏi trắc nghiệm gồm 5 câu để kiểm tra kiến thức về tài liệu này.",
        "Create a 5-question multiple choice quiz to test my knowledge of this document.",
      ],
      compare: [
        "So sánh và đối chiếu các thông tin khác nhau giữa các tài liệu trong thư viện.",
        "Compare and contrast the different details across the library documents.",
      ],
      concepts: [
        "Giải thích các khái niệm cốt lõi và các thuật ngữ chuyên ngành được sử dụng ở đây.",
        "Explain the core concepts and technical terms used here.",
      ],
    };
    const [vi, en] = map[key] || ["", ""];
    setQuestion(text(vi, en));
    textareaRef.current?.focus();
  };

  // History helpers
  const openHistory = async () => {
    const nextOpen = !historyOpen;
    setHistoryOpen(nextOpen);
    if (!nextOpen) return;
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const response = await fetchChatSessions({
        mode: "ASK_MY_LIBRARY",
        limit: 20,
      });
      setHistorySessions(
        response.items.filter((session) => session.messageCount > 0),
      );
    } catch {
      setHistoryError(true);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Lấy dữ liệu phiên.
  const loadSession = async (session: ChatSessionSummary) => {
    setHistoryOpen(false);
    setIsLoading(true);
    try {
      const response = await fetchChatMessages(session.id);
      const loadedMessages: ChatMessage[] = response.items.map((message) => ({
        id: message.id,
        sender: message.sender,
        content: message.content,
        sources: message.sources ?? [],
        scope: activeMode,
      }));
      setSessionId(session.id);
      setMessages(loadedMessages);
      const lastSources =
        [...response.items].reverse().find((message) => message.sources?.length)
          ?.sources ?? [];
      setSources(lastSources);
      // Continuing an old session keeps its own scope semantics; forget the
      // local fingerprint so the next question does not force a reset.
      lastScopeKeyRef.current[activeMode] = undefined;
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: "AI",
          content: text(
            "Không tải được cuộc trò chuyện này. Vui lòng thử lại.",
            "Could not load this conversation. Please try again.",
          ),
          sources: [],
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Thực hiện chức năng start new chat.
  const startNewChat = () => {
    setHistoryOpen(false);
    setSessionId(undefined);
    setSources([]);
    setMessages([]);
    lastScopeKeyRef.current[activeMode] = undefined;
  };

  // 7. Submit question
  const submitQuestion = async () => {
    const trimmed = question.trim();
    if (!trimmed || isLoading) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        sender: "USER",
        content: trimmed,
        sources: [],
        scope: activeMode,
      },
    ]);
    setQuestion("");
    setIsLoading(true);

    if (activeMode === "SELECTED_SOURCES" && selectedDocumentIds.length === 0) {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sender: "AI",
            content: text(
              "Vui lòng chọn ít nhất một tài liệu nguồn ở danh sách bên trái để đặt câu hỏi.",
              "Please select at least one source document from the left list to ask questions.",
            ),
            sources: [],
            scope: activeMode,
          },
        ]);
        setIsLoading(false);
      }, 500);
      return;
    }

    // Reset the session whenever the retrieval scope changed since the last
    // question, so a new scope never inherits the previous conversation.
    const scopeKey =
      activeMode === "SELECTED_SOURCES"
        ? [...selectedDocumentIds].sort().join(",")
        : `${[...selectedSubjectIds].sort().join(",")}|${fileTypeFilter}`;
    const lastScopeKey = lastScopeKeyRef.current[activeMode];
    const requestSessionId =
      lastScopeKey !== undefined && lastScopeKey !== scopeKey
        ? undefined
        : sessionId;
    if (requestSessionId === undefined && sessionId !== undefined) {
      setSessionId(undefined);
    }
    lastScopeKeyRef.current[activeMode] = scopeKey;

    let hasEmittedToken = false;
    const pendingMessageId = crypto.randomUUID();

    try {
      setMessages((prev) => [
        ...prev.filter((message) => message.content),
        {
          id: pendingMessageId,
          sender: "AI",
          content: "",
          sources: [],
          scope: activeMode,
          status: "pending",
        },
      ]);
      const response = await askLibraryStream(
        {
          question: trimmed,
          sessionId: requestSessionId,
          filters:
            activeMode === "SELECTED_SOURCES"
              ? { documentIds: selectedDocumentIds }
              : {
                  subjectIds:
                    selectedSubjectIds.length > 0
                      ? selectedSubjectIds
                      : undefined,
                  fileType:
                    fileTypeFilter === "ALL" ? undefined : fileTypeFilter,
                },
        },
        {
          onSources: (nextSources) => {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === pendingMessageId
                  ? { ...message, sources: nextSources }
                  : message,
              ),
            );
          },
          onDelta: (delta) => {
            hasEmittedToken = true;
            setMessages((prev) =>
              prev.map((message) =>
                message.id === pendingMessageId
                  ? {
                      ...message,
                      content: message.content + delta,
                      status: "streaming",
                    }
                  : message,
              ),
            );
          },
        },
        controller.signal,
      );

      setSessionId(response.sessionId);
      setSources(response.sources);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === pendingMessageId
            ? {
                ...message,
                content: response.answer,
                sources: response.sources,
                answerStatus: response.answerStatus,
                errorCode: response.errorCode,
                status: "completed",
              }
            : message,
        ),
      );
    } catch (err: unknown) {
      const isAborted =
        (err instanceof Error && err.name === "AbortError") ||
        controller.signal.aborted;

      if (hasEmittedToken) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === pendingMessageId
              ? {
                  ...message,
                  status: "interrupted",
                  interruptionReason: isAborted
                    ? "client_abort"
                    : "stream_error",
                }
              : message,
          ),
        );
      } else {
        setMessages((prev) => [
          ...prev.filter((message) => message.id !== pendingMessageId),
          {
            id: crypto.randomUUID(),
            sender: "AI",
            content: isAborted
              ? text("Yêu cầu đã bị hủy.", "The request was cancelled.")
              : text(
                  "Không thể nhận phản hồi AI lúc này. Vui lòng thử lại.",
                  "The AI response is unavailable right now. Please retry.",
                ),
            sources: [],
            errorCode: "REQUEST_FAILED",
            scope: activeMode,
            status: "failed",
          },
        ]);
      }
    } finally {
      setIsLoading(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  // Hiển thị hoặc mở relevance badge.
  const renderRelevanceBadge = (score: number | null) => {
    if (score === null) {
      return (
        <span className="ws-relevance-badge ws-relevance-badge--ground">
          {text("Tài liệu gốc", "Ground Source")}
        </span>
      );
    }
    if (score >= 0.85) {
      return (
        <span className="ws-relevance-badge ws-relevance-badge--high">
          {text("Độ liên quan cao", "High relevance")}
        </span>
      );
    }
    if (score >= 0.7) {
      return (
        <span className="ws-relevance-badge ws-relevance-badge--medium">
          {text("Có liên quan", "Relevant")}
        </span>
      );
    }
    return (
      <span className="ws-relevance-badge ws-relevance-badge--low">
        {text("Nguồn bổ sung", "Supporting source")}
      </span>
    );
  };

  // Lấy dữ liệu tệp icon.
  const getFileIcon = (fileType?: string) => {
    switch (fileType?.toUpperCase()) {
      case "PDF":
        return (
          <FileText size={16} className="ws-file-icon ws-file-icon--pdf" />
        );
      case "DOCX":
        return (
          <FileCode size={16} className="ws-file-icon ws-file-icon--docx" />
        );
      case "PPTX":
        return (
          <FileArchive size={16} className="ws-file-icon ws-file-icon--pptx" />
        );
      case "XLSX":
        return (
          <FileSpreadsheet
            size={16}
            className="ws-file-icon ws-file-icon--xlsx"
          />
        );
      default:
        return <FileText size={16} className="ws-file-icon" />;
    }
  };

  // Lấy dữ liệu placeholder text.
  const getPlaceholderText = () => {
    if (activeMode === "SELECTED_SOURCES") {
      if (selectedDocumentIds.length === 1) {
        const doc = documents.find((d) => d.id === selectedDocumentIds[0]);
        return text(
          `Đặt câu hỏi về "${doc?.title || "tài liệu đã chọn"}"...`,
          `Ask about "${doc?.title || "selected document"}"...`,
        );
      }
      return text(
        "Nhập câu hỏi dựa trên các nguồn đã chọn...",
        "Ask about selected sources...",
      );
    }
    return text(
      "Đặt câu hỏi trên toàn bộ thư viện...",
      "Ask across your entire library...",
    );
  };

  // Lấy dữ liệu answer issue copy.
  const getAnswerIssueCopy = (msg: ChatMessage) => {
    if (msg.errorCode === "REQUEST_FAILED") {
      return {
        title: text(
          "Không nhận được phản hồi AI",
          "AI response was not received",
        ),
        description: text(
          "Hệ thống không thay thế lỗi bằng câu trả lời mẫu. Hãy thử lại sau ít phút.",
          "The system did not replace the failure with a demo answer. Please retry shortly.",
        ),
      };
    }
    if (msg.answerStatus === "FALLBACK_WITH_SOURCES") {
      const title = text(
        "AI chưa tạo được phần diễn giải",
        "AI could not generate the narrative answer",
      );
      const descriptionByCode: Record<string, string> = {
        GEMINI_MISSING_API_KEY: text(
          "Thiếu cấu hình khóa Gemini. Hệ thống vẫn đã tìm nguồn liên quan để bạn đọc ngay.",
          "Gemini API key is not configured. Relevant sources are still available.",
        ),
        GEMINI_RATE_LIMIT: text(
          "Gemini đang bị giới hạn quota hoặc tần suất. Bạn có thể xem nguồn hoặc thử lại sau.",
          "Gemini is rate limited or out of quota. Review the sources or retry later.",
        ),
        GEMINI_TIMEOUT: text(
          "Gemini phản hồi quá lâu. Nguồn liên quan vẫn được giữ lại ở phần tham chiếu.",
          "Gemini took too long to respond. Relevant sources are still shown.",
        ),
        GEMINI_NETWORK_ERROR: text(
          "Kết nối đến Gemini gặp lỗi mạng. Hãy kiểm tra backend hoặc thử lại sau.",
          "The Gemini connection failed. Check the backend network or retry later.",
        ),
        GEMINI_API_ERROR: text(
          "Gemini trả về lỗi dịch vụ. Các trích dẫn đã tìm được vẫn có thể mở để kiểm tra.",
          "Gemini returned a service error. Retrieved citations are still available.",
        ),
        GEMINI_INVALID_RESPONSE: text(
          "Gemini trả về phản hồi rỗng. Hãy thử hỏi lại cụ thể hơn hoặc thử lại sau.",
          "Gemini returned an empty response. Try a more specific question or retry later.",
        ),
      };
      return {
        title,
        description:
          descriptionByCode[msg.errorCode || ""] ||
          text(
            "Dịch vụ tạo sinh đang lỗi. Hệ thống vẫn đã tìm được tài liệu tham chiếu phù hợp.",
            "The generation service failed. Relevant references were still retrieved.",
          ),
      };
    }

    if (msg.answerStatus === "NO_SOURCES") {
      return {
        title: text("Chưa tìm thấy nguồn phù hợp", "No matching source found"),
        description: text(
          "Thử đổi từ khóa, bỏ bớt bộ lọc hoặc chọn trực tiếp một vài tài liệu nguồn.",
          "Try different keywords, remove filters, or select source documents directly.",
        ),
      };
    }

    return null;
  };

  return (
    <main
      id="main-content"
      className={`ai-workspace${sourcesCollapsed ? " left-collapsed" : ""}${referencesCollapsed ? " right-collapsed" : ""}`}
    >
      {/* ─── LEFT SIDEBAR ─────────────────────────────────────────── */}
      <aside
        className={`ws-sources-panel${sourcesCollapsed ? " ws-panel--collapsed" : ""}${sourcesDrawerOpen ? " ws-panel--open" : ""}`}
      >
        <div className="ws-sources-header">
          <div className="ws-sources-title-row">
            <h2>{text("Tài liệu Nguồn", "Sources")}</h2>
            <button
              onClick={() => router.push(ROUTES.upload)}
              className="ws-add-source-btn"
            >
              <Plus size={14} />
              <span>{text("Thêm", "Add")}</span>
            </button>
          </div>
          <div className="ws-search-wrapper">
            <Search size={14} className="ws-search-icon" />
            <input
              type="text"
              className="ws-search-input"
              placeholder={text("Tìm kiếm tài liệu...", "Search sources...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="ws-subject-filter" ref={subjectDropdownRef}>
            <button
              type="button"
              className={`ws-subject-filter-trigger${selectedSubjectIds.length ? " active" : ""}`}
              onClick={() => setSubjectDropdownOpen((open) => !open)}
              aria-expanded={subjectDropdownOpen}
            >
              <span>
                <small>{text("Lọc theo môn học", "Filter by subject")}</small>
                <strong title={selectedSubjectNames.join(", ")}>
                  {subjectFilterLabel}
                </strong>
              </span>
              <ChevronDown size={16} />
            </button>

            {subjectDropdownOpen ? (
              <div className="ws-subject-dropdown">
                <div className="ws-subject-dropdown-heading">
                  <strong>{text("Chọn môn học", "Choose subjects")}</strong>
                  <span>
                    {selectedSubjectIds.length || text("Tất cả", "All")}
                  </span>
                </div>
                <button
                  type="button"
                  className={`ws-subject-option${selectedSubjectIds.length === 0 ? " selected" : ""}`}
                  onClick={() => setSelectedSubjectIds([])}
                >
                  <span className="ws-subject-check">
                    {selectedSubjectIds.length === 0 ? (
                      <Check size={13} />
                    ) : null}
                  </span>
                  <span>
                    <strong>{text("Tất cả môn học", "All subjects")}</strong>
                    <small>
                      {text(
                        `${documents.length} tài liệu trong thư viện`,
                        `${documents.length} library documents`,
                      )}
                    </small>
                  </span>
                </button>
                <div className="ws-subject-options">
                  {subjects.map((subject) => {
                    const checked = selectedSubjectIds.includes(subject.id);
                    const count = documents.filter(
                      (document) => document.subjectId === subject.id,
                    ).length;
                    return (
                      <button
                        type="button"
                        key={subject.id}
                        className={`ws-subject-option${checked ? " selected" : ""}`}
                        onClick={() => toggleSubject(subject.id)}
                      >
                        <span className="ws-subject-check">
                          {checked ? <Check size={13} /> : null}
                        </span>
                        <span>
                          <strong>{subject.name}</strong>
                          <small>
                            {count} {text("tài liệu", "documents")}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <footer>
                  <span>
                    {text(
                      "Có thể chọn nhiều môn",
                      "Multiple selection supported",
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSubjectDropdownOpen(false)}
                  >
                    {text("Xong", "Done")}
                  </button>
                </footer>
              </div>
            ) : null}
          </div>
        </div>

        {/* File Type Filters */}
        <div className="ws-filter-chips">
          {(["ALL", "PDF", "DOCX", "PPTX", "XLSX"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFileTypeFilter(type)}
              className={`ws-filter-chip${fileTypeFilter === type ? " active" : ""}`}
            >
              {type === "ALL" ? text("Tất cả", "All") : type}
            </button>
          ))}
        </div>

        {/* Sources List */}
        <div className="ws-sources-list">
          {filteredDocuments.map((doc) => {
            const isSelected = selectedDocumentIds.includes(doc.id);
            // Only highlight the active card in SELECTED_SOURCES mode (when user explicitly views a doc)
            const isCurrent =
              activeMode === "SELECTED_SOURCES" &&
              doc.id === (currentDocumentId || documents[0]?.id);
            return (
              <div
                key={doc.id}
                className={`ws-source-card${isCurrent ? " active" : ""}`}
                onClick={() => handleDocumentRowClick(doc.id)}
              >
                <input
                  type="checkbox"
                  className="ws-source-checkbox"
                  checked={isSelected}
                  onChange={() => {}}
                  onClick={(e) => handleCheckboxToggle(doc.id, e)}
                />
                <div className="ws-source-icon">
                  {getFileIcon(doc.fileType)}
                </div>
                <div className="ws-source-details">
                  <span className="ws-source-title" title={doc.title}>
                    {doc.title}
                  </span>
                  <div className="ws-source-meta">
                    <span>{doc.fileType}</span>
                    {doc.category && (
                      <>
                        <span className="ws-source-meta-dot">·</span>
                        <span>{doc.category}</span>
                      </>
                    )}
                    {doc.isCommunitySaved && (
                      <>
                        <span className="ws-source-meta-dot">·</span>
                        <span
                          className="ws-community-badge"
                          title={text(
                            "Đã lưu từ cộng đồng",
                            "Saved from community",
                          )}
                        >
                          {text("Cộng đồng", "Community")}
                        </span>
                      </>
                    )}
                    <span className="ws-source-meta-dot">·</span>
                    <span
                      className={`ws-source-status${doc.indexStatus === "READY" ? " ready" : " processing"}`}
                    >
                      {doc.indexStatus === "READY"
                        ? text("Sẵn sàng", "Ready")
                        : text("Đang xử lý", "Processing")}
                    </span>
                  </div>
                  {/* Quick-action button: only shown in SELECTED_SOURCES mode for the currently focused card */}
                  {isCurrent && doc.indexStatus === "READY" && (
                    <button
                      type="button"
                      className="ws-ask-file-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDocumentIds([doc.id]);
                      }}
                    >
                      <Sparkles size={11} />
                      <span>{text("Hỏi tài liệu này", "Ask this file")}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {filteredDocuments.length === 0 && (
            <div className="ws-sources-empty">
              {text("Không tìm thấy tài liệu", "No documents found")}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="ws-sources-footer">
          <span className="ws-selected-count">
            {selectedDocumentIds.length} {text("đã chọn", "selected")}
          </span>
          {selectedDocumentIds.length > 0 && (
            <button onClick={clearSelection} className="ws-clear-btn">
              {text("Bỏ chọn", "Clear")}
            </button>
          )}
        </div>
      </aside>

      {/* ─── CENTER CHAT ───────────────────────────────────────────── */}
      <section className="ws-chat-panel">
        <header className="ws-chat-header">
          {/* Left Toggles (Mobile & Desktop) */}
          <div className="ws-header-left-toggles">
            <button
              className="ws-toggle-btn ws-toggle-mobile"
              onClick={() => setSourcesDrawerOpen(!sourcesDrawerOpen)}
              title={text("Danh sách tài liệu", "Sources list")}
            >
              <Library size={18} />
            </button>
            <button
              onClick={() => setSourcesCollapsed(!sourcesCollapsed)}
              className={`ws-toggle-btn ws-toggle-desktop${!sourcesCollapsed ? " active" : ""}`}
              title={text("Ẩn/Hiện Sidebar Trái", "Toggle Left Sidebar")}
            >
              {sourcesCollapsed ? (
                <PanelLeftOpen size={18} />
              ) : (
                <PanelLeftClose size={18} />
              )}
            </button>
          </div>

          {/* Mode Selector */}
          <div className="ws-mode-selector">
            <button
              type="button"
              className={`ws-mode-btn${activeMode === "MY_LIBRARY" ? " active" : ""}`}
              onClick={() => setActiveMode("MY_LIBRARY")}
            >
              <strong>{text("Toàn bộ thư viện", "Entire Library")}</strong>
              <small>
                {text(
                  "AI tự động tìm tài liệu liên quan",
                  "AI finds relevant files automatically",
                )}
              </small>
            </button>
            <button
              type="button"
              className={`ws-mode-btn${activeMode === "SELECTED_SOURCES" ? " active" : ""}`}
              onClick={() => setActiveMode("SELECTED_SOURCES")}
            >
              <strong>
                {text(
                  `File đã chọn (${selectedDocumentIds.length})`,
                  `Selected Files (${selectedDocumentIds.length})`,
                )}
              </strong>
              <small>
                {text(
                  "AI chỉ tìm kiếm trong file được chọn",
                  "AI searches selected files only",
                )}
              </small>
            </button>
          </div>

          {/* Right Toggles (Mobile & Desktop) */}
          <div className="ws-header-right-toggles">
            <button
              className="ws-toggle-btn"
              onClick={startNewChat}
              title={text("Cuộc trò chuyện mới", "New chat")}
              aria-label={text("Cuộc trò chuyện mới", "New chat")}
            >
              <MessageSquarePlus size={18} />
            </button>
            <div className="ws-history" ref={historyRef}>
              <button
                className={`ws-toggle-btn${historyOpen ? " active" : ""}`}
                onClick={openHistory}
                title={text("Lịch sử trò chuyện", "Chat history")}
                aria-label={text("Lịch sử trò chuyện", "Chat history")}
                aria-expanded={historyOpen}
              >
                <History size={18} />
              </button>
              {historyOpen ? (
                <div className="ws-history-dropdown">
                  <div className="ws-history-heading">
                    <strong>
                      {text("Lịch sử trò chuyện", "Chat history")}
                    </strong>
                  </div>
                  {historyLoading ? (
                    <div className="ws-history-empty">
                      {text("Đang tải...", "Loading...")}
                    </div>
                  ) : historyError ? (
                    <div className="ws-history-empty">
                      {text(
                        "Không tải được lịch sử.",
                        "Could not load history.",
                      )}
                    </div>
                  ) : historySessions.length === 0 ? (
                    <div className="ws-history-empty">
                      {text(
                        "Chưa có cuộc trò chuyện nào.",
                        "No conversations yet.",
                      )}
                    </div>
                  ) : (
                    <div className="ws-history-list">
                      {historySessions.map((session) => (
                        <button
                          type="button"
                          key={session.id}
                          className={`ws-history-item${session.id === sessionId ? " active" : ""}`}
                          onClick={() => loadSession(session)}
                        >
                          <strong>
                            {session.title ||
                              text("Cuộc trò chuyện", "Conversation")}
                          </strong>
                          <small>
                            {session.messageCount}{" "}
                            {text("tin nhắn", "messages")}
                            {" · "}
                            {new Date(session.updatedAt).toLocaleString(
                              locale === "vi" ? "vi-VN" : "en-US",
                              {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            <button
              className="ws-toggle-btn ws-toggle-mobile"
              onClick={() => setReferencesDrawerOpen(!referencesDrawerOpen)}
              title={text("Nguồn tham chiếu", "References")}
            >
              <Info size={18} />
            </button>
            <button
              onClick={() => setReferencesCollapsed(!referencesCollapsed)}
              className={`ws-toggle-btn ws-toggle-desktop${!referencesCollapsed ? " active" : ""}`}
              title={text("Ẩn/Hiện Sidebar Phải", "Toggle Right Sidebar")}
            >
              {referencesCollapsed ? (
                <PanelRightOpen size={18} />
              ) : (
                <PanelRightClose size={18} />
              )}
            </button>
          </div>
        </header>

        {/* Message stream */}
        <div className="ws-message-stream">
          {activeMode === "SELECTED_SOURCES" &&
          selectedDocumentIds.length === 0 ? (
            <div className="ws-empty-state ws-empty-state--no-selection">
              <div className="ws-empty-icon">
                <AlertTriangle size={26} />
              </div>
              <h3>
                {text(
                  "Chưa chọn tài liệu nguồn",
                  "No source documents selected",
                )}
              </h3>
              <p>
                {text(
                  "Vui lòng đánh dấu chọn (checkbox) vào các tài liệu ở danh sách bên trái để đặt câu hỏi trên nhóm tài liệu đó.",
                  "Please check the boxes next to the documents on the left sidebar to ask questions about them.",
                )}
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg) => {
                const answerIssue = getAnswerIssueCopy(msg);
                return (
                  <div
                    key={msg.id}
                    className={`ws-message${msg.sender === "USER" ? " user" : " ai"}`}
                    onClick={() => {
                      if (msg.sender === "AI" && msg.sources.length > 0)
                        setSources(msg.sources);
                    }}
                  >
                    <div className="ws-message-avatar">
                      {msg.sender === "USER" ? "U" : <Sparkles size={15} />}
                    </div>
                    <div
                      className={`ws-message-bubble${answerIssue ? " ws-message-bubble--notice" : ""}`}
                    >
                      {answerIssue && (
                        <div className="ws-answer-issue" role="status">
                          <AlertTriangle size={16} aria-hidden="true" />
                          <div>
                            <strong>{answerIssue.title}</strong>
                            <span>{answerIssue.description}</span>
                          </div>
                        </div>
                      )}
                      {msg.sender === "AI" &&
                        msg.id !== "welcome" &&
                        msg.scope && (
                          <div className="ws-message-scope-indicator">
                            {msg.scope === "MY_LIBRARY" ? (
                              <span className="ws-scope-tag">
                                <Library size={12} />
                                {text(
                                  "Dựa trên các tài liệu liên quan tìm thấy trong thư viện của bạn...",
                                  "Based on relevant literature in your library...",
                                )}
                              </span>
                            ) : (
                              <span className="ws-scope-tag">
                                <FileText size={12} />
                                {text(
                                  "Dựa trên các file bạn đã chọn...",
                                  "Based on the selected files...",
                                )}
                              </span>
                            )}
                          </div>
                        )}
                      {msg.content ? (
                        <div className="ws-message-text">
                          {renderMessageContent(
                            msg.content,
                            msg.sources,
                            openCitationDrawer,
                          )}
                          {msg.status === "interrupted" && (
                            <div className="ws-message-interrupted mt-2 pt-2 border-t border-slate-200/30 text-amber-500 dark:text-amber-400 text-xs flex items-center gap-1.5 select-none font-medium">
                              <AlertTriangle size={14} />
                              <span>
                                {text(
                                  "Câu trả lời đã bị ngắt trước khi hoàn tất.",
                                  "Generation was interrupted before completion.",
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : isLoading ? (
                        <div
                          className="retrieval-skeleton"
                          role="status"
                          aria-live="polite"
                        >
                          <span />
                          <span />
                          <span />
                          <p>
                            {text(
                              "Đang tìm câu trả lời...",
                              "Finding an answer...",
                            )}
                          </p>
                        </div>
                      ) : null}
                      {msg.sources.length > 0 && (
                        <div className="ws-message-citations">
                          {msg.sources.map((src, sourceIndex) => (
                            <button
                              type="button"
                              key={`${msg.id}-${src.documentId}-${src.sourceNumber}-${sourceIndex}`}
                              className="ws-citation-tag"
                              onClick={() => openCitationDrawer(src)}
                            >
                              <span className="ws-citation-num">
                                [{src.sourceNumber}]
                              </span>
                              <span className="ws-citation-label">
                                {src.title}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Empty / welcome state */}
              {messages.length <= 1 && !isLoading && (
                <div className="ws-empty-state">
                  <div className="ws-empty-icon">
                    <Bot size={26} />
                  </div>
                  <h3>
                    {text(
                      "Hỏi đáp học tập thông minh",
                      "Smart Academic Companion",
                    )}
                  </h3>
                  <p>
                    {text(
                      "Đặt câu hỏi dựa trên nội dung nguồn học tập của bạn. Trích dẫn và liên kết tài liệu sẽ được đính kèm trực tiếp trong câu trả lời.",
                      "Ask questions grounded in your learning sources. Citations and document links will be attached directly to the answers.",
                    )}
                  </p>
                  <div className="ws-prompt-cards">
                    {(
                      ["summarize", "concepts", "quiz", "compare"] as const
                    ).map((key) => {
                      const labels: Record<
                        string,
                        [string, string, string, string]
                      > = {
                        summarize: [
                          "Tóm tắt tài liệu",
                          "Summarize Source",
                          "Trích xuất thông tin cốt lõi nhất.",
                          "Extract the core takeaways.",
                        ],
                        concepts: [
                          "Giải thích thuật ngữ",
                          "Explain Concepts",
                          "Làm rõ thuật ngữ và định lý phức tạp.",
                          "Clarify complex terms and theorems.",
                        ],
                        quiz: [
                          "Tạo bài trắc nghiệm",
                          "Generate Quiz",
                          "Tạo bộ câu hỏi để tự đánh giá.",
                          "Generate a self-assessment quiz.",
                        ],
                        compare: [
                          "So sánh các nguồn",
                          "Compare Sources",
                          "Tìm điểm tương đồng giữa các bài đọc.",
                          "Find common themes across readings.",
                        ],
                      };
                      const [vi, en, viSub, enSub] = labels[key];
                      return (
                        <div
                          key={key}
                          className="ws-prompt-card"
                          onClick={() => handlePromptCardClick(key)}
                        >
                          <h4>{text(vi, en)}</h4>
                          <p>{text(viSub, enSub)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messageEndRef} />
        </div>

        {/* Bottom input */}
        <div className="ws-chat-footer">
          {/* Selected sources chips */}
          {activeMode === "SELECTED_SOURCES" &&
            selectedDocumentIds.length > 0 && (
              <div className="ws-selected-chips-container">
                <div className="ws-selected-chips-header">
                  <span>
                    <strong>{selectedDocumentIds.length}</strong>{" "}
                    {text(
                      "File đang dùng cho câu hỏi tiếp theo",
                      "Files used for next question",
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="ws-selected-clear-all"
                  >
                    {text("Bỏ chọn tất cả", "Clear all")}
                  </button>
                </div>
                <div className="ws-selected-chips-list">
                  {selectedDocumentIds.map((id) => {
                    const doc = documents.find((d) => d.id === id);
                    if (!doc) return null;
                    return (
                      <div key={id} className="ws-selected-chip">
                        <span>{doc.title}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedDocumentIds((prev) =>
                              prev.filter((item) => item !== id),
                            )
                          }
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          <div className="ws-input-container">
            <textarea
              ref={textareaRef}
              rows={2}
              className="ws-textarea"
              placeholder={getPlaceholderText()}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitQuestion();
                }
              }}
              maxLength={4000}
            />
            <button
              onClick={isLoading ? handleStopGeneration : submitQuestion}
              className={`ws-send-btn ${isLoading ? "ws-stop-btn" : ""}`}
              disabled={!isLoading && !question.trim()}
              aria-label={
                isLoading
                  ? text("Dừng tạo", "Stop generation")
                  : text("Gửi câu hỏi", "Send question")
              }
            >
              {isLoading ? <X size={18} /> : <ArrowUp size={18} />}
            </button>
          </div>
          <div className="ws-grounding-indicator">
            <Database size={12} />
            <span>
              {activeMode === "SELECTED_SOURCES"
                ? text(
                    `Câu hỏi tiếp theo dựa trên: ${selectedDocumentIds.length} file đang dùng`,
                    `Next question based on: ${selectedDocumentIds.length} selected files`,
                  )
                : selectedSubjectIds.length > 0
                  ? text(
                      `Câu hỏi tiếp theo dựa trên: các môn ${selectedSubjectNames.join(", ")}`,
                      `Next question based on: subjects ${selectedSubjectNames.join(", ")}`,
                    )
                  : text(
                      "Câu hỏi tiếp theo dựa trên: Toàn bộ thư viện",
                      "Next question based on: Entire library",
                    )}
            </span>
          </div>
        </div>
      </section>

      {/* ─── RIGHT SIDEBAR ────────────────────────────────────────── */}
      <aside
        className={`ws-references-panel${referencesCollapsed ? " ws-panel--collapsed" : ""}${referencesDrawerOpen ? " ws-panel--open" : ""}`}
      >
        <div className="ws-references-header">
          <div className="ws-references-title-group">
            <h2>
              {activeMode === "MY_LIBRARY"
                ? text("Nguồn cho câu trả lời này", "Sources for this answer")
                : text("File trong phạm vi", "Files in scope")}
            </h2>
            <span className="ws-references-count">
              {activeMode === "MY_LIBRARY"
                ? visibleSources.length
                : selectedDocumentIds.length}
            </span>
          </div>
        </div>

        <div className="ws-references-content">
          {activeMode === "MY_LIBRARY" ? (
            <>
              {visibleSources.length > 0 ? (
                <>
                  <div
                    style={{
                      padding: "16px 16px 0",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: "var(--ink)",
                    }}
                  >
                    {text("Nguồn tìm thấy", "Sources found")}
                  </div>
                  <div className="ws-sidebar-selected-list">
                    {visibleSources.map((source, sourceIndex) => (
                      <div
                        key={`${source.documentId}-${source.sourceNumber}-${sourceIndex}`}
                        className="ws-reference-card"
                        onClick={() => openCitationDrawer(source)}
                      >
                        <div className="ws-reference-title-row">
                          <span className="ws-reference-number">
                            {source.sourceNumber}
                          </span>
                          <span
                            className="ws-reference-title"
                            title={source.title}
                          >
                            {source.title}
                          </span>
                        </div>
                        <p className="ws-reference-snippet">{source.snippet}</p>
                        <div className="ws-reference-footer">
                          {renderRelevanceBadge(source.relevanceScore)}
                          <button
                            type="button"
                            className="ws-open-doc-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              openCitationDrawer(source);
                            }}
                          >
                            <span>
                              {text("Xem đoạn trích", "View snippet")}
                            </span>
                            <ChevronRight size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="ws-sidebar-use-sources-btn"
                    onClick={() => {
                      const newIds = Array.from(
                        new Set([
                          ...selectedDocumentIds,
                          ...visibleSources.map((s) => s.documentId),
                        ]),
                      );
                      setSelectedDocumentIds(newIds);
                      setActiveMode("SELECTED_SOURCES");
                    }}
                  >
                    <Sparkles size={14} />
                    <span>
                      {text(
                        "Dùng các nguồn này cho câu hỏi tiếp theo",
                        "Use these sources for next question",
                      )}
                    </span>
                  </button>
                </>
              ) : (
                <div className="ws-refs-empty">
                  <FileSearch size={32} />
                  <strong>
                    {text("Chưa có trích dẫn", "No references yet")}
                  </strong>
                  <p>
                    {text(
                      "Đặt câu hỏi để tìm kiếm trích dẫn từ toàn bộ thư viện của bạn.",
                      "Ask a question to see citations from your entire library.",
                    )}
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              {selectedDocumentIds.length > 0 ? (
                <>
                  <div
                    style={{
                      padding: "16px 16px 0",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: "var(--ink)",
                    }}
                  >
                    {text(
                      "File đang dùng cho câu hỏi tiếp theo",
                      "Files used for next question",
                    )}
                  </div>
                  <div className="ws-sidebar-selected-list">
                    {selectedDocumentIds.map((id) => {
                      const doc = documents.find((d) => d.id === id);
                      if (!doc) return null;
                      return (
                        <div key={id} className="ws-sidebar-selected-item">
                          {getFileIcon(doc.fileType)}
                          <span title={doc.title}>{doc.title}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedDocumentIds((prev) =>
                                prev.filter((item) => item !== id),
                              )
                            }
                            aria-label={text("Bỏ chọn", "Remove selection")}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="ws-refs-empty">
                  <FileSearch size={32} />
                  <strong>
                    {text("Chưa chọn file nào", "No files selected")}
                  </strong>
                  <p>
                    {text(
                      "Vui lòng đánh dấu chọn tài liệu từ danh sách bên trái để sử dụng.",
                      "Please select documents from the list on the left to use them.",
                    )}
                  </p>
                </div>
              )}
              <button
                type="button"
                className="ws-sidebar-add-sources-btn"
                onClick={() => {
                  const searchInput = document.querySelector(
                    ".ws-search-input",
                  ) as HTMLInputElement;
                  if (searchInput) {
                    searchInput.focus();
                  }
                }}
              >
                <Plus size={14} />
                <span>{text("Thêm nguồn", "Add sources")}</span>
              </button>
            </>
          )}
        </div>
      </aside>

      {/* ─── CITATION PREVIEW DRAWER ──────────────────────────────── */}
      <div
        className={`ws-drawer-overlay${drawerOpen ? " open" : ""}`}
        onClick={() => setDrawerOpen(false)}
      >
        <div className="ws-drawer" onClick={(e) => e.stopPropagation()}>
          <header className="ws-drawer-header">
            <h3>{text("Đoạn trích tham khảo", "Reference Passage")}</h3>
            <button
              onClick={() => setDrawerOpen(false)}
              className="ws-drawer-close"
              aria-label={text("Đóng", "Close")}
            >
              <X size={18} />
            </button>
          </header>

          <div className="ws-drawer-content">
            {previewCitation && (
              <>
                <div className="ws-drawer-meta-grid">
                  <div className="ws-drawer-meta-item">
                    <span className="ws-drawer-meta-label">
                      {text("Tên tài liệu", "Document Title")}
                    </span>
                    <span className="ws-drawer-meta-value">
                      {previewCitation.title}
                    </span>
                  </div>
                  <div className="ws-drawer-meta-item">
                    <span className="ws-drawer-meta-label">
                      {text("Chỉ số nguồn", "Source ID")}
                    </span>
                    <span className="ws-drawer-meta-value">
                      #{previewCitation.sourceNumber}
                    </span>
                  </div>
                  {previewCitation.sourceLocator?.length ? (
                    <div className="ws-drawer-meta-item">
                      <span className="ws-drawer-meta-label">
                        {text("Vị trí nguồn", "Source location")}
                      </span>
                      <span className="ws-drawer-meta-value">
                        {previewCitation.sourceLocator.join(" · ")}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="ws-drawer-snippet-section">
                  <span className="ws-drawer-snippet-title">
                    {text("Đoạn trích tham khảo", "Reference Passage")}
                  </span>
                  <div className="ws-drawer-snippet-box">
                    {previewCitation.quote || previewCitation.snippet}
                  </div>
                </div>

                {!previewCitation.sourceLocator?.length && (
                  <div className="ws-drawer-notice">
                    <Info
                      size={14}
                      style={{ flexShrink: 0, color: "var(--ws-subtle)" }}
                    />
                    <span>
                      {text(
                        "Lưu ý: Nhảy trang chính xác hiện tại chưa được hỗ trợ bởi dữ liệu trích xuất.",
                        "Note: Page-level jumping is not yet supported by document extract metadata.",
                      )}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          <div
            className="ws-drawer-footer"
            style={{ display: "flex", gap: "10px" }}
          >
            {previewCitation &&
              documents.some((d) => d.id === previewCitation.documentId) && (
                <button
                  type="button"
                  className="ws-drawer-footer-btn ws-drawer-footer-btn--primary"
                  onClick={() => {
                    setSelectedDocumentIds([previewCitation.documentId]);
                    setActiveMode("SELECTED_SOURCES");
                    setDrawerOpen(false);
                  }}
                >
                  <Sparkles size={16} />
                  <span>{text("Hỏi tài liệu này", "Ask this file")}</span>
                </button>
              )}
            <button
              className="ws-drawer-footer-btn"
              onClick={async () => {
                if (previewCitation) {
                  const doc = documents.find(
                    (d) => d.id === previewCitation.documentId,
                  );
                  if (doc) {
                    const result = await createDownloadUrl(doc.id);
                    window.open(result.url, "_blank", "noopener,noreferrer");
                  }
                }
              }}
            >
              <ArrowDownToLine size={16} />
              <span>
                {text("Tải tài liệu đầy đủ", "Download Full Document")}
              </span>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
