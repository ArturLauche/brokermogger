"use client";

import { useRef, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";

export function ConfirmSubmitButton({
  action,
  hidden,
  label,
  title,
  description,
  consequences,
  confirmationPhrase,
  destructive = false,
}: {
  action: (formData: FormData) => Promise<void>;
  hidden: Record<string, string>;
  label: string;
  title: string;
  description: string;
  consequences?: readonly string[];
  confirmationPhrase?: string;
  destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant={destructive ? "destructive" : "outline"}
        disabled={pending}
        onClick={() => {
          setErrorMessage(null);
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <ConfirmDialog
        key={open ? "confirmation" : "closed"}
        open={open}
        onOpenChange={setOpen}
        returnFocusRef={triggerRef}
        title={title}
        description={description}
        {...(consequences ? { consequences } : {})}
        {...(confirmationPhrase ? { confirmationPhrase } : {})}
        confirmLabel={pending ? "Working…" : label}
        pending={pending}
        keepOpenOnConfirm
        errorMessage={errorMessage}
        destructive={destructive}
        onConfirm={() => {
          const formData = new FormData();
          for (const [key, value] of Object.entries(hidden)) {
            formData.set(key, value);
          }
          startTransition(async () => {
            setErrorMessage(null);
            try {
              await action(formData);
              setOpen(false);
            } catch {
              setErrorMessage(
                "We could not confirm that this action completed. Check the current state before trying again."
              );
            }
          });
        }}
      />
    </>
  );
}
