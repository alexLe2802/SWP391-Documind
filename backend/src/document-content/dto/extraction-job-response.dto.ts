import { ApiProperty } from '@nestjs/swagger';
import { ExtractionStatus } from '../../generated/prisma/client';

export class ExtractionJobResponseDto {
  @ApiProperty({ format: 'uuid' })
  jobId!: string;

  @ApiProperty({ format: 'uuid' })
  documentId!: string;

  @ApiProperty({ enum: ExtractionStatus })
  extractionStatus!: ExtractionStatus;
}
