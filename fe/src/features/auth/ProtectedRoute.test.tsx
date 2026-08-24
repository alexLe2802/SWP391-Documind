import { render, screen, waitFor } from "@testing-library/react";
import { usePathname, useRouter } from "next/navigation";
import type { CurrentUser } from "../../types/auth";
import { useLanguage } from "../../i18n/LanguageProvider";
import { useAuth } from "./useAuth";
import { ProtectedRoute } from "./ProtectedRoute";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useRouter: vi.fn(),
}));

vi.mock("./useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../i18n/LanguageProvider", () => ({
  useLanguage: vi.fn(),
}));

const replace = vi.fn();
const activeUser: CurrentUser = {
  id: "user-1",
  fullName: "Student Name",
  email: "student@example.com",
  avatarUrl: null,
  role: "USER",
  status: "ACTIVE",
  createdAt: "2026-06-15T00:00:00.000Z",
  lastLogin: null,
};

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePathname).mockReturnValue("/profile");
    vi.mocked(useRouter).mockReturnValue({ replace } as unknown as ReturnType<
      typeof useRouter
    >);
    vi.mocked(useLanguage).mockReturnValue({
      locale: "en",
      setLocale: vi.fn(),
      t: () => "Checking session",
    });
  });

  it("shows a loading state while Firebase restores the session", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: true,
    } as ReturnType<typeof useAuth>);

    render(
      <ProtectedRoute>
        <div>Protected content</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("Checking session")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated users to login with the original path", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
    } as ReturnType<typeof useAuth>);

    render(
      <ProtectedRoute>
        <div>Protected content</div>
      </ProtectedRoute>,
    );

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/login?from=%2Fprofile"),
    );
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("redirects blocked users to the unauthorized page", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { ...activeUser, status: "BLOCKED" },
      isLoading: false,
    } as ReturnType<typeof useAuth>);

    render(
      <ProtectedRoute>
        <div>Protected content</div>
      </ProtectedRoute>,
    );

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/unauthorized"),
    );
  });

  it("enforces the ADMIN role for admin routes", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: activeUser,
      isLoading: false,
    } as ReturnType<typeof useAuth>);

    render(
      <ProtectedRoute allowedRoles={["ADMIN"]}>
        <div>Admin content</div>
      </ProtectedRoute>,
    );

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/unauthorized"),
    );
    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
  });

  it("renders protected content for an active user with an allowed role", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { ...activeUser, role: "ADMIN" },
      isLoading: false,
    } as ReturnType<typeof useAuth>);

    render(
      <ProtectedRoute allowedRoles={["ADMIN"]}>
        <div>Admin content</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("Admin content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
