import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '../../generated/prisma/client';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const originalMockAuth = process.env.MOCK_AUTH;
  const originalNodeEnv = process.env.NODE_ENV;
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const guard = new RolesGuard(reflector);

  const contextFor = (role: string) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: { name: role } } }),
      }),
    }) as unknown as ExecutionContext;

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

  it('allows requests when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(guard.canActivate(contextFor(RoleName.USER))).toBe(true);
  });

  it('allows a user with a required role', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([RoleName.ADMIN]);

    expect(guard.canActivate(contextFor(RoleName.ADMIN))).toBe(true);
  });

  it('allows required roles when mock auth is enabled outside production', () => {
    process.env.MOCK_AUTH = 'true';
    process.env.NODE_ENV = 'development';
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([RoleName.ADMIN]);

    expect(guard.canActivate(contextFor(RoleName.USER))).toBe(true);
  });

  it('does not bypass required roles in production', () => {
    process.env.MOCK_AUTH = 'true';
    process.env.NODE_ENV = 'production';
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([RoleName.ADMIN]);

    expect(() => guard.canActivate(contextFor(RoleName.USER))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a user without a required role', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([RoleName.ADMIN]);

    expect(() => guard.canActivate(contextFor(RoleName.USER))).toThrow(
      ForbiddenException,
    );
  });
});
