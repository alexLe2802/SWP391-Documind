import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { DocumentVisibility } from '../../generated/prisma/client';

export class UpdateDocumentVisibilityDto {
  @ApiProperty({ enum: DocumentVisibility })
  @IsEnum(DocumentVisibility)
  visibility!: DocumentVisibility;
}
