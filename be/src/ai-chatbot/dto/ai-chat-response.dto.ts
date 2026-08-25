import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CitationDto } from './citation.dto';

export type AiAnswerStatus =
  | 'ANSWERED'
  | 'FALLBACK_WITH_SOURCES'
  | 'NO_SOURCES';

export class AiChatResponseDto {
  @ApiProperty({
    example:
      'Supervised learning trains a model with labeled examples and checks predictions against known answers.',
  })
  answer!: string;

  @ApiProperty({
    format: 'uuid',
    example: '33333333-3333-4333-8333-333333333333',
  })
  sessionId!: string;

  @ApiProperty({
    format: 'uuid',
    example: '55555555-5555-4555-8555-555555555555',
  })
  messageId!: string;

  @ApiProperty({
    type: [String],
    example: [
      'Summarize this document',
      'Explain the main ideas',
      'Create review questions',
    ],
  })
  suggestedPrompts!: string[];

  @ApiProperty({ type: [CitationDto] })
  sources!: CitationDto[];

  @ApiProperty({
    enum: ['ANSWERED', 'FALLBACK_WITH_SOURCES', 'NO_SOURCES'],
    example: 'ANSWERED',
  })
  answerStatus!: AiAnswerStatus;

  @ApiPropertyOptional({
    example: 'GEMINI_MISSING_API_KEY',
    nullable: true,
  })
  errorCode?: string | null;

  @ApiPropertyOptional({
    description:
      'True when the model stopped because the output limit was reached.',
    example: true,
  })
  hasMore?: boolean;

  @ApiPropertyOptional({
    description: 'Model completion reason when the answer is incomplete.',
    example: 'MAX_TOKENS',
    nullable: true,
  })
  finishReason?: string | null;
}
