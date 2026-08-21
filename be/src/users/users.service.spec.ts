import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthProvider, RoleName, UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const user = {
    id: 'user-1',
    firebaseUid: 'firebase-1',
    email: 'student@example.com',
    fullName: 'Student Name',
    avatarUrl: null,
    authProvider: AuthProvider.GOOGLE,
    roleId: 'role-1',
    status: UserStatus.ACTIVE,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    role: { name: RoleName.USER },
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const auditLogService = {
    create: jest.fn(),
  };
  const service = new UsersService(
    prisma as unknown as PrismaService,
    auditLogService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the current user profile', async () => {
    prisma.user.findUnique.mockResolvedValue(user);

    await expect(service.getProfile('user-1')).resolves.toMatchObject({
      id: 'user-1',
      role: RoleName.USER,
      status: UserStatus.ACTIVE,
    });
  });

  it('updates only supported profile fields and writes an audit log', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue({
      ...user,
      fullName: 'Updated Name',
      avatarUrl: 'https://example.com/avatar.png',
    });
    auditLogService.create.mockResolvedValue({});

    const result = await service.updateProfile('user-1', {
      fullName: 'Updated Name',
      avatarUrl: 'https://example.com/avatar.png',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        fullName: 'Updated Name',
        avatarUrl: 'https://example.com/avatar.png',
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        role: { select: { name: true } },
      },
    });
    expect(auditLogService.create).toHaveBeenCalledWith({
      userId: 'user-1',
      action: 'user.profile_updated',
      targetType: 'User',
      targetId: 'user-1',
      metadata: {
        updatedFields: ['fullName', 'avatarUrl'],
      },
    });
    expect(result.fullName).toBe('Updated Name');
  });

  it('allows the current user to remove their avatar', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue({
      ...user,
      avatarUrl: null,
    });
    auditLogService.create.mockResolvedValue({});

    const result = await service.updateProfile('user-1', {
      avatarUrl: null,
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        fullName: undefined,
        avatarUrl: null,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        role: { select: { name: true } },
      },
    });
    expect(result.avatarUrl).toBeNull();
  });

  it('throws when the profile no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getProfile('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects an empty partial update', async () => {
    await expect(service.updateProfile('user-1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
