import Link from "next/link";
import { render, screen, within } from "@testing-library/react";
import { useAuth } from "../../features/auth/useAuth";
import { useLanguage } from "../../i18n/LanguageProvider";
import type { CurrentUser } from "../../types/auth";
import { LandingPage } from "./LandingPage";

vi.mock("../../features/auth/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../i18n/LanguageProvider", () => ({
  useLanguage: vi.fn(),
}));

vi.mock("../ui/Brand", () => ({
  Brand: () => <Link href="/">DocuMind</Link>,
}));

vi.mock("../ui/LanguageSwitcher", () => ({
  LanguageSwitcher: () => <button type="button">Language</button>,
}));

vi.mock("../ui/Reveal", () => ({
  Reveal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const activeUser: CurrentUser = {
  id: "user-1",
  fullName: "Le Quoc Thong",
  email: "thong@example.com",
  avatarUrl: null,
  role: "USER",
  status: "ACTIVE",
  createdAt: "2026-06-18T00:00:00.000Z",
  lastLogin: null,
};

describe("LandingPage authentication state", () => {
  beforeEach(() => {
    vi.mocked(useLanguage).mockReturnValue({
      locale: "en",
      setLocale: vi.fn(),
      t: (key) => key,
    });
  });

  it("keeps authenticated users signed in and links back to the app", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: activeUser,
      isLoading: false,
    } as ReturnType<typeof useAuth>);

    render(<LandingPage />);

    const appLinks = screen.getAllByRole("link", { name: "Open app" });
    expect(appLinks.length).toBeGreaterThan(0);
    expect(appLinks.every((link) => link.getAttribute("href") === "/dashboard")).toBe(true);
    const header = screen.getByRole("banner");
    expect(
      within(header).queryByRole("link", { name: "common.login" }),
    ).not.toBeInTheDocument();
    expect(
      within(header).queryByRole("link", { name: "common.register" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "common.login" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "common.register" }),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: "Open app" })
        .every((link) => link.getAttribute("href") === "/dashboard"),
    ).toBe(true);
  });

  it("links active admins to the admin dashboard", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { ...activeUser, role: "ADMIN" },
      isLoading: false,
    } as ReturnType<typeof useAuth>);

    render(<LandingPage />);

    const appLinks = screen.getAllByRole("link", { name: "Open app" });
    expect(appLinks.length).toBeGreaterThan(0);
    expect(
      appLinks.every((link) => link.getAttribute("href") === "/admin/dashboard"),
    ).toBe(true);
  });

  it("sends guests to login from the open-app button", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
    } as ReturnType<typeof useAuth>);

    render(<LandingPage />);

    const header = screen.getByRole("banner");
    const appLinks = within(header).getAllByRole("link", { name: "Open app" });

    expect(appLinks.length).toBeGreaterThan(0);
    expect(appLinks.every((link) => link.getAttribute("href") === "/login")).toBe(
      true,
    );
  });
});
