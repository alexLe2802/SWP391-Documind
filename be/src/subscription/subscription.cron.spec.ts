/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionCron } from './subscription.cron';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionStatus } from '../generated/prisma/client';

describe('SubscriptionCron', () => {
  let cron: SubscriptionCron;
  let prisma: PrismaService;

  const mockPrismaService = {
    userSubscription: {
      updateMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionCron,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    cron = module.get<SubscriptionCron>(SubscriptionCron);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(cron).toBeDefined();
  });

  describe('checkExpiredSubscriptions', () => {
    it('updates all active subscriptions that are past their expiration date to EXPIRED', async () => {
      const mockResult = { count: 3 };
      jest
        .spyOn(prisma.userSubscription, 'updateMany')
        .mockResolvedValue(mockResult);

      await cron.checkExpiredSubscriptions();

      expect(prisma.userSubscription.updateMany).toHaveBeenCalledWith({
        where: {
          status: SubscriptionStatus.ACTIVE,
          expiresAt: {
            lt: expect.any(Date),
          },
        },
        data: {
          status: SubscriptionStatus.EXPIRED,
        },
      });
    });

    it('logs error and does not throw when database operation fails', async () => {
      const dbError = new Error('Database connection failed');
      jest
        .spyOn(prisma.userSubscription, 'updateMany')
        .mockRejectedValue(dbError);

      // Verify that it does not throw
      await expect(cron.checkExpiredSubscriptions()).resolves.not.toThrow();

      expect(prisma.userSubscription.updateMany).toHaveBeenCalled();
    });
  });
});
