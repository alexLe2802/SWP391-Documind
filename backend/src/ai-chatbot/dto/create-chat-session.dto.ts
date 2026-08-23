import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ChatMode } from '../enums/chat-mode.enum';

// Kiểm tra dữ liệu tạo phiên chat mới và ngữ cảnh tùy chọn.
export class CreateChatSessionDto {
  // Xác định phạm vi hỏi trên một tài liệu hoặc toàn bộ thư viện.
  @ApiProperty({ enum: ChatMode })
  @IsEnum(ChatMode)
  mode!: ChatMode;

  // Chỉ định tài liệu bắt buộc khi hỏi trên một tài liệu cụ thể.
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  documentId?: string;
}
