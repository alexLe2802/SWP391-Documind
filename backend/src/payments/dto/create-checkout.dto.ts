import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsIn } from 'class-validator';
import { PaymentMethod, SubscriptionPlan } from '../../generated/prisma/client';

export class CreateCheckoutDto {
  @ApiProperty({
    enum: [SubscriptionPlan.STUDENT, SubscriptionPlan.PRO],
  })
  @IsIn([SubscriptionPlan.STUDENT, SubscriptionPlan.PRO])
  plan!: SubscriptionPlan;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;
}
