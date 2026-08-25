import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';

describe('AuditLogService', () => {
  const mockPrisma = {
    auditLog: { findMany: jest.fn(), count: jest.fn() },
  };
  const service = new AuditLogService(mockPrisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('filters by action', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);
    await service.findAll({ action: 'admin.user_status_updated', page: 1, limit: 20 });
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ action: 'admin.user_status_updated' }) }));
  });

  it('returns correct pagination meta', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(45);
    const result = await service.findAll({ page: 2, limit: 20 });
    expect(result.meta.totalPages).toBe(3);
    expect(result.meta.hasNext).toBe(true);
    expect(result.meta.hasPrevious).toBe(true);
  });
});
