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
  headingLevel = 2,
  className,
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;

  return (
    <div
      data-slot="empty-state"
      className={cn("flex flex-col items-start gap-4 border-t py-6", className)}
    >
      <div className="flex max-w-prose flex-col gap-2">
        <div className="flex items-start gap-2">
          <span aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground">
            <Icon className="size-5" />
          </span>
          <Heading className="font-heading text-base font-semibold">{title}</Heading>
        </div>
        <p className="text-sm leading-6 text-pretty text-muted-foreground">
          {description}
        </p>
      </div>
      {action || secondaryAction ? (
        <div className="flex flex-wrap items-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
