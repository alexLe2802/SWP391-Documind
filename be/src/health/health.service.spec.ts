import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const prisma = { $queryRawUnsafe: jest.fn() };
  const queue = {
    getSnapshot: jest.fn().mockReturnValue({
      pending: 1,
      running: 1,
      concurrency: 2,
    }),
  };

  beforeEach(() => jest.clearAllMocks());

  it('reports readiness with database and extraction queue details', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ ok: 1 }]);
    const service = new HealthService(prisma as never, queue as never);

    await expect(service.readiness()).resolves.toMatchObject({
      status: 'ok',
      checks: {
        database: 'up',
        extractionQueue: { pending: 1, running: 1, concurrency: 2 },
      },
    });
  });

  it('fails readiness without exposing the database error', async () => {
    prisma.$queryRawUnsafe.mockRejectedValue(new Error('secret connection'));
    const service = new HealthService(prisma as never, queue as never);

    await expect(service.readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
