import { act, render, screen, waitFor } from "@testing-library/react";
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

it("keeps confirmation visible and blocks repeat submission while the action is pending", async () => {
  const user = userEvent.setup();
  let complete!: () => void;
  const action = vi.fn<(data: FormData) => Promise<void>>(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      })
  );
  render(
    <ConfirmSubmitButton
      action={action}
      hidden={{ id: "owned-profile" }}
      label="Delete profile"
      title="Confirm deletion"
      description="Erase this profile."
    />
  );
  await user.click(screen.getByRole("button", { name: "Delete profile" }));
  await user.click(screen.getByRole("button", { name: "Delete profile" }));
  expect(screen.getByRole("alertdialog")).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("alertdialog")).toBeVisible();
  expect(action).toHaveBeenCalledTimes(1);
  expect(action.mock.calls[0]?.[0]?.get("id")).toBe("owned-profile");
  await act(async () => complete());
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Delete profile" })).toHaveFocus();
});

it("shows a safe error and preserves typed confirmation for an explicit retry", async () => {
  const user = userEvent.setup();
  const rejected = Promise.reject(new Error("private database operation details"));
  void rejected.catch(() => {});
  const action = vi.fn().mockReturnValueOnce(rejected).mockResolvedValueOnce(undefined);
  render(
    <ConfirmSubmitButton
      action={action}
      hidden={{}}
      label="Delete profile"
      title="Confirm deletion"
      description="Erase this profile."
      confirmationPhrase="DELETE"
    />
  );
  await user.click(screen.getByRole("button", { name: "Delete profile" }));
  await user.type(screen.getByLabelText(/Type DELETE to confirm/), "DELETE");
  await user.click(screen.getByRole("button", { name: "Delete profile" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Check the current state before trying again."
  );
  expect(
    screen.queryByText("private database operation details")
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText(/Type DELETE to confirm/)).toHaveValue("DELETE");
  // React can publish the error before the async transition releases pending.
  // Retry becomes available only after both parts of the action have settled.
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Delete profile" })).toBeEnabled()
  );
  await user.click(screen.getByRole("button", { name: "Delete profile" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(action).toHaveBeenCalledTimes(2);
  await user.click(screen.getByRole("button", { name: "Delete profile" }));
  expect(screen.getByLabelText(/Type DELETE to confirm/)).toHaveValue("");
  expect(screen.getByRole("button", { name: "Delete profile" })).toBeDisabled();
});
