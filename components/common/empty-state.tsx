/**
 * Empty state for lists, tables and cards.
 *
 * Every screen in the product needs one, so the shape is fixed: an icon that
 * is decorative only, a heading, an explanation of what the user can do next
 * and at most two actions. The heading level is a prop because an empty state
 * can sit under an `h1` or inside a card that already has an `h2`.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Primary action, usually a `Button`. */
  action?: ReactNode;
  /** Secondary action, usually a link styled as a ghost button. */
  secondaryAction?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  headingLevel = 3,
  className,
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;

  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <Icon className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <Heading className="font-heading text-base font-medium">{title}</Heading>
        <p className="mx-auto max-w-md text-sm text-pretty text-muted-foreground">
          {description}
        </p>
      </div>
      {action || secondaryAction ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
