import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HideDocumentDto {
  @ApiProperty({ description: 'true to hide, false to unhide.' })
  @IsBoolean()
  hidden!: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RejectDocumentDto {
  @ApiProperty({ description: 'Reason must be recorded and visible to document owner.' })
  @IsString()
  reason!: string;
}
