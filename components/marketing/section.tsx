/**
 * Layout wrapper for the landing page sections.
 *
 * Keeps every section on the same grid and guarantees the heading order: the
 * page has one `h1` in the hero, each section owns exactly one `h2`, and the
 * cards inside a section use `h3`.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface SectionProps {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function Section({
  id,
  title,
  description,
  children,
  className,
  contentClassName,
}: SectionProps) {
  const headingId = `${id}-heading`;

  return (
    <section id={id} aria-labelledby={headingId} className={cn("border-t", className)}>
      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
        <div className="flex flex-col gap-3">
          <h2
            id={headingId}
            className="font-heading text-xl font-semibold text-balance md:text-2xl"
          >
            {title}
          </h2>
          {description ? (
            <p className="max-w-3xl text-pretty text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className={cn("mt-8", contentClassName)}>{children}</div>
      </div>
    </section>
  );
}
