import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateSubjectDto {
  @IsString()
  @Length(2, 30)
  code!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
