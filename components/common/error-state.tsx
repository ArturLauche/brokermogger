/**
 * Error state for failed loads and failed actions.
 *
 * The description explains what happened in plain language, the error code is
 * the stable identifier a user can quote when asking the operator for help.
 * The code is shown in small monospace so it can be copied exactly.
 */
import type { ReactNode } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  title?: string;
  description: string;
  /** Stable error code, for example `VALIDATION_FAILED` or a request digest. */
  errorCode?: string;
  /** Rendered as a "Try again" button when provided. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Additional action, for example a link back to a safe screen. */
  action?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  description,
  errorCode,
  onRetry,
  retryLabel = "Try again",
  action,
  headingLevel = 2,
  className,
}: ErrorStateProps) {
  const Heading = `h${headingLevel}` as const;

  return (
    <div
      data-slot="error-state"
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border px-6 py-10 text-center",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive"
      >
        <TriangleAlertIcon className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <Heading className="font-heading text-base font-medium">{title}</Heading>
        <p className="mx-auto max-w-md text-sm text-pretty text-muted-foreground">
          {description}
        </p>
      </div>
      {errorCode ? (
        <p className="text-xs text-muted-foreground">
          Error code: <code className="font-mono text-xs">{errorCode}</code>
        </p>
      ) : null}
      {onRetry || action ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onRetry ? (
            <Button type="button" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}
