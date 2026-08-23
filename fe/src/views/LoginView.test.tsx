import { render, screen, waitFor } from "@testing-library/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../features/auth/useAuth";
import { useLanguage } from "../i18n/LanguageProvider";
import type { CurrentUser } from "../types/auth";
import { LoginView } from "./LoginView";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock("../features/auth/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../i18n/LanguageProvider", () => ({
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

describe("LoginView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({
      replace,
      push: vi.fn(),
    } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams() as ReturnType<typeof useSearchParams>,
    );
    vi.mocked(useLanguage).mockReturnValue({
      locale: "en",
      setLocale: vi.fn(),
      t: (key: string) =>
        key === "auth.checking" ? "Checking session" : key,
    });
  });

  it("waits for Firebase to restore the session before showing the form", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: true,
    } as ReturnType<typeof useAuth>);

    render(<LoginView />);

    expect(screen.getByText("Checking session")).toBeInTheDocument();
    expect(screen.queryByLabelText("auth.email")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects an authenticated user away from login", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: activeUser,
      isLoading: false,
    } as ReturnType<typeof useAuth>);

    render(<LoginView />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(screen.getByText("Checking session")).toBeInTheDocument();
  });
});
