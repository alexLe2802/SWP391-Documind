import { createContext } from "react";
import type {
  CurrentUser,
  GoogleLoginResult,
  GoogleRegistrationProfile,
  LoginPayload,
  RegisterPayload,
  UpdateProfilePayload,
} from "../../types/auth";

export type AuthContextValue = {
  user: CurrentUser | null;
  isLoading: boolean;
  pendingGoogleRegistration: GoogleRegistrationProfile | null;
  login: (payload: LoginPayload) => Promise<CurrentUser>;
  loginWithGoogle: () => Promise<GoogleLoginResult>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<CurrentUser | null>;
  updateProfile: (payload: UpdateProfilePayload) => Promise<CurrentUser>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
