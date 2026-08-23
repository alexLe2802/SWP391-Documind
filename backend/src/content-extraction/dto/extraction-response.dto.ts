import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExtractionStatus } from '../interfaces/extraction-result.interface';

export class ExtractionResponseDto {
  @ApiProperty()
  fileName!: string;

  @ApiProperty()
  fileType!: string;

  @ApiProperty({ enum: ['COMPLETED', 'MOCKED', 'FAILED'] })
  extractionStatus!: ExtractionStatus;

  @ApiProperty()
  extractedText!: string;

  @ApiProperty()
  contentSummary!: string;

  @ApiProperty()
  extractedAt!: string;

  @ApiPropertyOptional()
  errorMessage?: string;
}
