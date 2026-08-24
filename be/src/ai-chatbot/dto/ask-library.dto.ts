// ============================================================================
// MF3 — DTO đầu vào cho POST /chat/ask-library (hỏi trên cả thư viện)
// ----------------------------------------------------------------------------
// Gồm 2 class: LibraryFiltersDto (bộ lọc thu hẹp phạm vi tìm nguồn) và AskLibraryDto
// (body chính). Các decorator class-validator được ValidationPipe chạy trước handler.
// ============================================================================
import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  ArrayMaxSize, // giới hạn số phần tử tối đa của mảng.
  ArrayUnique, // các phần tử trong mảng không được trùng.
  IsArray, // phải là mảng.
  IsInt, // phải là số nguyên.
  IsNotEmpty, // không rỗng.
  IsOptional, // cho phép vắng field.
  IsString, // phải là chuỗi.
  IsUUID, // phải là UUID.
  Matches, // khớp regex.
  Max, // giá trị số tối đa.
  MaxLength, // độ dài chuỗi tối đa.
  Min, // giá trị số tối thiểu.
  ValidateNested, // validate cả object con (DTO lồng nhau).
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// LibraryFiltersDto: bộ lọc tùy chọn để giới hạn tài liệu được đưa vào tìm kiếm.
// Tất cả field đều optional; càng nhiều lọc, phạm vi retrieve càng hẹp.
export class LibraryFiltersDto {
  // subjectId: lọc theo 1 môn học.
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  // subjectIds: lọc theo NHIỀU môn học cùng lúc.
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayUnique() // không cho trùng id.
  @ArrayMaxSize(50) // tối đa 50 id — chặn danh sách lọc quá lớn.
  @IsUUID('4', { each: true }) // `each:true` → áp @IsUUID cho TỪNG phần tử; '4' = UUID v4.
  subjectIds?: string[];

  // categoryId: lọc theo danh mục.
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  // fileType: lọc theo loại file (MIME hoặc dạng viết tắt như pdf/docx/pptx/audio/video).
  @ApiPropertyOptional({
    example: 'pdf',
    description:
      'Document file type filter. Accepts a MIME type such as application/pdf or a supported shorthand such as pdf, docx, pptx, audio, or video.',
  })
  // Chuẩn hoá trước khi validate: trim + đưa về chữ thường để so khớp nhất quán.
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsString()
  fileType?: string;

  // documentIds: giới hạn tìm kiếm trong đúng các tài liệu chỉ định.
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true }) // undefined = chấp mọi phiên bản UUID; áp cho từng phần tử.
  documentIds?: string[];
}

export class AskLibraryDto {
  // question: câu hỏi — ràng buộc giống ask-document (xem giải thích ở ask-document.dto.ts).
  @ApiProperty({ minLength: 1, maxLength: 4000 })
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/) // phải có ký tự thực, không toàn khoảng trắng.
  @MaxLength(4000) // tối đa 4000 ký tự.
  question!: string;

  // limit: số tài liệu liên quan tối đa dùng để trả lời. Khoảng hợp lệ 1..10, mặc định 5.
  //   Giới hạn để cân bằng chất lượng ngữ cảnh vs chi phí token/độ trễ.
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 10,
    default: 5,
    example: 5,
    description: 'Maximum number of relevant library documents to use.',
  })
  @IsOptional()
  // @Type(() => Number): query/body có thể là chuỗi "5"; class-transformer ép về number
  //   trước khi @IsInt/@Min/@Max kiểm tra.
  @Type(() => Number)
  @IsInt() // số nguyên.
  @Min(1) // ít nhất 1.
  @Max(10) // nhiều nhất 10.
  limit?: number;

  // filters: object con LibraryFiltersDto (tùy chọn).
  @ApiPropertyOptional({ type: LibraryFiltersDto })
  @IsOptional()
  @ValidateNested() // yêu cầu validate sâu vào bên trong object con...
  @Type(() => LibraryFiltersDto) // ...và @Type để class-transformer biết dựng đúng class con.
  filters?: LibraryFiltersDto;

  // sessionId: (tùy chọn) nối tiếp phiên chat cũ; vắng → tạo phiên mới.
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
