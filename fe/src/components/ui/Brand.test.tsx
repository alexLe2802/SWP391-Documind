import { render, screen } from "@testing-library/react";
import { Brand } from "./Brand";

describe("Brand", () => {
  it("links directly to the landing page", () => {
    render(<Brand />);

    expect(
      screen.getByRole("link", { name: "Trang chủ DocuMind" }),
    ).toHaveAttribute("href", "/");
  });
});
