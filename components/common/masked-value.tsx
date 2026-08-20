"use client";

/**
 * Masked personal identifier with an explicit reveal action.
 *
 * The full value is never part of the initial render. It only appears after
 * the user presses "Show", and `onReveal` gives the caller the hook it needs
 * to write the `identifier.revealed` audit event. `loadValue` exists for the
 * normal case where the decrypted value is fetched on demand instead of being
 * shipped to the browser with the page.
 */
import * as React from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import { CopyButton } from "@/components/common/copy-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MaskedValueProps {
  /** Masked preview, safe to render at any time. */
  maskedValue: string;
  /** What is behind the mask, used in accessible names: "email address". */
  label: string;
  /** Full value when the caller already holds it. */
  value?: string;
  /** Fetches the full value the first time the user reveals it. */
  loadValue?: () => Promise<string>;
  /** Called on every reveal so the caller can record an audit event. */
  onReveal?: () => void;
  /** Adds a copy button next to the revealed value. */
  copyable?: boolean;
  className?: string;
}

export function MaskedValue({
  maskedValue,
  label,
  value,
  loadValue,
  onReveal,
  copyable = false,
  className,
}: MaskedValueProps) {
  const [revealed, setRevealed] = React.useState(false);
  const [loadedValue, setLoadedValue] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fullValue = value ?? loadedValue;

  async function handleToggle() {
    if (revealed) {
      setRevealed(false);
      return;
    }

    if (fullValue === null && loadValue) {
      setIsLoading(true);
      setError(null);
      try {
        const loaded = await loadValue();
        setLoadedValue(loaded);
        setRevealed(true);
        onReveal?.();
      } catch {
        setError(`The ${label} could not be loaded. Please try again.`);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    setRevealed(true);
    onReveal?.();
  }

  const canReveal = fullValue !== null || Boolean(loadValue);
  const shown = revealed && fullValue !== null ? fullValue : maskedValue;

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <span
        data-slot="masked-value"
        data-revealed={revealed}
        className="font-mono text-sm break-all"
      >
        {shown}
      </span>
      {canReveal ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-pressed={revealed}
          disabled={isLoading}
          onClick={handleToggle}
        >
          {revealed ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
          <span aria-hidden="true">{revealed ? "Hide" : "Show"}</span>
          <span className="sr-only">{revealed ? `Hide ${label}` : `Show ${label}`}</span>
        </Button>
      ) : null}
      {copyable && revealed && fullValue !== null ? (
        <CopyButton value={fullValue} label={label} size="xs" />
      ) : null}
      {isLoading ? (
        <span role="status" className="text-xs text-muted-foreground">
          Loading
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
