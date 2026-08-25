import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChatMode, MessageSender } from '../../generated/prisma/client';
import { CitationDto } from './citation.dto';
import { PaginationMetaDto } from './pagination-meta.dto';

export class ChatSessionDocumentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;
}

export class ChatSessionLastMessageDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: MessageSender })
  sender!: MessageSender;

  @ApiProperty()
  content!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class ChatSessionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ChatMode })
  mode!: ChatMode;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  documentId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  title!: string | null;

  @ApiPropertyOptional({ type: ChatSessionDocumentDto, nullable: true })
  document?: ChatSessionDocumentDto | null;

  @ApiProperty()
  messageCount!: number;

  @ApiPropertyOptional({ type: ChatSessionLastMessageDto, nullable: true })
  lastMessage!: ChatSessionLastMessageDto | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class ChatSessionListResponseDto {
  @ApiProperty({ type: [ChatSessionDto] })
  items!: ChatSessionDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class ChatSessionDetailDto extends ChatSessionDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ type: [CitationDto] })
  sourceSummary!: CitationDto[];
}

export class ChatMessageDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  sessionId!: string;

  @ApiProperty({ enum: MessageSender })
  sender!: MessageSender;

  @ApiProperty()
  content!: string;

  @ApiPropertyOptional({
    enum: ['completed', 'incomplete', 'fallback'],
    nullable: true,
  })
  status?: string | null;

  @ApiPropertyOptional({ nullable: true })
  interruptionReason?: string | null;

  @ApiProperty({ type: [CitationDto] })
  sources!: CitationDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class ChatMessageListResponseDto {
  @ApiProperty({ type: [ChatMessageDto] })
  items!: ChatMessageDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
