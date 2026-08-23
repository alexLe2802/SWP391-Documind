import { SubscriptionService } from './subscription.service';

describe('SubscriptionService', () => {
  let service: SubscriptionService;

  beforeEach(() => {
    service = new SubscriptionService();
  });

  it('returns free and pro mock plans', () => {
    const plans = service.getPlans();

    expect(plans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'free', name: 'Free' }),
        expect.objectContaining({ id: 'pro', name: 'Pro', isPopular: true }),
      ]),
    );
  });

  it('returns the current mock subscription', () => {
    expect(service.getCurrentSubscription()).toEqual(
      expect.objectContaining({
        planId: 'pro',
        planName: 'Pro',
        status: 'ACTIVE',
        autoRenew: true,
      }),
    );
  });
});
