"use client";

/**
 * Confirmation dialog for actions that cannot be undone.
 *
 * Two levels of friction: a plain confirmation for reversible actions and a
 * typed confirmation for destructive ones. The confirm button stays disabled
 * until the typed phrase matches exactly, so the user has to read what they
 * are about to do. Focus starts on "Cancel", which is the safe choice.
 */
import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What happens when the action runs. */
  description: string;
  /** Bullet list of consequences, rendered above the confirmation. */
  consequences?: readonly string[];
  confirmLabel: string;
  cancelLabel?: string;
  /** Exact phrase the user has to type before confirming. */
  confirmationPhrase?: string;
  /** Marks the action as destructive in the button styling. */
  destructive?: boolean;
  /** Disables the confirm button while the action runs. */
  pending?: boolean;
  /** Retain the dialog until its asynchronous action reports completion. */
  keepOpenOnConfirm?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void;
  /** Explicit target when the controlled dialog has no Radix trigger. */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  consequences,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmationPhrase,
  destructive = false,
  pending = false,
  keepOpenOnConfirm = false,
  errorMessage,
  onConfirm,
  returnFocusRef,
  className,
}: ConfirmDialogProps) {
  const inputId = React.useId();
  const [typed, setTyped] = React.useState("");

  function handleOpenChange(nextOpen: boolean) {
    if (pending) return;
    if (!nextOpen) {
      setTyped("");
    }
    onOpenChange(nextOpen);
  }

  const phraseMatches =
    confirmationPhrase === undefined || typed.trim() === confirmationPhrase;
  const confirmDisabled = pending || !phraseMatches;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        className={cn("sm:max-w-md", className)}
        aria-busy={pending}
        onCloseAutoFocus={(event) => {
          if (returnFocusRef?.current) {
            event.preventDefault();
            returnFocusRef.current.focus();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {consequences && consequences.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {consequences.map((consequence) => (
              <li key={consequence}>{consequence}</li>
            ))}
          </ul>
        ) : null}

        {confirmationPhrase !== undefined ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={inputId}>
              Type <span className="font-mono">{confirmationPhrase}</span> to confirm
            </Label>
            <Input
              id={inputId}
              value={typed}
              autoComplete="off"
              disabled={pending}
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
        ) : null}

        {errorMessage ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={confirmDisabled}
            onClick={(event) => {
              if (confirmDisabled) {
                event.preventDefault();
                return;
              }
              if (keepOpenOnConfirm) event.preventDefault();
              onConfirm();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
