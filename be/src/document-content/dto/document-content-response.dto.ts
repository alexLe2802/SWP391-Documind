import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ExtractionQuality,
  ExtractionStatus,
} from '../../generated/prisma/client';

export class DocumentContentResponseDto {
  @ApiProperty({ format: 'uuid' })
  documentId!: string;

  @ApiPropertyOptional()
  extractedText?: string;

  @ApiPropertyOptional({ nullable: true })
  contentSummary!: string | null;

  @ApiProperty({ enum: ExtractionStatus })
  extractionStatus!: ExtractionStatus;

  @ApiProperty({ enum: ExtractionQuality })
  qualityStatus!: ExtractionQuality;

  @ApiPropertyOptional({ type: [String], nullable: true })
  qualityDetails!: string[] | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  extractedAt!: Date | null;
}
