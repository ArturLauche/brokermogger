"use client";

import { useState } from "react";

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

  return (
    <>
      <Button
        type="button"
        variant={destructive ? "destructive" : "outline"}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        {...(consequences ? { consequences } : {})}
        {...(confirmationPhrase ? { confirmationPhrase } : {})}
        confirmLabel={label}
        destructive={destructive}
        onConfirm={() => {
          const formData = new FormData();
          for (const [key, value] of Object.entries(hidden)) {
            formData.set(key, value);
          }
          void action(formData);
          setOpen(false);
        }}
      />
    </>
  );
}
