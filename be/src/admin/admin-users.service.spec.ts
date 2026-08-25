import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthProvider, RoleName, UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminUsersService } from './admin-users.service';
import { AdminMutableUserStatus } from './dto/update-user-status.dto';

describe('AdminUsersService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const auditLogService = {
    create: jest.fn(),
  };
  const service = new AdminUsersService(
    prisma as unknown as PrismaService,
    auditLogService as never,
  );
  const now = new Date('2026-06-16T00:00:00.000Z');
  const baseUser = {
    id: 'user-id',
    firebaseUid: 'firebase-uid',
    email: 'user@example.com',
    fullName: 'Example User',
    avatarUrl: null,
    authProvider: AuthProvider.EMAIL_PASSWORD,
    roleId: 'role-id',
    status: UserStatus.ACTIVE,
    termsAcceptedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const userWithRole = {
    ...baseUser,
    role: { name: RoleName.USER },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects status updates for users pending email verification', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...userWithRole,
      status: UserStatus.INACTIVE,
    });

    await expect(
      service.updateStatus(
        baseUser.id,
        AdminMutableUserStatus.ACTIVE,
        undefined,
        'admin-id',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(auditLogService.create).not.toHaveBeenCalled();
  });

  it('rejects updates for missing users', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.updateStatus(
        baseUser.id,
        AdminMutableUserStatus.BLOCKED,
        undefined,
        'admin-id',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects blocking their own account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...userWithRole,
      id: 'admin-id',
      role: { name: RoleName.ADMIN },
    });

    await expect(
      service.updateStatus(
        'admin-id',
        AdminMutableUserStatus.BLOCKED,
        undefined,
        'admin-id',
      ),
    ).rejects.toThrow(
      new BadRequestException('Admins cannot block their own account.'),
    );
  });

  it('rejects blocking other admin accounts', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...userWithRole,
      id: 'other-admin-id',
      role: { name: RoleName.ADMIN },
    });

    await expect(
      service.updateStatus(
        'other-admin-id',
        AdminMutableUserStatus.BLOCKED,
        undefined,
        'admin-id',
      ),
    ).rejects.toThrow(
      new BadRequestException('Admins cannot block other admin accounts.'),
    );
  });

  it('blocks an active user and writes an audit log', async () => {
    prisma.user.findUnique.mockResolvedValue(userWithRole);
    prisma.user.update.mockResolvedValue({
      ...userWithRole,
      status: UserStatus.BLOCKED,
    });

    const result = await service.updateStatus(
      baseUser.id,
      AdminMutableUserStatus.BLOCKED,
      'Policy violation',
      'admin-id',
    );

    expect(result.status).toBe(UserStatus.BLOCKED);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: { status: AdminMutableUserStatus.BLOCKED },
      include: { role: true },
    });
    expect(auditLogService.create).toHaveBeenCalledWith({
      userId: 'admin-id',
      action: 'admin.user_status_updated',
      targetType: 'User',
      targetId: baseUser.id,
      metadata: {
        status: AdminMutableUserStatus.BLOCKED,
        reason: 'Policy violation',
      },
    });
  });

  it('unblocks a blocked user by setting it active', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...userWithRole,
      status: UserStatus.BLOCKED,
    });
    prisma.user.update.mockResolvedValue(userWithRole);

    const result = await service.updateStatus(
      baseUser.id,
      AdminMutableUserStatus.ACTIVE,
      undefined,
      'admin-id',
    );

    expect(result.status).toBe(UserStatus.ACTIVE);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: { status: AdminMutableUserStatus.ACTIVE },
      include: { role: true },
    });
  });
});
