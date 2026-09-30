import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ConfirmSubmitButton } from "@/components/common/confirm-submit-button";

it("returns keyboard focus to the invoking button when cancellation closes the dialog", async () => {
  const user = userEvent.setup();
  const action = vi.fn();
  render(
    <ConfirmSubmitButton
      action={action}
      hidden={{}}
      label="Delete profile"
      title="Confirm profile deletion"
      description="Erase this profile."
      confirmationPhrase="DELETE"
      destructive
    />
  );
  const trigger = screen.getByRole("button", { name: "Delete profile" });
  await user.click(trigger);
  const cancel = screen.getByRole("button", { name: "Cancel" });
  expect(cancel).toHaveFocus();
  await user.click(cancel);
  expect(trigger).toHaveFocus();
  expect(action).not.toHaveBeenCalled();
});
