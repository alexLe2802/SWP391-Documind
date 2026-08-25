import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VerifyEmailView } from "./VerifyEmailView";
import { verifyEmailActionCode } from "../api/auth.api";
import { useSearchParams } from "next/navigation";

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("../api/auth.api", () => ({
  verifyEmailActionCode: vi.fn(),
}));

describe("VerifyEmailView", () => {
  beforeEach(() => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams(
        "mode=verifyEmail&oobCode=single-use-code",
      ) as ReturnType<typeof useSearchParams>,
    );
    vi.mocked(verifyEmailActionCode).mockResolvedValue(undefined);
  });

  it("applies a single-use action code only once in Strict Mode", async () => {
    render(
      <StrictMode>
        <VerifyEmailView />
      </StrictMode>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Tài khoản đã được kích hoạt" }),
      ).toBeInTheDocument(),
    );
    expect(verifyEmailActionCode).toHaveBeenCalledTimes(1);
    expect(verifyEmailActionCode).toHaveBeenCalledWith("single-use-code");
  });

  it("shows success after Firebase's hosted handler redirects back", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("verified=true") as ReturnType<
        typeof useSearchParams
      >,
    );

    render(<VerifyEmailView />);

    expect(
      await screen.findByRole("heading", {
        name: "Tài khoản đã được kích hoạt",
      }),
    ).toBeInTheDocument();
    expect(verifyEmailActionCode).not.toHaveBeenCalled();
  });
});
