import { ApiProperty } from '@nestjs/swagger';

export class PaymentHistoryItemResponseDto {
  @ApiProperty({ example: 'pay_mock_001' })
  id!: string;

  @ApiProperty({ example: 'Pro' })
  planName!: string;

  @ApiProperty({ example: 9.99 })
  amount!: number;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ example: 'PAID' })
  status!: string;

  @ApiProperty({ format: 'date-time' })
  paidAt!: string;

  @ApiProperty({ example: 'Mock Visa ending 4242' })
  method!: string;
}
