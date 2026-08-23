import { ApiProperty } from '@nestjs/swagger';

export class CurrentSubscriptionResponseDto {
  @ApiProperty({ example: 'pro' })
  planId!: string;

  @ApiProperty({ example: 'Pro' })
  planName!: string;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ format: 'date-time' })
  startedAt!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ example: true })
  autoRenew!: boolean;
}
