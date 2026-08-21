import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export enum CommunityDocumentFileType {
  PDF = 'pdf',
  DOC = 'doc',
  DOCX = 'docx',
  XLS = 'xls',
  XLSX = 'xlsx',
  PPT = 'ppt',
  PPTX = 'pptx',
}

export enum CommunityDocumentSortBy {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  TITLE = 'title',
  DOWNLOAD_COUNT = 'downloadCount',
  SAVE_COUNT = 'saveCount',
  VIEW_COUNT = 'viewCount',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

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

export class CommunityDocumentQueryDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  q?: string;

  @ApiPropertyOptional({ enum: CommunityDocumentFileType })
  @IsOptional()
  @IsEnum(CommunityDocumentFileType)
  fileType?: CommunityDocumentFileType;

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

  @ApiPropertyOptional({
    enum: CommunityDocumentSortBy,
    default: CommunityDocumentSortBy.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(CommunityDocumentSortBy)
  sortBy?: CommunityDocumentSortBy = CommunityDocumentSortBy.CREATED_AT;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

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
