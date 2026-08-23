import { apiRequest } from "../lib/http";
import type {
  AdminMutableUserStatus,
  CurrentUser,
  UserListResponse,
  UserRole,
  UserStatus,
} from "../types/auth";
import { mockGetUsers, mockUpdateUserStatus } from "./admin.mock";

const ADMIN_USERS_PATH = "/admin/users";
const USE_MOCKS =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_USE_MOCK_API === "true";

export type UserQuery = {
  page?: number;
  limit?: number;
  keyword?: string;
  role?: UserRole | "";
  status?: UserStatus | "";
};

// Chuyển đổi hoặc chuẩn hóa query string.
function toQueryString(query: UserQuery) {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  });

  const text = params.toString();
  return text ? `?${text}` : "";
}

// Lấy dữ liệu người dùng.
export function getUsers(query: UserQuery = {}) {
  if (USE_MOCKS) {
    return mockGetUsers(query);
  }
  return apiRequest<UserListResponse>(
    `${ADMIN_USERS_PATH}${toQueryString(query)}`,
  );
}

// Cập nhật người dùng trạng thái.
export function updateUserStatus(id: string, status: AdminMutableUserStatus) {
  if (USE_MOCKS) {
    return mockUpdateUserStatus(id, status);
  }
  return apiRequest<CurrentUser>(`${ADMIN_USERS_PATH}/${id}/status`, {
    method: "PATCH",
    body: { status },
  });
}
