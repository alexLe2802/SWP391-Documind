import { ApiProperty } from '@nestjs/swagger';

export class SubscriptionPlanResponseDto {
  @ApiProperty({ example: 'free' })
  id!: string;

  @ApiProperty({ example: 'Free' })
  name!: string;

  @ApiProperty({ example: 0 })
  price!: number;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ example: 'monthly' })
  billingCycle!: string;

  @ApiProperty({
    type: [String],
    example: ['Basic document library', 'Community document access'],
  })
  features!: string[];

  @ApiProperty({ example: false })
  isPopular!: boolean;
}
