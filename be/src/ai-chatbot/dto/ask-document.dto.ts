// ============================================================================
// MF3 — DTO đầu vào cho POST /chat/ask-document (hỏi 1 tài liệu)
// ----------------------------------------------------------------------------
// Đây là DTO ĐẦU VÀO (request body). Các decorator từ 'class-validator' sẽ được
// ValidationPipe của NestJS chạy TRƯỚC khi vào controller: nếu bất kỳ ràng buộc
// nào sai → tự động trả HTTP 400 và handler không được gọi. Decorator @Transform
// từ 'class-transformer' biến đổi giá trị TRƯỚC khi validate.
// ============================================================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsNotEmpty, // không được rỗng.
  IsOptional, // cho phép vắng field; nếu vắng thì bỏ qua các validator còn lại.
  IsString, // phải là chuỗi.
  IsUUID, // phải là UUID hợp lệ.
  Matches, // phải khớp regex.
  MaxLength, // giới hạn độ dài tối đa.
} from 'class-validator';

export class AskDocumentDto {
  // documentId: id tài liệu cần hỏi. Bắt buộc và phải là UUID.
  //   `!` = định danh này chắc chắn có sau khi validate thành công.
  @ApiProperty({ format: 'uuid' }) // Swagger: hiển thị dạng uuid.
  @IsUUID()
  documentId!: string;

  // question: câu hỏi của người dùng.
  @ApiProperty({ minLength: 1, maxLength: 4000 })
  // @Transform chạy TRƯỚC validate: nếu là chuỗi thì .trim() cắt khoảng trắng đầu/cuối;
  //   không phải chuỗi thì giữ nguyên (để @IsString bắt lỗi). Tránh việc người dùng gửi
  //   toàn dấu cách rồi lọt qua kiểm tra rỗng.
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString() // phải là chuỗi.
  @IsNotEmpty() // không rỗng (sau khi trim).
  @Matches(/\S/) // phải chứa ít nhất 1 ký tự KHÔNG phải khoảng trắng (chặn câu hỏi toàn space).
  @MaxLength(4000) // tối đa 4000 ký tự — chặn prompt quá dài gây tốn token/chi phí và lạm dụng.
  question!: string;

  // sessionId: (tùy chọn) id phiên chat để NỐI TIẾP hội thoại cũ. Vắng → tạo phiên mới.
  //   `?` = optional; @IsOptional cho phép bỏ trống; nếu có thì phải là UUID.
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
