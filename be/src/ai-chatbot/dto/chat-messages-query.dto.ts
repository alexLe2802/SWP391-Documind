// ============================================================================
// MF3 — DTO query phân trang cho GET /chat/messages/:sessionId
// ----------------------------------------------------------------------------
// DTO này ánh xạ query string (?page=&limit=). Vì query string luôn là CHUỖI,
// ta dùng @Type(() => Number) để ép về số trước khi kiểm tra @IsInt/@Min/@Max.
// ============================================================================
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ChatMessagesQueryDto {
  // page: trang cần lấy, tối thiểu 1. `page = 1` là GIÁ TRỊ MẶC ĐỊNH khi client không gửi.
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number) // ép "2" (chuỗi) → 2 (số).
  @IsInt()
  @Min(1)
  page = 1;

  // limit: số tin nhắn mỗi trang, 1..100, mặc định 50. Chặn trên 100 để tránh
  //   truy vấn quá nặng gây chậm và tốn tài nguyên.
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
