import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const schema = z.object({
  email: z.string().min(1, "Enter the address that brokers should reply to."),
});

function TestForm({ withDescription = true }: { withDescription?: boolean }) {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => {})} noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contact email address</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              {withDescription ? (
                <FormDescription>
                  Used as the reply address on outgoing requests.
                </FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />
        <button type="submit">Save</button>
      </form>
    </Form>
  );
}

describe("Form", () => {
  it("labels the control and links its description", () => {
    render(<TestForm />);

    const input = screen.getByLabelText("Contact email address");
    const description = screen.getByText(
      "Used as the reply address on outgoing requests."
    );

    expect(input).toBeInTheDocument();
    expect(input.getAttribute("aria-describedby")).toBe(description.id);
    expect(input).toHaveAttribute("aria-invalid", "false");
  });

  it("does not point aria-describedby at a description that is not rendered", () => {
    render(<TestForm withDescription={false} />);

    const input = screen.getByLabelText("Contact email address");

    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("renders the validation error, marks the control invalid and links the message", async () => {
    const user = userEvent.setup();
    render(<TestForm />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    const message = await screen.findByRole("alert");
    expect(message).toHaveTextContent("Enter the address that brokers should reply to.");

    const input = screen.getByLabelText("Contact email address");
    expect(input).toHaveAttribute("aria-invalid", "true");

    const describedBy = input.getAttribute("aria-describedby")?.split(" ") ?? [];
    const description = screen.getByText(
      "Used as the reply address on outgoing requests."
    );
    expect(describedBy).toContain(description.id);
    expect(describedBy).toContain(message.id);
  });

  it("clears the error state once the field becomes valid", async () => {
    const user = userEvent.setup();
    render(<TestForm />);

    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");

    const input = screen.getByLabelText("Contact email address");
    await user.type(input, "person@example.invalid");

    expect(await screen.findByLabelText("Contact email address")).toHaveAttribute(
      "aria-invalid",
      "false"
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
