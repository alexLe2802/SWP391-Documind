import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { DocumentVisibility } from '../../generated/prisma/client';

// Chuyển đổi hoặc chuẩn hóa thẻ ids.
function parseTagIds(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        return Array.isArray(parsed) ? parseTagIds(parsed) : undefined;
      } catch {
        return undefined;
      }
    }

    return trimmed
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return undefined;
}

// Chuyển đổi hoặc chuẩn hóa thẻ.
function parseTags(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string') return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return undefined;
}

export class CreateDocumentDto {
  @IsUUID()
  subjectId!: string;

  @IsUUID()
  categoryId!: string;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(DocumentVisibility)
  visibility?: DocumentVisibility;

  @IsOptional()
  @Transform(({ value }) => parseTagIds(value))
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  tagIds?: string[];

  @IsOptional()
  @Transform(({ value }) => parseTags(value))
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];
}
