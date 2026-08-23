import {
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { RoleName, UserStatus } from '../../generated/prisma/client';
import { FirebaseAuthGuard } from './firebase-auth.guard';

describe('FirebaseAuthGuard', () => {
  const originalMockAuth = process.env.MOCK_AUTH;
  const originalNodeEnv = process.env.NODE_ENV;
  const verifyIdToken = jest.fn();
  const verifySessionCookie = jest.fn();
  const findUnique = jest.fn();
  const guard = new FirebaseAuthGuard(
    { verifyIdToken, verifySessionCookie } as never,
    { user: { findUnique } } as never,
  );

  const createContext = (authorization?: string, cookie?: string) => {
    const request = { headers: { authorization, cookie } };
    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as ExecutionContext,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.MOCK_AUTH;
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    if (originalMockAuth === undefined) {
      delete process.env.MOCK_AUTH;
    } else {
      process.env.MOCK_AUTH = originalMockAuth;
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('rejects requests without a bearer token', async () => {
    const { context } = createContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches a local mock admin without a bearer token when mock auth is enabled outside production', async () => {
    process.env.MOCK_AUTH = 'true';
    process.env.NODE_ENV = 'development';
    const { context, request } = createContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request).toHaveProperty(
      'user',
      expect.objectContaining({
        id: '00000000-0000-0000-0000-000000000000',
        firebaseUid: 'mock-firebase-admin-uid',
        email: 'admin.mock@documind.local',
        fullName: 'Mock Admin',
        status: UserStatus.ACTIVE,
        role: { name: RoleName.ADMIN },
      }),
    );
    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('does not enable mock auth in production', async () => {
    process.env.MOCK_AUTH = 'true';
    process.env.NODE_ENV = 'production';
    const { context } = createContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches an active local user to the request', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'firebase-uid' });
    const user = {
      id: 'user-id',
      firebaseUid: 'firebase-uid',
      status: UserStatus.ACTIVE,
      termsAcceptedAt: new Date(),
      role: { name: RoleName.USER },
    };
    findUnique.mockResolvedValue(user);
    const { context, request } = createContext('Bearer valid-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request).toHaveProperty('user', user);
  });

  it('authenticates protected requests with the HttpOnly session cookie', async () => {
    verifySessionCookie.mockResolvedValue({ uid: 'firebase-uid' });
    const user = {
      id: 'user-id',
      firebaseUid: 'firebase-uid',
      status: UserStatus.ACTIVE,
      termsAcceptedAt: new Date(),
      role: { name: RoleName.USER },
    };
    findUnique.mockResolvedValue(user);
    const { context, request } = createContext(
      undefined,
      'other=value; documind_session=secure-session',
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifySessionCookie).toHaveBeenCalledWith(
      'secure-session',
      true,
    );
    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(request).toHaveProperty('user', user);
  });

  it('rejects blocked local users', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'firebase-uid' });
    findUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.BLOCKED,
      role: { name: RoleName.USER },
    });
    const { context } = createContext('Bearer valid-token');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects auto-provisioned users that never accepted the terms', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'firebase-uid' });
    findUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.ACTIVE,
      termsAcceptedAt: null,
      role: { name: RoleName.USER },
    });
    const { context } = createContext('Bearer valid-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Account registration is required',
    );
  });

  it('requires registration instead of auto-provisioning a missing local account', async () => {
    const decodedToken = {
      uid: 'firebase-uid',
      email: 'new-user@documind.local',
    };
    verifyIdToken.mockResolvedValue(decodedToken);
    findUnique.mockResolvedValue(null);
    const { context } = createContext('Bearer valid-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Account registration is required',
    );
  });

  it('preserves HttpException instances raised during authentication', async () => {
    const exception = new ConflictException('Authentication state conflict');
    verifyIdToken.mockRejectedValue(exception);
    const { context } = createContext('Bearer valid-token');

    await expect(guard.canActivate(context)).rejects.toBe(exception);
  });
});
