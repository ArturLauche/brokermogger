"use client";

/**
 * Copy to clipboard button.
 *
 * The accessible name always says what is copied ("Copy broker email address"),
 * and the result is announced through a polite live region instead of a toast
 * so that copying stays a quiet, local interaction.
 */
import * as React from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CopyButtonProps {
  value: string;
  /** What is being copied, used in the accessible name. */
  label: string;
  /** Renders "Copy" / "Copied" next to the icon. */
  showLabel?: boolean;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  onCopied?: () => void;
  className?: string;
}

export function CopyButton({
  value,
  label,
  showLabel = false,
  variant = "ghost",
  size,
  onCopied,
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    },
    []
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopied?.();
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied or unavailable. The value stays on
      // screen, so there is nothing to recover from and nothing to log.
      setCopied(false);
    }
  }

  return (
    <span className={cn("inline-flex items-center", className)}>
      <Button
        type="button"
        variant={variant}
        size={size ?? (showLabel ? "sm" : "icon-sm")}
        onClick={handleCopy}
        data-copied={copied}
      >
        {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
        {showLabel ? <span aria-hidden="true">{copied ? "Copied" : "Copy"}</span> : null}
        <span className="sr-only">{copied ? `${label} copied` : `Copy ${label}`}</span>
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? `${label} copied to the clipboard` : ""}
      </span>
    </span>
  );
}
