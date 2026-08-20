import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { WhyWeAsk } from "@/components/common/why-we-ask";

describe("WhyWeAsk", () => {
  it("is reachable by keyboard and explains purpose, requirement and deletion", async () => {
    const user = userEvent.setup();
    render(
      <WhyWeAsk
        field="your date of birth"
        purpose="Brokers use it to tell you apart from people with the same name."
        requirement="optional"
        deletion="Clear the field in the data vault at any time."
      />
    );

    const trigger = screen.getByRole("button", {
      name: "Why we ask for your date of birth",
    });
    expect(screen.queryByText(/Brokers use it/)).not.toBeInTheDocument();

    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(await screen.findByText(/Brokers use it/)).toBeInTheDocument();
    expect(screen.getByText("Optional.")).toBeInTheDocument();
    expect(screen.getByText("Removing it later")).toBeInTheDocument();
    expect(
      screen.getByText("Clear the field in the data vault at any time.")
    ).toBeInTheDocument();
  });

  it("says plainly when a field cannot be skipped", async () => {
    const user = userEvent.setup();
    render(
      <WhyWeAsk
        field="your email address"
        purpose="It is the reply address of every request you send."
        requirement="required"
        deletion="Deleting the account removes it."
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Why we ask for your email address" })
    );

    expect(await screen.findByText("Required.")).toBeInTheDocument();
    expect(
      screen.getByText("You cannot continue without this field.")
    ).toBeInTheDocument();
  });
});
