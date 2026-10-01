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
  headingLevel?: 1 | 2 | 3 | 4;
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
      className={cn("flex flex-col items-start gap-4 border-t py-6", className)}
    >
      <div className="flex max-w-prose flex-col gap-2">
        <div className="flex items-start gap-2">
          <TriangleAlertIcon
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-destructive"
          />
          <Heading className="font-heading text-lg font-semibold">{title}</Heading>
        </div>
        <p className="text-sm leading-6 text-pretty text-muted-foreground">
          {description}
        </p>
      </div>
      {errorCode ? (
        <p className="text-xs text-muted-foreground">
          Error code: <code className="font-mono text-xs">{errorCode}</code>
        </p>
      ) : null}
      {onRetry || action ? (
        <div className="flex flex-wrap items-center gap-2">
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
