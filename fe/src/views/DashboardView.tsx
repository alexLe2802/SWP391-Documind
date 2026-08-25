"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Clock3,
  FileCheck2,
  FileText,
  HardDrive,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { fetchChatSessions } from "../api/chat.api";
import { fetchLibraryDocuments } from "../api/documents.api";
import { fetchCurrentSubscription } from "../api/payments.api";
import { useLanguage } from "../i18n/LanguageProvider";
import { localize } from "../i18n/localize";
import { buildDashboardSuggestions } from "../lib/dashboard-suggestions";
import { ROUTES } from "../lib/routes";
import type { LibraryDocument } from "../types/document";
import type { ChatSessionSummary } from "../types/chat";
import type { CurrentSubscription } from "../types/payment";

// Hiển thị giao diện dashboard view.
export function DashboardView() {
  const { locale } = useLanguage();
  // Thực hiện chức năng text.
  const text = (vi: string, en: string) => localize(locale, vi, en);
  const [question, setQuestion] = useState("");
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [recentChats, setRecentChats] = useState<ChatSessionSummary[]>([]);
  const [subscription, setSubscription] = useState<CurrentSubscription>();
  useEffect(() => {
    let active = true;
    fetchLibraryDocuments({ limit: 100 })
      .then((result) => {
        if (active) setDocuments(result.items);
      })
      .catch(() => {
        if (active) setDocuments([]);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    fetchChatSessions(2)
      .then((result) => {
        if (active) setRecentChats(result.items);
      })
      .catch(() => {
        if (active) setRecentChats([]);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    fetchCurrentSubscription()
      .then((result) => {
        if (active) setSubscription(result);
      })
      .catch(() => {
        if (active) setSubscription(undefined);
      });
    return () => {
      active = false;
    };
  }, []);
  const readyDocuments = documents.filter(
    (document) => document.indexStatus === "READY",
  );
  const suggestions = buildDashboardSuggestions(documents, locale);
  const aiUsagePercent = getAiUsagePercent(subscription);
  const hasUnlimitedAiChats = subscription?.aiChatLimit === null;
  const fallbackStorageUsedMb =
    documents.reduce((total, document) => total + document.fileSize, 0) /
    (1024 * 1024);
  const uploadedDocumentsUsage = subscription
    ? `${subscription.uploadsUsed} / ${subscription.uploadLimit}`
    : `${documents.length} / —`;
  const storageUsage = subscription
    ? `${formatStorage(subscription.storageUsedMb)} / ${formatStorage(subscription.storageLimitMb)}`
    : `${formatStorage(fallbackStorageUsedMb)} / —`;

  // Thực hiện chức năng submit question.
  function submitQuestion(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    window.location.href = `${ROUTES.aiChat}?q=${encodeURIComponent(question.trim())}`;
  }

  return (
    <main id="main-content" className="workspace-dashboard">
      <section className="dashboard-welcome">
        <p className="eyebrow">
          {text("KHÔNG GIAN HỌC TẬP AI", "AI STUDY WORKSPACE")}
        </p>
        <h1>
          {text(
            "Hôm nay bạn muốn tìm hiểu điều gì?",
            "What would you like to understand today?",
          )}
        </h1>
        <p>
          {text(
            "Tìm kiếm nguồn tài liệu, tiếp tục chủ đề nghiên cứu hoặc đặt câu hỏi trên toàn bộ thư viện của bạn.",
            "Search your sources, continue a research thread, or ask across your entire library.",
          )}
        </p>

        <form className="dashboard-ai-search" onSubmit={submitQuestion}>
          <Sparkles size={21} />
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={text(
              "Hỏi bất kỳ điều gì từ tài liệu học tập...",
              "Ask anything from your study documents...",
            )}
            aria-label={text("Hỏi thư viện của bạn", "Ask your library")}
          />
          <button
            type="submit"
            aria-label={text("Hỏi AI", "Ask AI")}
            disabled={!question.trim()}
          >
            <ArrowRight size={19} />
          </button>
        </form>

        <div className="dashboard-suggestions">
          {suggestions.map((suggestion) => (
            <button
              type="button"
              key={suggestion}
              onClick={() => setQuestion(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </section>

      <section className="dashboard-content-grid">
        <div className="dashboard-primary-column">
          <section className="dashboard-section">
            <header className="dashboard-section-heading">
              <div>
                <p className="eyebrow">
                  {text("NGUỒN GẦN ĐÂY", "RECENT SOURCES")}
                </p>
                <h2>
                  {text(
                    "Tiếp tục từ thư viện của bạn",
                    "Continue from your library",
                  )}
                </h2>
              </div>
              <Link href={ROUTES.library}>
                {text("Xem tất cả", "View all")} <ArrowRight size={15} />
              </Link>
            </header>
            <div className="dashboard-document-list">
              {documents.slice(0, 3).map((document) => (
                <article key={document.id}>
                  <span className="dashboard-file-icon">
                    <FileText size={19} />
                  </span>
                  <div>
                    <strong>{document.title}</strong>
                    <span>
                      {document.subject} / {document.fileType}
                    </span>
                  </div>
                  <span
                    className={`index-status index-status--${document.indexStatus.toLowerCase()}`}
                  >
                    {document.indexStatus === "READY"
                      ? text("AI sẵn sàng", "AI ready")
                      : text("Đang xử lý", "Processing")}
                  </span>
                  <Link
                    href={`${ROUTES.aiChat}?scope=document&document=${document.id}`}
                  >
                    <Sparkles size={15} />
                    {text("Hỏi AI", "Ask AI")}
                  </Link>
                </article>
              ))}
            </div>
          </section>

          <section className="dashboard-section">
            <header className="dashboard-section-heading">
              <div>
                <p className="eyebrow">
                  {text("TRÒ CHUYỆN GẦN ĐÂY", "RECENT CHAT")}
                </p>
                <h2>
                  {text("Tiếp tục chủ đề học tập", "Pick up a study thread")}
                </h2>
              </div>
            </header>
            <div className="recent-chat-grid">
              {recentChats.map((chat) => (
                <Link
                  href={`${ROUTES.aiChat}?session=${chat.id}`}
                  key={chat.id}
                >
                  {chat.document ? (
                    <BookOpen size={19} />
                  ) : (
                    <MessageSquareText size={19} />
                  )}
                  <div>
                    <strong>
                      {chat.title ||
                        chat.lastMessage?.content ||
                        text(
                          "Cuộc trò chuyện chưa có tiêu đề",
                          "Untitled conversation",
                        )}
                    </strong>
                    <span>
                      {chat.document
                        ? chat.document.title
                        : text(
                            `${chat.messageCount} tin nhắn`,
                            `${chat.messageCount} messages`,
                          )}
                      {` / ${new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium" }).format(new Date(chat.updatedAt))}`}
                    </span>
                  </div>
                  <ArrowRight size={16} />
                </Link>
              ))}
              {recentChats.length === 0 && (
                <p>
                  {text(
                    "Chưa có cuộc trò chuyện nào.",
                    "No conversations yet.",
                  )}
                </p>
              )}
            </div>
          </section>
        </div>

        <aside className="dashboard-insights">
          <section className="usage-panel">
            <div className="usage-panel-heading">
              <span>
                <Sparkles size={17} />
                {text("Mức sử dụng AI", "AI usage")}
              </span>
              <strong>
                {subscription
                  ? hasUnlimitedAiChats
                    ? text("Không giới hạn", "Unlimited")
                    : `${aiUsagePercent}%`
                  : "—"}
              </strong>
            </div>
            <div className="usage-meter">
              <span style={{ width: `${aiUsagePercent}%` }} />
            </div>
            <p>
              {subscription
                ? hasUnlimitedAiChats
                  ? text(
                      `Đã dùng ${subscription.aiChatsUsed} lượt chat AI trong kỳ hiện tại · Không giới hạn.`,
                      `${subscription.aiChatsUsed} AI chats used in the current period · Unlimited.`,
                    )
                  : text(
                      `Đã dùng ${subscription.aiChatsUsed} trong ${subscription.aiChatLimit} lượt chat AI trong kỳ hiện tại.`,
                      `${subscription.aiChatsUsed} of ${subscription.aiChatLimit} AI chats used in the current period.`,
                    )
                : text("Đang tải mức sử dụng AI...", "Loading AI usage...")}
            </p>
            <Link href={ROUTES.subscription}>
              {text("Quản lý gói", "Manage plan")} <ArrowRight size={14} />
            </Link>
          </section>
          <section className="dashboard-metrics">
            <article>
              <FileCheck2 size={19} />
              <span>{text("Tài liệu đã tải lên", "Uploaded documents")}</span>
              <strong>{uploadedDocumentsUsage}</strong>
            </article>
            <article>
              <HardDrive size={19} />
              <span>{text("Dung lượng đã dùng", "Storage used")}</span>
              <strong>{storageUsage}</strong>
            </article>
            <article>
              <Clock3 size={19} />
              <span>{text("Đang xử lý", "Processing")}</span>
              <strong>{documents.length - readyDocuments.length}</strong>
            </article>
          </section>
          <Link href={ROUTES.upload} className="dashboard-upload-cta">
            <span>
              <FileText size={21} />
            </span>
            <div>
              <strong>
                {text("Thêm nguồn tài liệu mới", "Add a new source")}
              </strong>
              <small>PDF, DOCX, PPTX hoặc XLSX</small>
            </div>
            <ArrowRight size={17} />
          </Link>
        </aside>
      </section>
    </main>
  );
}

// Lấy dữ liệu ai usage percent.
function getAiUsagePercent(subscription?: CurrentSubscription) {
  if (!subscription || subscription.aiChatLimit === null) return 0;
  if (subscription.aiChatLimit <= 0) return 0;
  return Math.min(
    100,
    Math.round((subscription.aiChatsUsed / subscription.aiChatLimit) * 100),
  );
}

// Chuyển đổi hoặc chuẩn hóa storage.
function formatStorage(megabytes: number) {
  if (megabytes >= 1024) {
    return `${(megabytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 2 })} GB`;
  }
  return `${megabytes.toLocaleString(undefined, { maximumFractionDigits: 2 })} MB`;
}
