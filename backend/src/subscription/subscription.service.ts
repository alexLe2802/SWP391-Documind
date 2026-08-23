import { Injectable } from '@nestjs/common';
import { CurrentSubscriptionResponseDto } from './dto/current-subscription-response.dto';
import { SubscriptionPlanResponseDto } from './dto/subscription-plan-response.dto';

@Injectable()
export class SubscriptionService {
  private readonly plans: SubscriptionPlanResponseDto[] = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      currency: 'USD',
      billingCycle: 'monthly',
      features: [
        'Basic document library',
        'Community document access',
        'Limited AI study assistant usage',
      ],
      isPopular: false,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: 9.99,
      currency: 'USD',
      billingCycle: 'monthly',
      features: [
        'Unlimited document library',
        'Document-grounded AI chat',
        'Priority content extraction',
        'Advanced dashboard statistics',
      ],
      isPopular: true,
    },
  ];

  private readonly currentSubscription: CurrentSubscriptionResponseDto = {
    planId: 'pro',
    planName: 'Pro',
    status: 'ACTIVE',
    startedAt: '2026-06-01T00:00:00.000Z',
    expiresAt: '2026-07-01T00:00:00.000Z',
    autoRenew: true,
  };

  // Lấy dữ liệu gói dịch vụ.
  getPlans(): SubscriptionPlanResponseDto[] {
    return this.plans;
  }

  // Lấy dữ liệu hiện tại quyền lợi.
  getCurrentSubscription(): CurrentSubscriptionResponseDto {
    return this.currentSubscription;
  }
}
