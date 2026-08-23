// ============================================================================
// MF3 — Enum ChatMode (chế độ/phạm vi hỏi của chatbot)
// ----------------------------------------------------------------------------
// `enum` là kiểu liệt kê: định nghĩa một tập hằng số có tên. Ở đây là string enum
// (mỗi thành viên gán một chuỗi cố định), nên khi lưu DB/JSON ta thấy đúng chuỗi
// 'ASK_THIS_DOCUMENT' thay vì số — dễ đọc và ổn định. Dùng để phân biệt luồng
// nghiệp vụ và ràng buộc validate (@IsEnum(ChatMode)).
// ============================================================================
export enum ChatMode {
  ASK_THIS_DOCUMENT = 'ASK_THIS_DOCUMENT', // hỏi trong phạm vi MỘT tài liệu cụ thể.
  ASK_MY_LIBRARY = 'ASK_MY_LIBRARY', // hỏi trên toàn bộ thư viện của người dùng.
  COMMUNITY_SEARCH = 'COMMUNITY_SEARCH', // hỏi/tìm trên tài liệu cộng đồng (public).
}
