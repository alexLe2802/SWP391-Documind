// ============================================================================
// MF3 — DTO phản hồi hỏi–đáp AI (AiChatResponseDto)
// ----------------------------------------------------------------------------
// DTO (Data Transfer Object) = hình dạng dữ liệu trao đổi qua API. Đây là DTO
// ĐẦU RA (response) chuẩn cho các endpoint /chat/ask-*. Các decorator @ApiProperty
// / @ApiPropertyOptional chỉ phục vụ tài liệu Swagger (mô tả kiểu, ví dụ hiển thị),
// KHÔNG validate dữ liệu đi ra.
//
// Quy ước ký hiệu trên field:
//   - `!` (definite assignment) : hứa với TypeScript rằng field CHẮC CHẮN có giá trị
//     lúc chạy (service luôn gán) dù không khởi tạo tại chỗ → tắt cảnh báo "chưa gán".
//   - `?` (optional)            : field có thể vắng mặt (undefined).
// ============================================================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CitationDto } from './citation.dto';

// Union type mô tả 3 trạng thái trả lời có thể xảy ra (mô phỏng enum bằng string literal):
//   - ANSWERED              : trả lời được dựa trên nguồn.
//   - FALLBACK_WITH_SOURCES : không trả lời chắc chắn nhưng vẫn có nguồn liên quan.
//   - NO_SOURCES            : không tìm thấy nguồn phù hợp.
export type AiAnswerStatus =
  | 'ANSWERED'
  | 'FALLBACK_WITH_SOURCES'
  | 'NO_SOURCES';

export class AiChatResponseDto {
  // answer: nội dung câu trả lời AI sinh ra. `!` = luôn được service gán.
  @ApiProperty({
    example:
      'Supervised learning trains a model with labeled examples and checks predictions against known answers.',
  })
  answer!: string;

  // sessionId: id phiên chat (mới tạo hoặc phiên được nối tiếp). format:'uuid' để Swagger hiển thị.
  @ApiProperty({
    format: 'uuid',
    example: '33333333-3333-4333-8333-333333333333',
  })
  sessionId!: string;

  // messageId: id của tin nhắn AI vừa được lưu, để client tham chiếu/định vị.
  @ApiProperty({
    format: 'uuid',
    example: '55555555-5555-4555-8555-555555555555',
  })
  messageId!: string;

  // suggestedPrompts: các câu hỏi gợi ý tiếp theo cho người dùng.
  //   `type: [String]` báo Swagger đây là mảng chuỗi; TS khai kiểu `string[]`.
  @ApiProperty({
    type: [String],
    example: [
      'Summarize this document',
      'Explain the main ideas',
      'Create review questions',
    ],
  })
  suggestedPrompts!: string[];

  // sources: danh sách trích dẫn/nguồn (citation) làm căn cứ cho câu trả lời.
  //   `type: [CitationDto]` → mảng các CitationDto (Swagger dựng schema lồng nhau).
  @ApiProperty({ type: [CitationDto] })
  sources!: CitationDto[];

  // answerStatus: trạng thái trả lời (1 trong 3 giá trị AiAnswerStatus). `enum:[...]`
  //   liệt kê giá trị hợp lệ cho Swagger.
  @ApiProperty({
    enum: ['ANSWERED', 'FALLBACK_WITH_SOURCES', 'NO_SOURCES'],
    example: 'ANSWERED',
  })
  answerStatus!: AiAnswerStatus;

  // errorCode: mã lỗi (nếu có), vd thiếu API key của Gemini.
  //   `?` = tùy chọn; `string | null` = có thể là chuỗi hoặc null; @ApiPropertyOptional
  //   + nullable:true báo Swagger field này có thể vắng hoặc null.
  @ApiPropertyOptional({
    example: 'GEMINI_MISSING_API_KEY',
    nullable: true,
  })
  errorCode?: string | null;

  // hasMore: true khi mô hình dừng vì chạm giới hạn độ dài đầu ra (câu trả lời còn tiếp).
  //   UI dùng cờ này để hiện nút "tiếp tục".
  @ApiPropertyOptional({
    description:
      'True when the model stopped because the output limit was reached.',
    example: true,
  })
  hasMore?: boolean;

  // finishReason: lý do mô hình kết thúc khi câu trả lời chưa trọn vẹn (vd MAX_TOKENS).
  @ApiPropertyOptional({
    description: 'Model completion reason when the answer is incomplete.',
    example: 'MAX_TOKENS',
    nullable: true,
  })
  finishReason?: string | null;
}
