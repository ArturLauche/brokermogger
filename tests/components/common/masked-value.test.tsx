import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MaskedValue } from "@/components/common/masked-value";

describe("MaskedValue", () => {
  it("shows only the masked preview before any interaction", () => {
    render(
      <MaskedValue
        maskedValue="p*****@e*******.invalid"
        value="person@example.invalid"
        label="email address"
      />
    );

    expect(screen.getByText("p*****@e*******.invalid")).toBeInTheDocument();
    expect(screen.queryByText("person@example.invalid")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show email address" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("reveals the full value on request and reports the reveal once", async () => {
    const user = userEvent.setup();
    const onReveal = vi.fn();

    render(
      <MaskedValue
        maskedValue="p*****@e*******.invalid"
        value="person@example.invalid"
        label="email address"
        onReveal={onReveal}
      />
    );

    await user.click(screen.getByRole("button", { name: "Show email address" }));

    expect(screen.getByText("person@example.invalid")).toBeInTheDocument();
    expect(onReveal).toHaveBeenCalledTimes(1);

    const hideButton = screen.getByRole("button", { name: "Hide email address" });
    expect(hideButton).toHaveAttribute("aria-pressed", "true");

    await user.click(hideButton);

    expect(screen.queryByText("person@example.invalid")).not.toBeInTheDocument();
    expect(screen.getByText("p*****@e*******.invalid")).toBeInTheDocument();
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("loads the value on demand when the caller fetches it lazily", async () => {
    const user = userEvent.setup();
    const loadValue = vi.fn().mockResolvedValue("+49 30 0000 1234");

    render(
      <MaskedValue
        maskedValue="+*******1234"
        loadValue={loadValue}
        label="phone number"
      />
    );

    await user.click(screen.getByRole("button", { name: "Show phone number" }));

    expect(await screen.findByText("+49 30 0000 1234")).toBeInTheDocument();
    expect(loadValue).toHaveBeenCalledTimes(1);
  });

  it("keeps the value hidden and explains the failure when loading fails", async () => {
    const user = userEvent.setup();
    const loadValue = vi.fn().mockRejectedValue(new Error("nope"));

    render(
      <MaskedValue
        maskedValue="+*******1234"
        loadValue={loadValue}
        label="phone number"
      />
    );

    await user.click(screen.getByRole("button", { name: "Show phone number" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The phone number could not be loaded."
    );
    expect(screen.getByText("+*******1234")).toBeInTheDocument();
  });

  it("offers the copy button only after the value was revealed", async () => {
    const user = userEvent.setup();

    render(
      <MaskedValue
        maskedValue="p*****@e*******.invalid"
        value="person@example.invalid"
        label="email address"
        copyable
      />
    );

    expect(
      screen.queryByRole("button", { name: "Copy email address" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show email address" }));

    expect(
      screen.getByRole("button", { name: "Copy email address" })
    ).toBeInTheDocument();
  });
});
