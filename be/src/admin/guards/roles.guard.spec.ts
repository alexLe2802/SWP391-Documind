import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '../../generated/prisma/client';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';

function makeContext(role: RoleName | undefined, handler = jest.fn(), cls = jest.fn()) {
  const request = { user: role ? { role: { name: role } } : undefined };
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard — admin route protection', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('grants access when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('rejects a USER attempting to access an ADMIN-only route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([RoleName.ADMIN]);
    expect(() => guard.canActivate(makeContext(RoleName.USER))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects an unauthenticated request on an ADMIN-only route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([RoleName.ADMIN]);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('grants access to an ADMIN on an ADMIN-only route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([RoleName.ADMIN]);
    expect(guard.canActivate(makeContext(RoleName.ADMIN))).toBe(true);
  });

  it('uses the ROLES_KEY constant for metadata lookup', () => {
    const spy = jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const ctx = makeContext(RoleName.ADMIN);
    guard.canActivate(ctx);
    expect(spy).toHaveBeenCalledWith(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
  });
});
