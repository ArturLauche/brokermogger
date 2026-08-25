import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PublicFooter } from "@/components/layout/public-footer";
import { DEFAULT_SECURITY_ADVISORIES_URL } from "@/lib/config/site";

describe("PublicFooter", () => {
  it("does not advertise a placeholder security mailbox", () => {
    render(<PublicFooter />);

    expect(screen.queryByText(/example\.invalid/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /github security advisories/i })
    ).toHaveAttribute("href", DEFAULT_SECURITY_ADVISORIES_URL);
  });

  it("uses the operator mailbox when one is configured", () => {
    render(<PublicFooter securityContactEmail="security@operators.example" />);

    const mailbox = screen.getByRole("link", { name: "security@operators.example" });
    expect(mailbox).toHaveAttribute("href", "mailto:security@operators.example");
    expect(
      screen.queryByRole("link", { name: /github security advisories/i })
    ).not.toBeInTheDocument();
  });
});
