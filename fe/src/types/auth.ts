export type UserRole = "ADMIN" | "USER";

export type UserStatus = "ACTIVE" | "BLOCKED" | "INACTIVE";
export type AdminMutableUserStatus = Exclude<UserStatus, "INACTIVE">;

export type AuthProvider = "GOOGLE" | "EMAIL_PASSWORD";

export type CurrentUser = {
  id: string;
  roleId?: string;
  firebaseUid?: string;
  authProvider?: AuthProvider;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt?: string;
  lastLogin: string | null;
};

export type UserProfile = Pick<
  CurrentUser,
  "id" | "email" | "fullName" | "avatarUrl" | "role" | "status" | "createdAt"
> & {
  updatedAt: string;
};

export type UpdateProfilePayload = {
  fullName?: string;
  avatarUrl?: string | null;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type GoogleLoginPayload = {
  idToken: string;
};

export type GoogleRegistrationProfile = {
  fullName: string;
  email: string;
  avatarUrl: string | null;
};

export type RegisterPayload = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptedTerms: boolean;
};

export type GoogleLoginResult =
  | { status: "authenticated"; user: CurrentUser }
  | {
      status: "registration-required";
      profile: GoogleRegistrationProfile;
    };

export type UserListResponse = {
  items: CurrentUser[];
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
};
