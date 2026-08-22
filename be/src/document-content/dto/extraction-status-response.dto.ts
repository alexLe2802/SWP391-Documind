import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ExtractionQuality,
  ExtractionStatus,
} from '../../generated/prisma/client';

export class ExtractionStatusResponseDto {
  @ApiProperty({ format: 'uuid' })
  documentId!: string;

  @ApiProperty({ format: 'uuid' })
  jobId!: string;

  @ApiProperty({ enum: ExtractionStatus })
  extractionStatus!: ExtractionStatus;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  progress?: number;

  @ApiPropertyOptional({ nullable: true })
  errorCode?: string | null;

  @ApiPropertyOptional({ nullable: true })
  errorMessage?: string | null;

  @ApiProperty({ enum: ExtractionQuality })
  qualityStatus!: ExtractionQuality;

  @ApiPropertyOptional({ type: [String], nullable: true })
  qualityDetails!: string[] | null;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}
