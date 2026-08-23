"use client";

import { useEffect, useState } from "react";
import { FileSearch, Filter, Library, Sparkles } from "lucide-react";
import { askLibrary } from "../api/chat.api";
import { ChatComposer } from "../components/chat/ChatComposer";
import { CitationList } from "../components/chat/CitationList";
import { useLanguage } from "../i18n/LanguageProvider";
import { localize } from "../i18n/localize";
import type { ChatMessage, Citation } from "../types/chat";

// Hiển thị giao diện ask library view.
export function AskLibraryView() {
  const { locale } = useLanguage();
  // Thực hiện chức năng text.
  const text = (vi: string, en: string) => localize(locale, vi, en);
  const [question, setQuestion] = useState("");
  const [sessionId, setSessionId] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSource, setSelectedSource] = useState<Citation>();
  const [fileType, setFileType] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "AI",
      content: localize(
        locale,
        "Hãy đặt câu hỏi trên thư viện đã được lập chỉ mục. Tôi sẽ tìm các nguồn phù hợp nhất và cho biết vì sao chúng liên quan.",
        "Ask a question across your indexed library. I will retrieve the strongest matching sources and show why they matter.",
      ),
      sources: [],
    },
  ]);
  const [sources, setSources] = useState<Citation[]>([]);

  useEffect(() => {
    setMessages((current) =>
      current.map((message) =>
        message.id === "welcome"
          ? {
              ...message,
              content: localize(
                locale,
                "Hãy đặt câu hỏi trên thư viện đã được lập chỉ mục. Tôi sẽ tìm các nguồn phù hợp nhất và cho biết vì sao chúng liên quan.",
                "Ask a question across your indexed library. I will retrieve the strongest matching sources and show why they matter.",
              ),
            }
          : message,
      ),
    );
  }, [locale]);

  // Thực hiện chức năng submit question.
  async function submitQuestion() {
    const trimmed = question.trim();
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
    setSources([]);

    try {
      const response = await askLibrary({
        question: trimmed,
        filters: fileType ? { fileType } : undefined,
        sessionId,
      });
      setSessionId(response.sessionId);
      setSources(response.sources);
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
    <main id="main-content" className="ai-page ai-page--library">
      <header className="workspace-heading">
        <div>
          <p className="eyebrow">
            {text("HỎI THƯ VIỆN CỦA TÔI", "ASK MY LIBRARY")}
          </p>
          <h1>
            {text(
              "Kết nối ý tưởng từ mọi nguồn tài liệu.",
              "Connect ideas across every source.",
            )}
          </h1>
        </div>
        <span className="scope-chip">
          <Library size={15} />
          {text("Phạm vi: Toàn bộ thư viện", "Scope: Entire library")}
        </span>
      </header>

      <section className="library-research-grid">
        <article className="chat-panel library-chat">
          <header className="chat-header">
            <div>
              <span className="ai-mark">
                <Sparkles size={17} />
              </span>
              <div>
                <strong>
                  {text(
                    "Phiên nghiên cứu thư viện",
                    "Library research session",
                  )}
                </strong>
                <span>
                  {text(
                    "Truy xuất trên các tài liệu đã lập chỉ mục",
                    "Retrieval across indexed documents",
                  )}
                </span>
              </div>
            </div>
            <label className="compact-filter">
              <Filter size={15} />
              <select
                value={fileType}
                onChange={(event) => setFileType(event.target.value)}
              >
                <option value="">{text("Tất cả tệp", "All files")}</option>
                <option value="PDF">PDF</option>
                <option value="DOCX">DOCX</option>
                <option value="PPTX">PPTX</option>
              </select>
            </label>
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
                  {message.sources.length > 0 ? (
                    <p className="inline-source-links">
                      {message.sources.map((source) => (
                        <button
                          type="button"
                          key={source.sourceNumber}
                          onClick={() => setSelectedSource(source)}
                        >
                          [{source.sourceNumber}]
                        </button>
                      ))}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
            {isLoading ? (
              <div className="retrieval-skeleton">
                <span />
                <span />
                <span />
                <p>
                  {text(
                    "Đang tìm kiếm trong thư viện...",
                    "Searching your library...",
                  )}
                </p>
              </div>
            ) : null}
          </div>

          <div className="chat-footer">
            <div className="prompt-chips">
              {(locale === "vi"
                ? [
                    "So sánh ghi chú về hệ thống phân tán",
                    "Tìm tài liệu về độ tin cậy của nghiên cứu",
                    "Lập kế hoạch học tập từ các tệp của tôi",
                  ]
                : [
                    "Compare my notes on distributed systems",
                    "Find sources about research validity",
                    "Build a study plan from my files",
                  ]
              ).map((prompt) => (
                <button
                  type="button"
                  key={prompt}
                  onClick={() => setQuestion(prompt)}
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
                "Đặt câu hỏi trên thư viện học tập...",
                "Ask across your study library...",
              )}
            />
          </div>
        </article>

        <aside className="retrieved-panel">
          <header>
            <div>
              <p className="eyebrow">
                {text("TÀI LIỆU ĐÃ TÌM THẤY", "RETRIEVED DOCUMENTS")}
              </p>
              <h2>{text("Tài liệu tham khảo", "Reference documents")}</h2>
            </div>
            <span>{sources.length || "—"}</span>
          </header>
          {isLoading ? (
            <div className="source-card-skeletons">
              {[1, 2, 3].map((item) => (
                <div key={item} className="source-card-skeleton" />
              ))}
            </div>
          ) : sources.length > 0 ? (
            <CitationList
              citations={sources}
              selected={selectedSource?.sourceNumber}
              onSelect={setSelectedSource}
            />
          ) : (
            <div className="soft-empty-state">
              <FileSearch size={28} />
              <strong>
                {text(
                  "Chưa có tài liệu tham khảo",
                  "No reference documents yet",
                )}
              </strong>
              <p>
                {text(
                  "Đặt câu hỏi để tìm các tài liệu liên quan trong thư viện.",
                  "Ask a question to find relevant documents in your library.",
                )}
              </p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
