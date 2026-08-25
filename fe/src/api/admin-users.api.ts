/**
 * Compatibility facade for the MF-05 path. The production implementation now
 * lives in users.api and uses the shared HttpOnly-session HTTP client.
 */
export {
  getUsers as getAdminUsers,
  updateUserStatus as updateAdminUserStatus,
  type UserQuery as AdminUsersQuery,
} from './users.api';
export type {
  CurrentUser as AdminUserItem,
  UserRole,
  UserStatus,
  AdminMutableUserStatus,
  UserListResponse as AdminUsersResponse,
} from '../types/auth';
