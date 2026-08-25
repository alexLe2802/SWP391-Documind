import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePaymentDto {
  @ApiProperty({
    description: 'ID of the subscription plan to purchase (e.g. pro)',
    example: 'pro',
  })
  @IsString()
  @IsNotEmpty()
  planId!: string;
}
