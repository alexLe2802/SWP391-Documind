import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DocumentStatus,
  DocumentVisibility,
  ExtractionStatus,
} from '../../generated/prisma/client';

export class DocumentLookupDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  code?: string;
}

export class DocumentTagDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class DocumentOwnerDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  email!: string;
}

export class DocumentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty()
  fileName!: string;

  @ApiProperty({ example: 'pdf' })
  fileType!: string;

  @ApiProperty({ type: Number, example: 1048576 })
  fileSize!: number;

  @ApiProperty({ type: DocumentLookupDto })
  subject!: DocumentLookupDto;

  @ApiProperty({ type: DocumentLookupDto })
  category!: DocumentLookupDto;

  @ApiProperty({ type: [DocumentTagDto] })
  tags!: DocumentTagDto[];

  @ApiProperty({ enum: ExtractionStatus })
  aiStatus!: ExtractionStatus;

  @ApiPropertyOptional({ nullable: true })
  summary!: string | null;

  @ApiProperty({ enum: DocumentVisibility })
  visibility!: DocumentVisibility;

  @ApiProperty({ enum: DocumentStatus })
  status!: DocumentStatus;

  @ApiProperty()
  saved!: boolean;

  @ApiProperty()
  owned!: boolean;

  @ApiProperty({ type: DocumentOwnerDto })
  owner!: DocumentOwnerDto;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
