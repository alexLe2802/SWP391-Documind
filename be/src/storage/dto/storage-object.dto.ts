import { IsString, Matches } from 'class-validator';

export class StorageObjectDto {
  @IsString()
  @Matches(/^users\/[^/]+\/.+/)
  key!: string;
}
