// ============================================================================
// MF3 — DTO query cho GET /chat/sessions (liệt kê phiên chat, có lọc + phân trang)
// ============================================================================
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
// ChatMode ở đây import từ Prisma client (enum sinh tự động từ schema DB) — dùng
// làm nguồn chân lý cho các giá trị mode hợp lệ khi lọc.
import { ChatMode } from '../../generated/prisma/client';

export class ChatSessionsQueryDto {
  // mode: lọc theo chế độ phiên (vd ASK_THIS_DOCUMENT / ASK_MY_LIBRARY...).
  //   @IsEnum(ChatMode) chỉ chấp nhận giá trị thuộc enum ChatMode.
  @ApiPropertyOptional({ enum: ChatMode })
  @IsOptional()
  @IsEnum(ChatMode)
  mode?: ChatMode;

  // documentId: lọc các phiên gắn với 1 tài liệu cụ thể.
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  documentId?: string;

  // page: trang, tối thiểu 1, mặc định 1.
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  // limit: số phiên mỗi trang, 1..100, mặc định 20 (chặn trên tránh truy vấn nặng).
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
