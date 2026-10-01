/**
 * Chronological event list, used for the history of a removal request.
 *
 * Timestamps arrive pre-formatted from the server so that the rendered text is
 * identical on the server and in the browser and does not depend on the
 * browser locale. `dateTime` carries the machine readable ISO value.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface TimelineEvent {
  id: string;
  title: string;
  /** Formatted for display, for example "12 March 2026, 14:05 UTC". */
  timestamp: string;
  /** ISO 8601 value for the `datetime` attribute. */
  dateTime?: string;
  /** Who caused the event, for example "You", "System" or "Broker". */
  actor?: string;
  detail?: ReactNode;
  /** Rendered next to the title, usually a `StatusBadge`. */
  status?: ReactNode;
}

export interface TimelineProps {
  events: readonly TimelineEvent[];
  /** Accessible name of the list, for example "Request history". */
  label: string;
  className?: string;
}

export function Timeline({ events, label, className }: TimelineProps) {
  return (
    <ol
      aria-label={label}
      data-slot="timeline"
      className={cn("flex min-w-0 flex-col [overflow-wrap:anywhere]", className)}
    >
      {events.map((event, index) => (
        <li key={event.id} className="flex min-w-0 gap-3">
          <div className="flex flex-col items-center" aria-hidden="true">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground" />
            {index < events.length - 1 ? (
              <span className="w-px flex-1 bg-border" />
            ) : null}
          </div>
          <div
            className={cn(
              "flex min-w-0 flex-col gap-1",
              index < events.length - 1 && "pb-5"
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{event.title}</p>
              {event.status}
            </div>
            <p className="text-xs text-muted-foreground">
              <time dateTime={event.dateTime}>{event.timestamp}</time>
              {event.actor ? <span> by {event.actor}</span> : null}
            </p>
            {event.detail ? (
              <div className="text-sm text-muted-foreground">{event.detail}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
