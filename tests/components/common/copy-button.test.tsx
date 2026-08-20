import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CopyButton } from "@/components/common/copy-button";

describe("CopyButton", () => {
  it("names what it copies and writes the value to the clipboard", async () => {
    const user = userEvent.setup();
    const onCopied = vi.fn();
    render(
      <CopyButton
        value="privacy@example.com"
        label="broker email address"
        onCopied={onCopied}
      />
    );

    const button = screen.getByRole("button", { name: "Copy broker email address" });
    await user.click(button);

    await expect(navigator.clipboard.readText()).resolves.toBe("privacy@example.com");
    expect(onCopied).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "broker email address copied" })
    ).toBeInTheDocument();
  });

  it("announces the result in a polite live region", async () => {
    const user = userEvent.setup();
    render(<CopyButton value="abc" label="request reference" />);

    await user.click(screen.getByRole("button", { name: "Copy request reference" }));

    expect(screen.getByText("request reference copied to the clipboard")).toHaveAttribute(
      "aria-live",
      "polite"
    );
  });
});
