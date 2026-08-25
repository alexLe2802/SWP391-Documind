/**
 * Compatibility DTO for the member-owned path. Its fields mirror the query
 * contract embedded in the current production AdminDocumentsController.
 */
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  DocumentStatus,
  DocumentVisibility,
  ExtractionStatus,
  ModerationFlag,
  ModerationStatus,
} from '../../../generated/prisma/client';

export class AdminDocumentsQueryDto {
  @ApiPropertyOptional({ description: 'Search by title, description, fileName, owner or subject.' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ enum: DocumentVisibility })
  @IsOptional()
  @IsEnum(DocumentVisibility)
  visibility?: DocumentVisibility;

  @ApiPropertyOptional({ enum: DocumentStatus })
  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @ApiPropertyOptional({ enum: ExtractionStatus })
  @IsOptional()
  @IsEnum(ExtractionStatus)
  aiStatus?: ExtractionStatus;

  @ApiPropertyOptional({ enum: ModerationStatus })
  @IsOptional()
  @IsEnum(ModerationStatus)
  moderationStatus?: ModerationStatus;

  @ApiPropertyOptional({ enum: ModerationFlag })
  @IsOptional()
  @IsEnum(ModerationFlag)
  moderationFlag?: ModerationFlag;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
