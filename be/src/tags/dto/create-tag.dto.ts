import { IsString, Length } from 'class-validator';

export class CreateTagDto {
  @IsString()
  @Length(1, 50)
  name!: string;
}
