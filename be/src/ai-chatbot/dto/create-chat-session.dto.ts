// ============================================================================
// MF3 — DTO đầu vào tạo phiên chat mới (CreateChatSessionDto)
// ----------------------------------------------------------------------------
// DTO đầu vào cho việc mở một phiên chat: khai báo phạm vi hỏi (mode) và tài
// liệu ngữ cảnh tùy chọn. Các decorator class-validator được ValidationPipe kiểm
// tra trước handler; sai → HTTP 400. Ở đây ChatMode import từ enum nội bộ của module.
// ============================================================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ChatMode } from '../enums/chat-mode.enum';

export class CreateChatSessionDto {
  // mode: BẮT BUỘC. Xác định phạm vi hỏi (1 tài liệu / cả thư viện / cộng đồng).
  //   @IsEnum(ChatMode) chỉ chấp nhận giá trị thuộc enum ChatMode; `!` = luôn có mặt.
  @ApiProperty({ enum: ChatMode })
  @IsEnum(ChatMode)
  mode!: ChatMode;

  // documentId: tài liệu ngữ cảnh — tùy chọn ở đây (`?`), nhưng nghiệp vụ yêu cầu
  //   phải có khi mode là hỏi trên một tài liệu cụ thể (kiểm tra ở tầng service).
  //   @IsOptional cho phép vắng; nếu có thì @IsString bắt buộc là chuỗi.
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  documentId?: string;
}
