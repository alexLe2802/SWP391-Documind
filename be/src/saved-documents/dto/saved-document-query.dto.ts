import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { ExtractionStatus } from '../../generated/prisma/client';

// Chuyển đổi hoặc chuẩn hóa ids.
function parseIds(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return undefined;
}

export class SavedDocumentQueryDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    oneOf: [
      { type: 'array', items: { type: 'string', format: 'uuid' } },
      { type: 'string', example: 'uuid-1,uuid-2' },
    ],
  })
  @IsOptional()
  @Transform(({ value }) => parseIds(value))
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  tagIds?: string[];

  @ApiPropertyOptional({ enum: ['PDF', 'DOCX', 'PPTX', 'XLSX'] })
  @IsOptional()
  @IsIn(['PDF', 'DOCX', 'PPTX', 'XLSX'])
  fileType?: 'PDF' | 'DOCX' | 'PPTX' | 'XLSX';

  @ApiPropertyOptional({ enum: ExtractionStatus })
  @IsOptional()
  @IsEnum(ExtractionStatus)
  aiStatus?: ExtractionStatus;

  @ApiPropertyOptional({ enum: ['savedAt', 'createdAt', 'title', 'fileSize'] })
  @IsOptional()
  @IsIn(['savedAt', 'createdAt', 'title', 'fileSize'])
  sortBy?: 'savedAt' | 'createdAt' | 'title' | 'fileSize' = 'savedAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
