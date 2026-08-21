import { RoleName, User, UserStatus } from '../generated/prisma/client';

export type AuthenticatedUser = Pick<
  User,
  'id' | 'firebaseUid' | 'email' | 'fullName'
> & {
  status: UserStatus;
  role: { name: RoleName };
};

export interface AuthenticatedRequest {
  headers: { authorization?: string; cookie?: string };
  user?: AuthenticatedUser;
}
