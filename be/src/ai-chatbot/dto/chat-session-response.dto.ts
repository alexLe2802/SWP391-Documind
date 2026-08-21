// ============================================================================
// MF3 — Các DTO phản hồi cho phiên chat & tin nhắn
// ----------------------------------------------------------------------------
// File tập hợp nhiều DTO ĐẦU RA dùng cho các endpoint GET (sessions, session
// detail, messages). Các decorator @ApiProperty/@ApiPropertyOptional chỉ phục vụ
// tài liệu Swagger. `!` = field luôn có giá trị lúc chạy; `?` = có thể vắng.
// ChatMode/MessageSender lấy từ Prisma client (enum sinh từ schema DB).
// ============================================================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChatMode, MessageSender } from '../../generated/prisma/client';
import { CitationDto } from './citation.dto';
import { PaginationMetaDto } from './pagination-meta.dto';

// Thông tin rút gọn của tài liệu gắn với phiên (chỉ id + tiêu đề).
export class ChatSessionDocumentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;
}

// Tin nhắn gần nhất của phiên — dùng để hiển thị preview trong danh sách phiên.
export class ChatSessionLastMessageDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  // sender: ai gửi tin (USER/AI/SYSTEM). enum:MessageSender liệt kê giá trị cho Swagger.
  @ApiProperty({ enum: MessageSender })
  sender!: MessageSender;

  @ApiProperty()
  content!: string;

  // createdAt: thời điểm tạo; format:'date-time' → Swagger hiển thị dạng ISO datetime.
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

// ChatSessionDto: hình dạng 1 phiên chat trong danh sách.
export class ChatSessionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  // mode: chế độ phiên (hỏi 1 tài liệu / cả thư viện...).
  @ApiProperty({ enum: ChatMode })
  mode!: ChatMode;

  // documentId: tài liệu gắn với phiên; `string | null` vì phiên hỏi cả thư viện không có.
  //   Dùng `!` (luôn có mặt trong payload) nhưng giá trị có thể null.
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  documentId!: string | null;

  // title: tiêu đề phiên (có thể null nếu chưa đặt).
  @ApiPropertyOptional({ nullable: true })
  title!: string | null;

  // document: object con mô tả tài liệu (tùy chọn); có thể null/vắng.
  @ApiPropertyOptional({ type: ChatSessionDocumentDto, nullable: true })
  document?: ChatSessionDocumentDto | null;

  // messageCount: tổng số tin nhắn trong phiên.
  @ApiProperty()
  messageCount!: number;

  // lastMessage: tin nhắn gần nhất (có thể null nếu phiên rỗng).
  @ApiPropertyOptional({ type: ChatSessionLastMessageDto, nullable: true })
  lastMessage!: ChatSessionLastMessageDto | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

// Bọc danh sách phiên + metadata phân trang (dùng cho GET /chat/sessions).
export class ChatSessionListResponseDto {
  @ApiProperty({ type: [ChatSessionDto] })
  items!: ChatSessionDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

// ChatSessionDetailDto: chi tiết 1 phiên. `extends ChatSessionDto` = KẾ THỪA toàn
// bộ field của ChatSessionDto rồi bổ sung thêm field riêng cho endpoint chi tiết.
export class ChatSessionDetailDto extends ChatSessionDto {
  // userId: chủ sở hữu phiên.
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  // sourceSummary: tổng hợp các nguồn/trích dẫn từng dùng trong phiên.
  @ApiProperty({ type: [CitationDto] })
  sourceSummary!: CitationDto[];
}

// ChatMessageDto: hình dạng 1 tin nhắn trong phiên (dùng cho GET /chat/messages).
export class ChatMessageDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  sessionId!: string;

  @ApiProperty({ enum: MessageSender })
  sender!: MessageSender;

  @ApiProperty()
  content!: string;

  // status: trạng thái tin nhắn AI (completed/incomplete/fallback), có thể null.
  @ApiPropertyOptional({
    enum: ['completed', 'incomplete', 'fallback'],
    nullable: true,
  })
  status?: string | null;

  // interruptionReason: lý do câu trả lời bị gián đoạn (nếu có).
  @ApiPropertyOptional({ nullable: true })
  interruptionReason?: string | null;

  // sources: các trích dẫn đính kèm tin nhắn AI.
  @ApiProperty({ type: [CitationDto] })
  sources!: CitationDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

// Bọc danh sách tin nhắn + metadata phân trang.
export class ChatMessageListResponseDto {
  @ApiProperty({ type: [ChatMessageDto] })
  items!: ChatMessageDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
