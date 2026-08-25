import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdatePaymentStatusDto {
  @ApiProperty({ enum: ['FAILED', 'CANCELLED'] })
  @IsIn(['FAILED', 'CANCELLED'])
  status!: 'FAILED' | 'CANCELLED';
}
