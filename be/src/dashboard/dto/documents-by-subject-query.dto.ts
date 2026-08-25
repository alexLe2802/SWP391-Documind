import { IsDateString, IsOptional } from 'class-validator';

export class DocumentsBySubjectQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
