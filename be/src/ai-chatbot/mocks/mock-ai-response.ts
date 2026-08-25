import { ChatMode } from '../enums/chat-mode.enum';
import { MessageSender } from '../enums/message-sender.enum';

// Chứa các phản hồi AI mẫu được chọn luân phiên khi Gemini chạy ở chế độ mock.
export const MOCK_AI_RESPONSES: string[] = [
  '[MOCK] DocuMind AI received your question. This is a placeholder response while the Gemini integration is being stabilised. Set GEMINI_API_KEY and GEMINI_MOCK=false to enable live responses.',
  '[MOCK] Great question! Based on the document context provided, the answer would normally be generated here by Google Gemini when live mode is enabled.',
  '[MOCK] I found several relevant excerpts in your documents. In production, I will synthesise a detailed answer from those sources using Gemini AI.',
  '[MOCK] This is a sample multi-turn response. Your conversation history is being maintained correctly across turns. Live Gemini responses will reflect the full context.',
];

let mockResponseIndex = 0;

// Trả phản hồi AI mẫu kế tiếp theo cơ chế luân phiên.
export function getNextMockResponse(): string {
  const response =
    MOCK_AI_RESPONSES[mockResponseIndex % MOCK_AI_RESPONSES.length];
  mockResponseIndex++;
  return response;
}

// Cung cấp dữ liệu phiên chat mẫu cho kiểm thử tích hợp.
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
