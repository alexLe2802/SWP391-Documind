import { IsString, Length, Matches } from 'class-validator';

export class CreateUploadUrlDto {
  @IsString()
  @Length(1, 255)
  fileName!: string;

  @IsString()
  @Matches(/^[\w.+-]+\/[\w.+-]+$/)
  contentType!: string;
}
