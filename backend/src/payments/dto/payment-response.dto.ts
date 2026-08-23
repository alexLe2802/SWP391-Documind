import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PaymentMethod,
  PaymentStatus,
  SubscriptionPlan,
} from '../../generated/prisma/client';

export class SubscriptionPlanDto {
  @ApiProperty({ enum: SubscriptionPlan })
  code!: SubscriptionPlan;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  amount!: number;

  @ApiProperty({ example: 'VND' })
  currency!: string;

  @ApiProperty()
  billingPeriod!: string;

  @ApiProperty()
  durationDays!: number;

  @ApiProperty()
  storageMb!: number;

  @ApiProperty()
  uploadCredits!: number;

  @ApiProperty()
  aiCredits!: number;

  @ApiProperty()
  unlimitedAiDays!: number;
}

export class CheckoutResponseDto {
  @ApiProperty()
  invoiceNumber!: string;

  @ApiProperty()
  checkoutUrl!: string;

  @ApiProperty()
  expiresAt!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { oneOf: [{ type: 'string' }, { type: 'number' }] },
  })
  fields!: Record<string, string | number>;
}

export class PaymentOrderDto {
  @ApiProperty()
  invoiceNumber!: string;

  @ApiProperty({ enum: SubscriptionPlan })
  plan!: SubscriptionPlan;

  @ApiProperty({ enum: PaymentMethod })
  paymentMethod!: PaymentMethod;

  @ApiProperty()
  amount!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ enum: PaymentStatus })
  status!: PaymentStatus;

  @ApiPropertyOptional({ nullable: true })
  paidAt!: string | null;

  @ApiProperty()
  expiresAt!: string;

  @ApiProperty()
  createdAt!: string;
}

export class CurrentSubscriptionDto {
  @ApiProperty({ enum: SubscriptionPlan })
  plan!: SubscriptionPlan;

  @ApiProperty()
  startsAt!: string;

  @ApiPropertyOptional({ nullable: true })
  expiresAt!: string | null;

  @ApiProperty()
  storageLimitMb!: number;

  @ApiProperty()
  uploadLimit!: number;

  @ApiPropertyOptional({ nullable: true })
  aiChatLimit!: number | null;

  @ApiProperty()
  aiChatsUsed!: number;

  @ApiPropertyOptional({ nullable: true })
  aiChatsRemaining!: number | null;

  @ApiProperty()
  uploadsUsed!: number;

  @ApiProperty()
  uploadsRemaining!: number;

  @ApiProperty()
  storageUsedMb!: number;

  @ApiProperty()
  storageRemainingMb!: number;
}
