import { getFirebaseAuth } from '../lib/firebase';

// Lấy Firebase token tại thời điểm gửi request; không lưu token lâu dài trong
// localStorage/sessionStorage vì backend production dùng session HttpOnly.
async function getAuthToken(): Promise<string | undefined> {
  return getFirebaseAuth().currentUser?.getIdToken();
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export type UserRole = 'ADMIN' | 'USER';
export type UserStatus = 'ACTIVE' | 'BLOCKED' | 'INACTIVE';
export type AdminMutableUserStatus = 'ACTIVE' | 'BLOCKED';

export interface AdminUserItem {
  id: string;
  firebaseUid: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  authProvider: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLogin: string | null;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface AdminUsersResponse {
  items: AdminUserItem[];
  meta: PaginationMeta;
}

export interface AdminUsersQuery {
  keyword?: string;
  role?: UserRole;
  status?: UserStatus;
  page?: number;
  limit?: number;
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function getAdminUsers(
  query: AdminUsersQuery = {},
): Promise<AdminUsersResponse> {
  const params = new URLSearchParams();
  if (query.keyword) params.set('keyword', query.keyword);
  if (query.role) params.set('role', query.role);
  if (query.status) params.set('status', query.status);
  params.set('page', String(query.page ?? 1));
  params.set('limit', String(query.limit ?? 20));

  const res = await fetch(
    `${API_BASE}/admin/users?${params.toString()}`,
    { headers: await authHeaders() },
  );
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);
  const body = await res.json() as { data: AdminUsersResponse };
  return body.data;
}

export async function updateAdminUserStatus(
  userId: string,
  status: AdminMutableUserStatus,
  reason?: string,
): Promise<AdminUserItem> {
  const res = await fetch(`${API_BASE}/admin/users/${userId}/status`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify({ status, reason }),
  });
  if (!res.ok) throw new Error(`Failed to update user status: ${res.status}`);
  const body = await res.json() as { data: AdminUserItem };
  return body.data;
}
