// ============================================================================
// MF3 — Enum MessageSender (người/nguồn gửi của một tin nhắn chat)
// ----------------------------------------------------------------------------
// String enum phân loại ai là người tạo ra một tin nhắn trong phiên chat. Được
// dùng khi lưu tin nhắn xuống DB và khi hiển thị hội thoại (canh phải cho USER,
// canh trái cho AI, v.v.).
// ============================================================================
export enum MessageSender {
  USER = 'USER', // tin nhắn do người dùng gửi (câu hỏi).
  AI = 'AI', // tin nhắn do trợ lý AI trả lời.
  SYSTEM = 'SYSTEM', // tin nhắn hệ thống (thông báo/ngữ cảnh nội bộ).
}
