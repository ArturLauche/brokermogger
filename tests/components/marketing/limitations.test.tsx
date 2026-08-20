import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Limitations } from "@/components/marketing/limitations";

/**
 * The limitations section is the honest part of the landing page, so its
 * statements are treated as a contract rather than as copy.
 */
describe("Limitations", () => {
  it("renders as a labelled section with a heading", () => {
    render(<Limitations />);

    const section = screen.getByRole("region", {
      name: "What this product cannot do",
    });
    expect(section).toHaveAttribute("id", "limitations");
    expect(
      screen.getByRole("heading", { level: 2, name: "What this product cannot do" })
    ).toBeInTheDocument();
  });

  it("states every required limitation", () => {
    render(<Limitations />);

    for (const title of [
      "A broker can refuse",
      "Some jurisdictions provide no deletion right",
      "This is not legal advice",
      "Success is not guaranteed",
      "The shipped broker list is demo data",
    ]) {
      expect(screen.getByRole("heading", { level: 3, name: title })).toBeInTheDocument();
    }
  });

  it("makes no promise about the outcome", () => {
    const { container } = render(<Limitations />);
    const text = container.textContent ?? "";

    expect(text).toMatch(/not a law firm/i);
    expect(text).toMatch(/demonstration data/i);
    expect(text).not.toMatch(/guaranteed removal/i);
    expect(text).not.toMatch(/\d+\s?%/);
  });
});
