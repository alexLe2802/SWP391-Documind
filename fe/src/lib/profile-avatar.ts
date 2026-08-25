import { uploadAvatar } from "../api/profile.api";

export const AVATAR_MAX_SIZE = 5 * 1024 * 1024;
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

const ALLOWED_AVATAR_TYPES = new Set(AVATAR_ACCEPT.split(","));

// Kiểm tra điều kiện avatar tệp.
export function validateAvatarFile(file: File): "type" | "size" | null {
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) return "type";
  if (file.size > AVATAR_MAX_SIZE) return "size";
  return null;
}

// Tạo hoặc lưu tải lên hồ sơ avatar qua Cloudflare R2 (Backend).
export async function uploadProfileAvatar(_userId: string, file: File) {
  const profile = await uploadAvatar(file);
  return profile.avatarUrl || "";
}

