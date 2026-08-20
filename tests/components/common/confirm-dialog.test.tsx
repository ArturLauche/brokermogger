import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "@/components/common/confirm-dialog";

describe("ConfirmDialog", () => {
  it("keeps the confirm button disabled until the typed phrase matches", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Delete this profile"
        description="The profile and every identifier stored for it are removed."
        consequences={[
          "Open requests for this profile are closed.",
          "Evidence files that belong to it are deleted.",
        ]}
        confirmationPhrase="DELETE"
        confirmLabel="Delete profile"
        destructive
        onConfirm={onConfirm}
      />
    );

    const confirmButton = screen.getByRole("button", { name: "Delete profile" });
    expect(confirmButton).toBeDisabled();

    const input = screen.getByLabelText(/Type DELETE to confirm/);
    await user.type(input, "delete");
    expect(confirmButton).toBeDisabled();

    await user.clear(input);
    await user.type(input, "DELETE");
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("lists the consequences and describes the dialog", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Close this request"
        description="No further follow up is prepared for it."
        consequences={["The request stays visible in the history."]}
        confirmLabel="Close request"
        onConfirm={() => {}}
      />
    );

    expect(screen.getByRole("alertdialog")).toHaveAccessibleDescription(
      "No further follow up is prepared for it."
    );
    expect(
      screen.getByText("The request stays visible in the history.")
    ).toBeInTheDocument();
  });

  it("confirms directly when no phrase is required", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Close this request"
        description="No further follow up is prepared for it."
        confirmLabel="Close request"
        onConfirm={onConfirm}
      />
    );

    const confirmButton = screen.getByRole("button", { name: "Close request" });
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("blocks the confirm button while the action is running", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Close this request"
        description="No further follow up is prepared for it."
        confirmLabel="Close request"
        pending
        onConfirm={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: "Close request" })).toBeDisabled();
  });
});
