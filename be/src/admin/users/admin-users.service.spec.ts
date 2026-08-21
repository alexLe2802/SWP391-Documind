import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdminUsersService } from './admin-users.service';
import { AdminMutableUserStatus } from './dto/update-user-status.dto';
import { RoleName, UserStatus, AuthProvider } from '../../../generated/prisma/client';

describe('AdminUsersService – updateStatus', () => {
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue(undefined),
    },
  };

  const service = new AdminUsersService(mockPrisma as unknown as PrismaService);

  const now = new Date('2026-08-21T00:00:00.000Z');
  const baseUser = {
    id: 'user-uuid',
    firebaseUid: 'firebase-uid',
    email: 'user@example.com',
    fullName: 'Test User',
    avatarUrl: null,
    authProvider: AuthProvider.EMAIL_PASSWORD,
    roleId: 'role-id',
    status: UserStatus.ACTIVE,
    termsAcceptedAt: null,
    createdAt: now,
    updatedAt: now,
    role: { name: RoleName.USER },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws NotFoundException when user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.updateStatus('unknown-id', AdminMutableUserStatus.BLOCKED, undefined, 'admin-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when admin tries to block their own account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      id: 'admin-id',
      role: { name: RoleName.ADMIN },
    });

    await expect(
      service.updateStatus('admin-id', AdminMutableUserStatus.BLOCKED, undefined, 'admin-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when admin tries to block another admin', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      id: 'other-admin-id',
      role: { name: RoleName.ADMIN },
    });

    await expect(
      service.updateStatus('other-admin-id', AdminMutableUserStatus.BLOCKED, undefined, 'admin-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when targeting a user pending email verification', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      status: UserStatus.INACTIVE,
    });

    await expect(
      service.updateStatus(baseUser.id, AdminMutableUserStatus.ACTIVE, undefined, 'admin-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('blocks an active user and returns the updated record', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser);
    mockPrisma.user.update.mockResolvedValue({
      ...baseUser,
      status: UserStatus.BLOCKED,
    });

    const result = await service.updateStatus(
      baseUser.id,
      AdminMutableUserStatus.BLOCKED,
      'Policy violation',
      'admin-id',
    );

    expect(result.status).toBe(UserStatus.BLOCKED);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: { status: AdminMutableUserStatus.BLOCKED },
      include: { role: true },
    });
  });

  it('activates a blocked user and returns the updated record', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      status: UserStatus.BLOCKED,
    });
    mockPrisma.user.update.mockResolvedValue({
      ...baseUser,
      status: UserStatus.ACTIVE,
    });

    const result = await service.updateStatus(
      baseUser.id,
      AdminMutableUserStatus.ACTIVE,
      undefined,
      'admin-id',
    );

    expect(result.status).toBe(UserStatus.ACTIVE);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: { status: AdminMutableUserStatus.ACTIVE },
      include: { role: true },
    });
  });
});
