/**
 * Link to a destination outside this instance.
 *
 * Always sets `rel="noreferrer noopener"` and tells assistive technology that
 * the link opens in a new tab, because an unannounced context switch is a
 * WCAG 3.2.5 problem.
 */
import type { ReactNode } from "react";
import { ExternalLinkIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { isPublicHttpUrl } from "@/lib/security/urls";

export interface ExternalLinkProps extends Omit<
  React.ComponentProps<"a">,
  "target" | "rel"
> {
  href: string;
  children: ReactNode;
  /** Hide the trailing icon when the surrounding element already shows one. */
  hideIcon?: boolean;
}

export function ExternalLink({
  href,
  children,
  hideIcon = false,
  className,
  ...props
}: ExternalLinkProps) {
  if (!isPublicHttpUrl(href))
    return (
      <span className={className}>
        {children} <span className="text-muted-foreground">(link unavailable)</span>
      </span>
    );
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      data-slot="external-link"
      className={cn(
        "inline-flex items-center gap-1 underline underline-offset-4 hover:text-primary",
        className
      )}
      {...props}
    >
      {children}
      {hideIcon ? null : <ExternalLinkIcon aria-hidden="true" className="size-3.5" />}
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
