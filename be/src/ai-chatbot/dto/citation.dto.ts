// ============================================================================
// MF3 — DTO trích dẫn/nguồn (CitationDto)
// ----------------------------------------------------------------------------
// Mô tả MỘT nguồn (citation) mà AI dùng làm căn cứ trả lời. Xuất hiện trong
// mảng `sources` của AiChatResponseDto và trong dữ liệu tin nhắn. Đây là DTO đầu
// ra nên các decorator chỉ phục vụ tài liệu Swagger.
// ============================================================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CitationDto {
  // citationId: id của bản ghi citation đã lưu (nếu có).
  @ApiPropertyOptional({ format: 'uuid' })
  citationId?: string;

  // sourceNumber: số thứ tự hiển thị của trích dẫn trên UI ([1], [2]...), sắp theo độ liên quan.
  @ApiProperty({
    minimum: 1,
    example: 1,
    description: 'Citation number displayed by the UI, ordered by relevance.',
  })
  sourceNumber!: number;

  // documentId: tài liệu nguồn của trích dẫn.
  @ApiProperty({
    format: 'uuid',
    example: '22222222-2222-4222-8222-222222222222',
  })
  documentId!: string;

  // title: tiêu đề tài liệu nguồn (hiển thị trên thẻ citation).
  @ApiProperty({ example: 'Machine Learning Notes' })
  title!: string;

  // chunkId: id của "chunk" (đoạn nhỏ tài liệu) được truy hồi qua vector search.
  //   Có thể null khi nguồn không đến từ tìm kiếm vector.
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Exact retrieved document chunk when the citation came from vector search.',
  })
  chunkId?: string | null;

  // chunkIndex: vị trí ổn định của chunk trong tài liệu, phục vụ điều hướng và chẩn đoán reindex.
  @ApiPropertyOptional({
    minimum: 0,
    nullable: true,
    description:
      'Stable chunk position retained for viewer navigation and reindex diagnostics.',
  })
  chunkIndex?: number | null;

  // snippet: đoạn trích ngắn (đã cắt gọn) hiển thị trên thẻ citation.
  @ApiProperty({
    example: 'Supervised learning uses labeled examples to train a model.',
    description:
      'Short citation snippet from extracted document text, truncated for citation cards.',
  })
  snippet!: string;

  // quote: câu/đoạn nguyên văn (verbatim) trích từ chunk đã index.
  @ApiPropertyOptional({
    description: 'Verbatim evidence from the indexed chunk.',
  })
  quote?: string;

  // passage: đoạn nguồn có giới hạn ĐÚNG như đã đưa cho AI cho trích dẫn này (để kiểm chứng).
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Exact bounded source passage supplied to the AI for this citation.',
  })
  passage?: string | null;

  // relevanceScore: điểm liên quan theo từ khoá (khi có), ngược lại null.
  //   Lưu ý: khai bằng `!` và kiểu `number | null` — luôn có mặt nhưng giá trị có thể là null.
  @ApiPropertyOptional({
    nullable: true,
    example: 0.92,
    description: 'Keyword relevance score when available; otherwise null.',
  })
  relevanceScore!: number | null;

  // sourceLocator: các vị trí trong tài liệu mà trích dẫn này đại diện (vd trang, bảng).
  @ApiPropertyOptional({
    type: [String],
    example: ['PAGE: 4', 'TABLE: Page 4 Table 1'],
    description: 'Document locations represented by this citation.',
  })
  sourceLocator?: string[];
}
