import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CitationDto {
  @ApiPropertyOptional({ format: 'uuid' })
  citationId?: string;

  @ApiProperty({
    minimum: 1,
    example: 1,
    description: 'Citation number displayed by the UI, ordered by relevance.',
  })
  sourceNumber!: number;

  @ApiProperty({
    format: 'uuid',
    example: '22222222-2222-4222-8222-222222222222',
  })
  documentId!: string;

  @ApiProperty({ example: 'Machine Learning Notes' })
  title!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Exact retrieved document chunk when the citation came from vector search.',
  })
  chunkId?: string | null;

  @ApiPropertyOptional({
    minimum: 0,
    nullable: true,
    description:
      'Stable chunk position retained for viewer navigation and reindex diagnostics.',
  })
  chunkIndex?: number | null;

  @ApiProperty({
    example: 'Supervised learning uses labeled examples to train a model.',
    description:
      'Short citation snippet from extracted document text, truncated for citation cards.',
  })
  snippet!: string;

  @ApiPropertyOptional({
    description: 'Verbatim evidence from the indexed chunk.',
  })
  quote?: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Exact bounded source passage supplied to the AI for this citation.',
  })
  passage?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 0.92,
    description: 'Keyword relevance score when available; otherwise null.',
  })
  relevanceScore!: number | null;

  @ApiPropertyOptional({
    type: [String],
    example: ['PAGE: 4', 'TABLE: Page 4 Table 1'],
    description: 'Document locations represented by this citation.',
  })
  sourceLocator?: string[];
}
