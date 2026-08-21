import { ForbiddenException } from '@nestjs/common';
import { AuthProvider, RoleName, UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const baseUser = {
    id: 'user-1',
    firebaseUid: 'firebase-1',
    email: 'student@example.com',
    fullName: 'Student',
    avatarUrl: null,
    authProvider: AuthProvider.EMAIL_PASSWORD,
    roleId: 'role-1',
    status: UserStatus.ACTIVE,
    termsAcceptedAt: new Date('2026-06-15T00:00:00.000Z'),
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    role: { name: RoleName.USER },
  };
  const firebaseAuth = {
    verifyIdToken: jest.fn(),
    createSessionCookie: jest.fn(),
    updateUser: jest.fn(),
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    role: {
      upsert: jest.fn(),
    },
  };
  const auditLogService = {
    create: jest.fn(),
  };
  const authEmailService = {
    sendRegistrationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
  };
  const service = new AuthService(
    firebaseAuth as never,
    prisma as unknown as PrismaService,
    auditLogService as never,
    authEmailService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not create a database user during Firebase login', async () => {
    firebaseAuth.verifyIdToken.mockResolvedValue({
      uid: 'unknown-firebase-user',
      email: 'new@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com', identities: {} },
    });
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.firebaseLogin('token')).rejects.toThrow(
      'Account registration is required',
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('requires registration for a legacy auto-provisioned user without accepted terms', async () => {
    firebaseAuth.verifyIdToken.mockResolvedValue({
      uid: baseUser.firebaseUid,
      email: baseUser.email,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com', identities: {} },
    });
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      authProvider: AuthProvider.GOOGLE,
      termsAcceptedAt: null,
    });

    await expect(service.firebaseLogin('token')).rejects.toThrow(
      'Account registration is required',
    );
  });

  it('blocks an inactive account until email is verified', async () => {
    firebaseAuth.verifyIdToken.mockResolvedValue({
      uid: baseUser.firebaseUid,
      email: baseUser.email,
      email_verified: false,
      firebase: { sign_in_provider: 'password', identities: {} },
    });
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      status: UserStatus.INACTIVE,
    });

    await expect(service.firebaseLogin('token')).rejects.toThrow(
      'Email verification is required',
    );
  });

  it('activates an inactive account after Firebase verifies the email', async () => {
    const inactiveUser = { ...baseUser, status: UserStatus.INACTIVE };
    firebaseAuth.verifyIdToken.mockResolvedValue({
      uid: baseUser.firebaseUid,
      email: baseUser.email,
      email_verified: true,
      firebase: { sign_in_provider: 'password', identities: {} },
    });
    prisma.user.findUnique.mockResolvedValue(inactiveUser);
    prisma.user.update.mockResolvedValue(baseUser);
    auditLogService.create.mockResolvedValue({});

    const result = await service.firebaseLogin('token');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: { status: UserStatus.ACTIVE },
      select: {
        id: true,
        roleId: true,
        firebaseUid: true,
        authProvider: true,
        fullName: true,
        email: true,
        avatarUrl: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        termsAcceptedAt: true,
        role: { select: { name: true } },
      },
    });
    expect(auditLogService.create).toHaveBeenNthCalledWith(1, {
      userId: baseUser.id,
      action: 'auth.account_activated',
      targetType: 'User',
      targetId: baseUser.id,
    });
    expect(auditLogService.create).toHaveBeenNthCalledWith(2, {
      userId: baseUser.id,
      action: 'auth.firebase_login',
      targetType: 'User',
      targetId: baseUser.id,
    });
    expect(result.user.status).toBe(UserStatus.ACTIVE);
  });

  it('registers a Google user as inactive and resets Firebase verification', async () => {
    let createdUserData:
      | {
          status: UserStatus;
          authProvider: AuthProvider;
          termsAcceptedAt: unknown;
        }
      | undefined;
    firebaseAuth.verifyIdToken.mockResolvedValue({
      uid: 'google-uid',
      email: 'google@example.com',
      email_verified: true,
      picture: 'https://example.com/avatar.png',
      firebase: {
        sign_in_provider: 'password',
        identities: { 'google.com': ['google-subject'] },
      },
    });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.role.upsert.mockResolvedValue({ id: 'role-1', name: RoleName.USER });
    prisma.user.create.mockImplementation((args: unknown) => {
      const createArgs = args as {
        data: {
          status: UserStatus;
          authProvider: AuthProvider;
          termsAcceptedAt: unknown;
        };
      };
      createdUserData = createArgs.data;
      return Promise.resolve({
        ...baseUser,
        firebaseUid: 'google-uid',
        email: 'google@example.com',
        avatarUrl: 'https://example.com/avatar.png',
        authProvider: AuthProvider.GOOGLE,
        status: UserStatus.INACTIVE,
      });
    });
    auditLogService.create.mockResolvedValue({});

    const result = await service.register('token', {
      fullName: 'Google Student',
      acceptedTerms: true,
    });

    expect(firebaseAuth.updateUser).toHaveBeenCalledWith('google-uid', {
      emailVerified: false,
    });
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(createdUserData?.status).toBe(UserStatus.INACTIVE);
    expect(createdUserData?.authProvider).toBe(AuthProvider.GOOGLE);
    expect(createdUserData?.termsAcceptedAt).toBeInstanceOf(Date);
    expect(auditLogService.create).toHaveBeenCalledWith({
      userId: baseUser.id,
      action: 'auth.registration_pending',
      targetType: 'User',
      targetId: baseUser.id,
    });
    expect(authEmailService.sendRegistrationEmail).toHaveBeenCalledWith(
      'google@example.com',
      'Google Student',
    );
    expect(result.isNewUser).toBe(true);
  });

  it('resends verification for an existing inactive registration', async () => {
    firebaseAuth.verifyIdToken.mockResolvedValue({
      uid: baseUser.firebaseUid,
      email: baseUser.email,
      email_verified: false,
      firebase: { sign_in_provider: 'password', identities: {} },
    });
    prisma.user.findFirst.mockResolvedValue({
      ...baseUser,
      status: UserStatus.INACTIVE,
    });
    prisma.user.update.mockResolvedValue({
      ...baseUser,
      status: UserStatus.INACTIVE,
    });

    await service.register('token', {
      fullName: 'Student Updated',
      acceptedTerms: true,
    });

    expect(authEmailService.sendRegistrationEmail).toHaveBeenCalledWith(
      baseUser.email,
      'Student Updated',
    );
  });

  it('repairs a legacy auto-provisioned Google user through registration', async () => {
    firebaseAuth.verifyIdToken.mockResolvedValue({
      uid: baseUser.firebaseUid,
      email: baseUser.email,
      email_verified: true,
      firebase: {
        sign_in_provider: 'google.com',
        identities: { 'google.com': ['google-subject'] },
      },
    });
    prisma.user.findFirst.mockResolvedValue({
      ...baseUser,
      authProvider: AuthProvider.GOOGLE,
      termsAcceptedAt: null,
    });
    let updateArgument: unknown;
    prisma.user.update.mockImplementation((args: unknown) => {
      updateArgument = args;
      return Promise.resolve({
        ...baseUser,
        fullName: 'Completed Google User',
        authProvider: AuthProvider.GOOGLE,
        status: UserStatus.INACTIVE,
        termsAcceptedAt: new Date(),
      });
    });

    await service.register('token', {
      fullName: 'Completed Google User',
      acceptedTerms: true,
    });

    expect(firebaseAuth.updateUser).toHaveBeenCalledWith(baseUser.firebaseUid, {
      emailVerified: false,
    });
    expect(updateArgument).toMatchObject({
      where: { id: baseUser.id },
      data: {
        fullName: 'Completed Google User',
        avatarUrl: null,
        authProvider: AuthProvider.GOOGLE,
        status: UserStatus.INACTIVE,
      },
    });
    const updateData = (updateArgument as { data: { termsAcceptedAt: unknown } })
      .data;
    expect(updateData.termsAcceptedAt).toBeInstanceOf(Date);
    expect(authEmailService.sendRegistrationEmail).toHaveBeenCalledWith(
      baseUser.email,
      'Completed Google User',
    );
  });

  it('delegates password-reset delivery to the auth email service', async () => {
    await service.forgotPassword('student@example.com');

    expect(authEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
      'student@example.com',
    );
  });

  it('requires acceptance of the terms before registration', async () => {
    await expect(
      service.register('token', {
        fullName: 'Student',
        acceptedTerms: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(firebaseAuth.verifyIdToken).not.toHaveBeenCalled();
  });
});
