import { IsDateString, IsOptional } from 'class-validator';

export class DocumentsByCategoryQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
