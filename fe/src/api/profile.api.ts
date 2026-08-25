import { apiRequest } from "../lib/http";
import type { UserProfile, UpdateProfilePayload } from "../types/auth";

// Lấy dữ liệu hồ sơ.
export function getProfile() {
  return apiRequest<UserProfile>("/users/profile");
}

// Cập nhật hồ sơ.
export function updateProfile(payload: UpdateProfilePayload) {
  return apiRequest<UserProfile>("/users/profile", {
    method: "PATCH",
    body: payload,
  });
}

// Tải lên avatar.
export function uploadAvatar(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<UserProfile>("/users/avatar", {
    method: "POST",
    body: formData,
  });
}

