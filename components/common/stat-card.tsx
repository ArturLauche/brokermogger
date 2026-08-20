/**
 * Single metric tile for the dashboard.
 *
 * The label is read before the value, and `trend` is plain text rather than an
 * arrow so that a change is never signalled by colour or shape alone.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Short explanation shown under the value. */
  hint?: string;
  /** Plain text change description, for example "3 more than last month". */
  trend?: string;
  icon?: LucideIcon;
  /** Link or button rendered at the bottom of the card. */
  action?: ReactNode;
  className?: string;
}

export function StatCard({
  label,
  value,
  hint,
  trend,
  icon: Icon,
  action,
  className,
}: StatCardProps) {
  return (
    <Card data-slot="stat-card" className={cn("h-full", className)}>
      <CardContent className="flex h-full flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{label}</p>
          {Icon ? (
            <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
          ) : null}
        </div>
        <p className="font-heading text-2xl leading-tight font-semibold">{value}</p>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
        {trend ? <p className="text-sm text-muted-foreground">{trend}</p> : null}
        {action ? <div className="mt-auto pt-2">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
