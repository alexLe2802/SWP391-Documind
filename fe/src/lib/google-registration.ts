import type { GoogleRegistrationProfile } from "../types/auth";

const STORAGE_KEY = "documind:pending-google-registration";

// Thực hiện chức năng store pending google registration.
export function storePendingGoogleRegistration(
  profile: GoogleRegistrationProfile,
) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

// Lấy dữ liệu pending google registration.
export function readPendingGoogleRegistration(): GoogleRegistrationProfile | null {
  const storedValue = window.sessionStorage.getItem(STORAGE_KEY);
  if (!storedValue) return null;

  try {
    const profile = JSON.parse(
      storedValue,
    ) as Partial<GoogleRegistrationProfile>;
    if (
      typeof profile.fullName !== "string" ||
      typeof profile.email !== "string" ||
      (profile.avatarUrl !== null && typeof profile.avatarUrl !== "string")
    ) {
      clearPendingGoogleRegistration();
      return null;
    }

    return profile as GoogleRegistrationProfile;
  } catch {
    clearPendingGoogleRegistration();
    return null;
  }
}

// Xóa hoặc giải phóng pending google registration.
export function clearPendingGoogleRegistration() {
  window.sessionStorage.removeItem(STORAGE_KEY);
}
