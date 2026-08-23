"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { signInWithPopup, signOut } from "firebase/auth";
import * as authApi from "../../api/auth.api";
import * as profileApi from "../../api/profile.api";
import { clearStoredAuthToken } from "../../lib/auth-token";
import { ApiError } from "../../lib/http";
import { getFirebaseAuth, getGoogleAuthProvider } from "../../lib/firebase";
import {
  clearPendingGoogleRegistration,
  storePendingGoogleRegistration,
} from "../../lib/google-registration";
import type {
  CurrentUser,
  GoogleLoginResult,
  GoogleRegistrationProfile,
  LoginPayload,
  RegisterPayload,
  UpdateProfilePayload,
} from "../../types/auth";
import { AuthContext } from "./auth-context";

const SESSION_RESTORE_TIMEOUT_MS = 8_000;

// Hiển thị giao diện xác thực provider.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [pendingGoogleRegistration, setPendingGoogleRegistration] =
    useState<GoogleRegistrationProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Tải lại thông tin người dùng hiện tại từ backend và cập nhật state.
  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await authApi.getCurrentUser();
      setUser(currentUser);
      return currentUser;
    } catch (error) {
      // Do not destroy a valid UI session for a backend restart or 5xx.
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const firebaseAuth = getFirebaseAuth();
    clearStoredAuthToken();
    const restoreTimeout = window.setTimeout(
      () => setIsLoading(false),
      SESSION_RESTORE_TIMEOUT_MS,
    );
    void refreshUser().finally(() => window.clearTimeout(restoreTimeout));

    // Xử lý sự kiện unauthorized.
    function handleUnauthorized() {
      clearStoredAuthToken();
      setUser(null);
      void signOut(firebaseAuth);
    }

    window.addEventListener("ai-study-hub:unauthorized", handleUnauthorized);

    return () => {
      window.clearTimeout(restoreTimeout);
      window.removeEventListener(
        "ai-study-hub:unauthorized",
        handleUnauthorized,
      );
    };
  }, [refreshUser]);

  // Xử lý đăng nhập bằng email/mật khẩu, cập nhật user state sau khi thành công.
  const handleLogin = useCallback(async (payload: LoginPayload) => {
    const currentUser = await authApi.login(payload);
    setUser(currentUser);
    setIsLoading(false);
    return currentUser;
  }, []);

  // Xử lý đăng ký tài khoản mới, xóa phiên Google tạm thời sau khi đăng ký.
  const handleRegister = useCallback(async (payload: RegisterPayload) => {
    await authApi.register(payload);
    clearPendingGoogleRegistration();
    setPendingGoogleRegistration(null);
    clearStoredAuthToken();
    setUser(null);
    setIsLoading(false);
  }, []);

  // Đăng nhập bằng Google popup; nếu tài khoản chưa đăng ký sẽ chuyển sang luồng đăng ký.
  const handleGoogleLogin =
    useCallback(async (): Promise<GoogleLoginResult> => {
      const firebaseAuth = getFirebaseAuth();
      const googleAuthProvider = getGoogleAuthProvider();
      const credential = await signInWithPopup(
        firebaseAuth,
        googleAuthProvider,
      );
      const idToken = await credential.user.getIdToken();
      try {
        const currentUser = await authApi.loginWithFirebaseToken({ idToken });
        clearPendingGoogleRegistration();
        setPendingGoogleRegistration(null);
        setUser(currentUser);
        setIsLoading(false);
        return { status: "authenticated", user: currentUser };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Account registration is required"
        ) {
          clearStoredAuthToken();
          setUser(null);
          setIsLoading(false);
          const profile = {
            fullName: credential.user.displayName ?? "",
            email: credential.user.email ?? "",
            avatarUrl: credential.user.photoURL,
          };
          storePendingGoogleRegistration(profile);
          setPendingGoogleRegistration(profile);
          return {
            status: "registration-required",
            profile,
          };
        }
        await signOut(firebaseAuth);
        throw error;
      }
    }, []);

  // Xử lý đăng xuất: xóa token, đăng xuất Firebase và reset state người dùng.
  const handleLogout = useCallback(async () => {
    clearStoredAuthToken();
    clearPendingGoogleRegistration();
    setPendingGoogleRegistration(null);
    try {
      await authApi.logout();
    } finally {
      await signOut(getFirebaseAuth());
      setUser(null);
    }
  }, []);

  // Cập nhật thông tin hồ sơ người dùng và đồng bộ lại state toàn cục.
  const handleUpdateProfile = useCallback(
    async (payload: UpdateProfilePayload) => {
      const profile = await profileApi.updateProfile(payload);
      const updatedUser: CurrentUser = {
        ...profile,
        firebaseUid: user?.firebaseUid,
        authProvider: user?.authProvider,
        roleId: user?.roleId,
        lastLogin: user?.lastLogin ?? null,
      };

      setUser(updatedUser);
      return updatedUser;
    },
    [user],
  );

  // Tổng hợp tất cả state và hàm xác thực thành context để truyền xuống cây component.
  const value = useMemo(
    () => ({
      user,
      isLoading,
      pendingGoogleRegistration,
      login: handleLogin,
      loginWithGoogle: handleGoogleLogin,
      register: handleRegister,
      logout: handleLogout,
      refreshUser,
      updateProfile: handleUpdateProfile,
    }),
    [
      handleGoogleLogin,
      handleLogin,
      handleLogout,
      handleRegister,
      handleUpdateProfile,
      isLoading,
      pendingGoogleRegistration,
      refreshUser,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
