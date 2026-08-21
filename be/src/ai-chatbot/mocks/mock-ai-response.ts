// ============================================================================
// MF3 — Dữ liệu & tiện ích MOCK cho phản hồi AI
// ----------------------------------------------------------------------------
// File cung cấp phản hồi giả (mock) dùng khi CHƯA bật Gemini thật (thiếu API key
// hoặc cấu hình GEMINI_MOCK=true). Nhờ vậy developer/tester vẫn chạy được luồng
// chat mà không tốn chi phí gọi mô hình. Mock giữ nguyên hình dạng dữ liệu như
// thật để phần còn lại của hệ thống hoạt động bình thường.
// ============================================================================
import { ChatMode } from '../enums/chat-mode.enum';
import { MessageSender } from '../enums/message-sender.enum';

// Mảng các câu trả lời mẫu. `export const ... : string[]` = hằng số mảng chuỗi,
// export để module khác (GeminiService) dùng. Các phần tử sẽ được lấy luân phiên.
export const MOCK_AI_RESPONSES: string[] = [
  '[MOCK] DocuMind AI received your question. This is a placeholder response while the Gemini integration is being stabilised. Set GEMINI_API_KEY and GEMINI_MOCK=false to enable live responses.',
  '[MOCK] Great question! Based on the document context provided, the answer would normally be generated here by Google Gemini when live mode is enabled.',
  '[MOCK] I found several relevant excerpts in your documents. In production, I will synthesise a detailed answer from those sources using Gemini AI.',
  '[MOCK] This is a sample multi-turn response. Your conversation history is being maintained correctly across turns. Live Gemini responses will reflect the full context.',
];

// Biến đếm ở phạm vi module (module-level state): nhớ vị trí phản hồi gần nhất
// giữa các lần gọi để lần lượt trả về từng câu khác nhau (vòng tròn).
let mockResponseIndex = 0;

// Trả về phản hồi mẫu kế tiếp theo cơ chế luân phiên (round-robin).
export function getNextMockResponse(): string {
  // Toán tử `%` (chia lấy dư) giữ chỉ số luôn trong khoảng [0, length-1]:
  //   index=0→phần tử 0, ..., index=length→quay lại phần tử 0. Nhờ vậy không bao
  //   giờ vượt mảng và các câu trả lời được xoay vòng vô hạn.
  const response =
    MOCK_AI_RESPONSES[mockResponseIndex % MOCK_AI_RESPONSES.length];
  mockResponseIndex++; // tăng đếm cho lần gọi sau.
  return response;
}

// Fixture (dữ liệu cố định) mô phỏng MỘT phiên chat hoàn chỉnh, dùng cho kiểm thử
// tích hợp: gồm id, mode và lịch sử hội thoại mẫu (1 câu hỏi USER + 1 trả lời AI).
export const MOCK_SESSION_FIXTURE = {
  id: 'mock-session-00000000-0000-0000-0000-000000000001',
  mode: ChatMode.ASK_MY_LIBRARY,
  createdAt: '2026-01-01T00:00:00.000Z',
  history: [
    {
      sender: MessageSender.USER,
      content: 'What is DocuMind?',
      timestamp: '2026-01-01T00:00:01.000Z',
    },
    {
      sender: MessageSender.AI,
      content: MOCK_AI_RESPONSES[0],
      timestamp: '2026-01-01T00:00:02.000Z',
    },
  ],
};
