import { ApiProperty } from '@nestjs/swagger';

export class ChatbotAvgResponseTimeDto {
  @ApiProperty({
    example: 45,
    description: 'Average embedding preparation duration in ms',
  })
  avgEmbeddingMs!: number;

  @ApiProperty({
    example: 120,
    description: 'Average document search duration in ms',
  })
  avgSearchMs!: number;

  @ApiProperty({
    example: 1100,
    description: 'Average Gemini API call duration in ms',
  })
  avgGeminiMs!: number;

  @ApiProperty({ example: 35, description: 'Average DB saving duration in ms' })
  avgSaveDbMs!: number;

  @ApiProperty({
    example: 1300,
    description: 'Average total response time in ms',
  })
  avgTotalMs!: number;
}

export class TopCitedDocumentDto {
  @ApiProperty({ example: '22222222-2222-4222-8222-222222222222' })
  documentId!: string;

  @ApiProperty({ example: 'Giáo trình Kiến trúc Phần mềm' })
  title!: string;

  @ApiProperty({ example: 42 })
  citeCount!: number;
}

export class ChatbotStatsResponseDto {
  @ApiProperty({
    example: 150,
    description: 'Total chatbot questions processed',
  })
  totalQuestions!: number;

  @ApiProperty({ type: ChatbotAvgResponseTimeDto })
  avgResponseTime!: ChatbotAvgResponseTimeDto;

  @ApiProperty({ example: 12, description: 'Number of no-source occurrences' })
  noSourceCount!: number;

  @ApiProperty({
    example: 18,
    description: 'Number of fallback keyword search occurrences',
  })
  fallbackKeywordCount!: number;

  @ApiProperty({ type: [TopCitedDocumentDto] })
  topCitedDocuments!: TopCitedDocumentDto[];

  @ApiProperty({ example: 'Chatbot statistics retrieved successfully' })
  message!: string;
}
