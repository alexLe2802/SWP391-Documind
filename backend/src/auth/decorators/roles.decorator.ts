import { SetMetadata } from '@nestjs/common';
import { RoleName } from '../../generated/prisma/client';

export const ROLES_KEY = 'roles';
// Hiển thị giao diện roles.
export const Roles = (...roles: RoleName[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
