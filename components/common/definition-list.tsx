/**
 * Term and description pairs for summary cards.
 *
 * Uses a real `dl` so that assistive technology can associate every value with
 * its label, which matters on the review screen where the user confirms what
 * is about to leave the instance.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface DefinitionListItem {
  term: string;
  description: ReactNode;
}

export interface DefinitionListProps {
  items: readonly DefinitionListItem[];
  /** "inline" puts the term next to the value on wide screens. */
  layout?: "stacked" | "inline";
  className?: string;
}

export function DefinitionList({
  items,
  layout = "stacked",
  className,
}: DefinitionListProps) {
  return (
    <dl
      data-slot="definition-list"
      data-layout={layout}
      className={cn("flex flex-col gap-3", className)}
    >
      {items.map((item) => (
        <div
          key={item.term}
          className={cn(
            "flex flex-col gap-0.5",
            layout === "inline" && "sm:grid sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4"
          )}
        >
          <dt className="text-sm text-muted-foreground">{item.term}</dt>
          <dd className="min-w-0 text-sm [overflow-wrap:anywhere]">{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}
