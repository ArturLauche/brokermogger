/**
 * Page title block used at the top of every screen.
 *
 * Renders exactly one `h1` so that the heading order of a screen always starts
 * here. Breadcrumb and actions are slots, which keeps this component free of
 * routing and permission knowledge.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Usually a `Breadcrumb`. Rendered above the title. */
  breadcrumb?: ReactNode;
  /** Buttons or menus aligned to the end of the title row. */
  actions?: ReactNode;
  className?: string;
  /** Set when another element needs to reference the heading. */
  headingId?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  className,
  headingId,
}: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)} data-slot="page-header">
      {breadcrumb ? <div className="text-sm">{breadcrumb}</div> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1
            id={headingId}
            className="font-heading text-2xl leading-tight font-semibold text-balance [overflow-wrap:anywhere] md:text-[1.75rem]"
          >
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-sm leading-6 text-pretty text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
