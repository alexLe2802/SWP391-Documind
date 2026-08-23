import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class FirebaseLoginDto {
  @ApiProperty({
    description: 'Firebase ID token returned by the frontend Firebase SDK.',
  })
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}
