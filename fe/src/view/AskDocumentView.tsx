"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpenText,
  ChevronDown,
  FileText,
  PanelLeftClose,
  Sparkles,
} from "lucide-react";
import { askDocument } from "../api/chat.api";
import { ChatComposer } from "../components/chat/ChatComposer";
import { CitationList } from "../components/chat/CitationList";
import { useLanguage } from "../i18n/LanguageProvider";
import { localize } from "../i18n/localize";
import type { ChatMessage, Citation } from "../types/chat";

const documentId = "79c555d8-b4ce-4d98-9f93-15f2fe1c9813";

// Hiển thị giao diện ask tài liệu view.
export function AskDocumentView() {
  const { locale } = useLanguage();
  // Thực hiện chức năng text.
  const text = (vi: string, en: string) => localize(locale, vi, en);
  const [question, setQuestion] = useState("");
  const [sessionId, setSessionId] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [selectedCitation, setSelectedCitation] = useState<Citation>();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "AI",
      content: localize(
        locale,
        "Tôi sẵn sàng trả lời dựa trên tài liệu này. Mỗi câu trả lời đều hiển thị rõ nguồn tham chiếu.",
        "I am ready to answer questions grounded in this document. Every answer will keep its source visible.",
      ),
      sources: [],
    },
  ]);

  const prompts = useMemo(
    () =>
      locale === "vi"
        ? [
            "Tóm tắt luận điểm chính",
            "Giải thích các mô hình lỗi",
            "Tạo năm câu hỏi ôn tập",
          ]
        : [
            "Summarize the core argument",
            "Explain the failure models",
            "Create five review questions",
          ],
    [locale],
  );

  useEffect(() => {
    setMessages((current) =>
      current.map((message) =>
        message.id === "welcome"
          ? {
              ...message,
              content: localize(
                locale,
                "Tôi sẵn sàng trả lời dựa trên tài liệu này. Mỗi câu trả lời đều hiển thị rõ nguồn tham chiếu.",
                "I am ready to answer questions grounded in this document. Every answer will keep its source visible.",
              ),
            }
          : message,
      ),
    );
  }, [locale]);

  // Thực hiện chức năng submit question.
  async function submitQuestion(prompt = question) {
    const trimmed = prompt.trim();
    if (!trimmed || isLoading) return;

    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        sender: "USER",
        content: trimmed,
        sources: [],
      },
    ]);
    setQuestion("");
    setIsLoading(true);

    try {
      const response = await askDocument({
        documentId,
        question: trimmed,
        sessionId,
      });
      setSessionId(response.sessionId);
      setMessages((current) => [
        ...current,
        {
          id: response.messageId,
          sender: "AI",
          content: response.answer,
          sources: response.sources,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          sender: "AI",
          content: text(
            "Không thể nhận phản hồi AI lúc này. Vui lòng thử lại; hệ thống không dùng câu trả lời mẫu.",
            "The AI response is unavailable. Please retry; the system does not use a demo answer.",
          ),
          sources: [],
          errorCode: "REQUEST_FAILED",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main id="main-content" className="ai-page ai-page--document">
      <header className="workspace-heading">
        <div>
          <p className="eyebrow">
            {text("HỎI TÀI LIỆU NÀY", "ASK THIS DOCUMENT")}
          </p>
          <h1>
            {text(
              "Đặt câu hỏi để hiểu rõ tài liệu.",
              "Ask questions to understand this document.",
            )}
          </h1>
        </div>
        <span className="scope-chip">
          <FileText size={15} />
          {text("Phạm vi: Tệp hiện tại", "Scope: Current file")}
        </span>
      </header>

      <section className="document-chat-grid">
        <article className="document-panel">
          <header className="panel-toolbar">
            <div>
              <span className="file-type-badge">PDF</span>
              <strong>Distributed Systems Field Notes</strong>
            </div>
            <button
              className="icon-button"
              type="button"
              title={text("Thu gọn bản xem trước", "Collapse preview")}
            >
              <PanelLeftClose size={18} />
            </button>
          </header>

          <button
            type="button"
            className="summary-toggle"
            onClick={() => setSummaryOpen((value) => !value)}
          >
            <span>
              <Sparkles size={16} />
              {text("Bản tóm tắt được tạo", "Generated summary")}
            </span>
            <ChevronDown className={summaryOpen ? "rotate" : ""} size={18} />
          </button>
          {summaryOpen ? (
            <p className="document-summary">
              {text(
                "Tổng quan thực tế về các đảm bảo của hệ thống phân tán, giả định lỗi, đồng thuận, sao chép và những đánh đổi giữa các mô hình nhất quán.",
                "A practical overview of distributed system guarantees, failure assumptions, consensus, replication, and the tradeoffs behind consistency models.",
              )}
            </p>
          ) : null}

          <div className="document-canvas">
            <div className="document-page">
              <p className="document-page-label">
                {text(
                  "BÀI GIẢNG 04 · TRANG 12 / 42",
                  "LECTURE 04 · PAGE 12 OF 42",
                )}
              </p>
              <h2>
                {text(
                  "Đồng thuận bắt đầu từ các giả định lỗi",
                  "Consensus begins with failure assumptions",
                )}
              </h2>
              <p>
                {text(
                  "Hệ thống phân tán không thể chọn chiến lược phối hợp phù hợp trước khi xác định các loại lỗi dự kiến. Lỗi dừng, phân vùng mạng và thông điệp bị trễ đều làm thay đổi những gì hệ thống có thể cam kết.",
                  "A distributed system cannot choose a meaningful coordination strategy until it states which failures are expected. Crash failures, network partitions, and delayed messages each change what the system can promise.",
                )}
              </p>
              <blockquote
                className={selectedCitation ? "source-highlight" : undefined}
              >
                {text(
                  "Giao thức đồng thuận đánh đổi thêm chi phí phối hợp để đạt được một thứ tự chuyển trạng thái thống nhất.",
                  "Consensus protocols trade additional coordination for a single agreed ordering of state transitions.",
                )}
              </blockquote>
              <h3>
                {text(
                  "Sao chép không phải là mô hình nhất quán",
                  "Replication is not a consistency model",
                )}
              </h3>
              <p>
                {text(
                  "Sao chép cải thiện tính sẵn sàng và độ bền, nhưng ứng dụng vẫn cần quy tắc xử lý trạng thái đồng thời và công bố cập nhật.",
                  "Replication improves availability and durability, but the application still needs rules for reconciling concurrent state and exposing updates.",
                )}
              </p>
            </div>
          </div>
        </article>

        <article className="chat-panel">
          <header className="chat-header">
            <div>
              <span className="ai-mark">
                <Sparkles size={17} />
              </span>
              <div>
                <strong>
                  {text(
                    "Phiên nghiên cứu tài liệu",
                    "Document research session",
                  )}
                </strong>
              </div>
            </div>
            <span className="status-dot">
              {text("AI sẵn sàng", "AI ready")}
            </span>
          </header>

          <div className="message-stream">
            {messages.map((message) => (
              <div
                className={
                  message.sender === "USER"
                    ? "message user-message"
                    : "message ai-message"
                }
                key={message.id}
              >
                {message.sender === "AI" ? (
                  <span className="message-icon">
                    <Sparkles size={15} />
                  </span>
                ) : null}
                <div>
                  <p>{message.content}</p>
                  <CitationList
                    citations={message.sources}
                    selected={selectedCitation?.sourceNumber}
                    onSelect={setSelectedCitation}
                  />
                </div>
              </div>
            ))}
            {isLoading ? (
              <div className="ai-thinking">
                <span />
                <div>
                  <strong>
                    {text(
                      "Đang đọc các đoạn trích nguồn...",
                      "Reading source snippets...",
                    )}
                  </strong>
                  <p>
                    {text(
                      "Đang xây dựng câu trả lời từ tài liệu này.",
                      "Building an answer from this document.",
                    )}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="chat-footer">
            <div className="prompt-chips">
              {prompts.map((prompt) => (
                <button
                  type="button"
                  key={prompt}
                  onClick={() => void submitQuestion(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
            <ChatComposer
              value={question}
              onChange={setQuestion}
              onSubmit={() => void submitQuestion()}
              isLoading={isLoading}
              placeholder={text(
                "Đặt câu hỏi về tài liệu này...",
                "Ask about this document...",
              )}
            />
            <p className="grounded-note">
              <BookOpenText size={14} />
              {text(
                "Câu trả lời chỉ có thể trích dẫn từ tệp hiện tại.",
                "Answers may include citations from the current file only.",
              )}
            </p>
          </div>
        </article>
      </section>
    </main>
  );
}
