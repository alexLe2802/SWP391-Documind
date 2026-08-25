import { FirebaseError } from "firebase/app";
import {
  applyActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential,
  signOut,
  signInWithEmailAndPassword,
  updateProfile,
  verifyPasswordResetCode,
} from "firebase/auth";
import { apiRequest } from "../lib/http";
import { getFirebaseAuth } from "../lib/firebase";
import type {
  CurrentUser,
  GoogleLoginPayload,
  LoginPayload,
  RegisterPayload,
} from "../types/auth";

type AuthLoginResponse = {
  user: CurrentUser;
  role: CurrentUser["role"];
  permissions: string[];
  isNewUser: boolean;
};

type AuthMeResponse = Omit<AuthLoginResponse, "isNewUser">;

// Tạo hoặc lưu đăng ký.
export async function register(payload: RegisterPayload) {
  const firebaseAuth = getFirebaseAuth();
  const currentUser = firebaseAuth.currentUser;
  const isGoogleRegistration = currentUser?.providerData.some(
    (provider) => provider.providerId === "google.com",
  );
  const hasPasswordProvider = currentUser?.providerData.some(
    (provider) => provider.providerId === "password",
  );
  const credential =
    isGoogleRegistration && currentUser && !hasPasswordProvider
      ? await linkWithCredential(
          currentUser,
          EmailAuthProvider.credential(payload.email, payload.password),
        )
      : isGoogleRegistration && currentUser
        ? { user: currentUser }
        : await createUserWithEmailAndPassword(
            firebaseAuth,
            payload.email,
            payload.password,
          );

  await updateProfile(credential.user, { displayName: payload.fullName });
  const idToken = await credential.user.getIdToken(true);

  await apiRequest<AuthLoginResponse>("/auth/register", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    body: {
      fullName: payload.fullName,
      acceptedTerms: payload.acceptedTerms,
    },
  });

  await signOut(firebaseAuth);
}

// Thực hiện chức năng đăng nhập.
export async function login(payload: LoginPayload) {
  try {
    const firebaseAuth = getFirebaseAuth();
    const credential = await signInWithEmailAndPassword(
      firebaseAuth,
      payload.email,
      payload.password,
    );
    if (!credential.user.emailVerified) {
      await signOut(firebaseAuth);
      throw new Error("Vui lòng xác thực email trước khi đăng nhập.");
    }
    // A successful sign-in already returns a newly issued token. Avoid an
    // additional forced refresh before exchanging it for the backend session.
    const idToken = await credential.user.getIdToken();

    const currentUser = await loginWithFirebaseToken({ idToken });
    return currentUser;
  } catch (error) {
    throw normalizeAuthError(error);
  }
}

// Thực hiện chức năng đăng nhập with firebase token.
export function loginWithFirebaseToken(payload: GoogleLoginPayload) {
  return apiRequest<AuthLoginResponse>("/auth/firebase-login", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${payload.idToken}`,
    },
  }).then((response) => response.user);
}

// Lấy dữ liệu hiện tại người dùng.
export function getCurrentUser(signal?: AbortSignal) {
  return apiRequest<AuthMeResponse>("/auth/me", { signal }).then(
    (response) => response.user,
  );
}

// Thực hiện chức năng đăng xuất.
export function logout() {
  return apiRequest<void>("/auth/logout", { method: "POST" });
}

// Thực hiện chức năng forgot password.
export function forgotPassword(email: string) {
  return apiRequest<void>("/auth/forgot-password", {
    method: "POST",
    body: { email },
  });
}

// Kiểm tra điều kiện email action code.
export function verifyEmailActionCode(code: string) {
  return applyActionCode(getFirebaseAuth(), code);
}

// Kiểm tra điều kiện reset password code.
export function verifyResetPasswordCode(token: string) {
  return verifyPasswordResetCode(getFirebaseAuth(), token);
}

// Cập nhật password.
export function resetPassword(token: string, password: string) {
  return confirmPasswordReset(getFirebaseAuth(), token, password);
}

// Chuyển đổi hoặc chuẩn hóa xác thực lỗi.
function normalizeAuthError(error: unknown): Error {
  if (
    error instanceof FirebaseError &&
    [
      "auth/invalid-credential",
      "auth/wrong-password",
      "auth/user-not-found",
    ].includes(error.code)
  ) {
    return new Error("Thông tin tài khoản không hợp lệ");
  }

  return error instanceof Error ? error : new Error("Authentication failed");
}
