const AUTH_TOKEN_KEY = "ai-study-hub.firebaseIdToken";

// Xóa hoặc giải phóng stored xác thực token.
export function clearStoredAuthToken() {
  if (typeof window === "undefined") return;

  // Remove legacy copies written by older DocuMind builds. Firebase remains
  // the sole owner of its authentication state.
  window.sessionStorage?.removeItem(AUTH_TOKEN_KEY);
  window.localStorage?.removeItem(AUTH_TOKEN_KEY);
}

// Thực hiện nghiệp vụ notify unauthorized.
export function notifyUnauthorized() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("ai-study-hub:unauthorized"));
}
