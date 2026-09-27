"use client";
import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
export function SubmitButton({
  children,
  pendingText = "Saving…",
  disabled,
  ...props
}: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button {...props} type="submit" disabled={disabled || pending} aria-busy={pending}>
      {pending ? pendingText : children}
    </Button>
  );
}
