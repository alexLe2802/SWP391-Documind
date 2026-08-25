import type { AiChatResponse, Citation } from "../types/chat";
import type { Locale } from "../i18n/translations";

// Lấy dữ liệu tài liệu citation.
function getDocumentCitation(locale: Locale): Citation {
  return {
    sourceNumber: 1,
    documentId: "79c555d8-b4ce-4d98-9f93-15f2fe1c9813",
    title: "Distributed Systems Field Notes",
    snippet:
      locale === "vi"
        ? "Giao thức đồng thuận đánh đổi thêm chi phí phối hợp để đạt được một thứ tự chuyển trạng thái thống nhất."
        : "Consensus protocols trade additional coordination for a single agreed ordering of state transitions.",
    relevanceScore: 0.94,
  };
}

// Thực hiện chức năng demo tài liệu answer.
export function demoDocumentAnswer(
  question: string,
  locale: Locale = "vi",
): AiChatResponse {
  return {
    answer:
      locale === "vi"
        ? `Tài liệu phân tích "${question}" dựa trên ba ý chính: giả định lỗi rõ ràng, trạng thái được sao chép và mô hình nhất quán phù hợp với tải công việc. Tài liệu khuyến nghị xác định các lỗi có thể chấp nhận trước khi chọn chiến lược phối hợp.`
        : `The document frames "${question}" around three ideas: explicit failure assumptions, replicated state, and a consistency model chosen for the workload. It recommends stating which failures are tolerated before selecting a coordination strategy.`,
    sessionId: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    suggestedPrompts:
      locale === "vi"
        ? [
            "So sánh tính nhất quán mạnh và nhất quán cuối cùng",
            "Giải thích các mô hình lỗi chính",
            "Tạo năm câu hỏi ôn tập",
          ]
        : [
            "Compare strong and eventual consistency",
            "Explain the main failure models",
            "Create five review questions",
          ],
    sources: [getDocumentCitation(locale)],
    answerStatus: "ANSWERED",
    errorCode: null,
  };
}

// Thực hiện chức năng demo library answer.
export function demoLibraryAnswer(
  question: string,
  locale: Locale = "vi",
): AiChatResponse {
  return {
    answer:
      locale === "vi"
        ? `Trong thư viện của bạn, câu trả lời phù hợp nhất cho "${question}" kết hợp ghi chú hệ thống với cẩm nang nghiên cứu: xác định chính xác nhận định, nêu rõ các giả định rồi so sánh tài liệu từ những nguồn độc lập trước khi kết luận.`
        : `Across your library, the strongest answer to "${question}" combines the systems notes with the research handbook: define the claim precisely, identify its assumptions, then compare evidence from independent sources before drawing a conclusion.`,
    sessionId: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    suggestedPrompts:
      locale === "vi"
        ? [
            "Chuyển nội dung này thành kế hoạch học tập",
            "Chỉ ra điểm khác biệt giữa các nguồn",
            "Tạo bản tóm tắt ngắn gọn",
          ]
        : [
            "Turn this into a study plan",
            "Show disagreements between sources",
            "Generate a concise summary",
          ],
    sources: [
      getDocumentCitation(locale),
      {
        sourceNumber: 2,
        documentId: "16f32b32-68da-43bf-86a3-c9ad003a8a39",
        title: "Research Methods Handbook",
        snippet:
          locale === "vi"
            ? "Đối chiếu tam giác tăng độ tin cậy bằng cách so sánh tài liệu thu thập từ nhiều phương pháp hoặc nguồn khác nhau."
            : "Triangulation improves confidence by comparing evidence gathered through different methods or sources.",
        relevanceScore: 0.88,
      },
      {
        sourceNumber: 3,
        documentId: "9433ffbd-2fed-40b3-a7a3-16ef4153503e",
        title: "Database Indexing Explained",
        snippet:
          locale === "vi"
            ? "Kế hoạch truy vấn cần được kiểm tra theo mẫu truy cập thực tế thay vì chỉ tối ưu dựa trên trực giác."
            : "Query plans should be inspected against actual access patterns rather than optimized from intuition alone.",
        relevanceScore: 0.76,
      },
    ],
    answerStatus: "ANSWERED",
    errorCode: null,
  };
}
