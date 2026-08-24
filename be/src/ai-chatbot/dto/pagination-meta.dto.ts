// ============================================================================
// MF3 — Re-export PaginationMetaDto
// ----------------------------------------------------------------------------
// File này KHÔNG định nghĩa DTO mới; nó chỉ "xuất lại" (re-export) PaginationMetaDto
// dùng chung của toàn dự án (nằm ở common/api-contract). Mục đích: các DTO trong
// module ai-chatbot chỉ cần import từ đường dẫn nội bộ './pagination-meta.dto' cho
// gọn và nhất quán, thay vì trỏ sâu vào thư mục common. Cú pháp
// `export { X } from '...'` = lấy X từ module kia rồi export tiếp ra ngoài.
// PaginationMetaDto mô tả metadata phân trang (vd page, limit, total, totalPages).
// ============================================================================
export { PaginationMetaDto } from '../../common/api-contract/dto/pagination-meta.dto';
