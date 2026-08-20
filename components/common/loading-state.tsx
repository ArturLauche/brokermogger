/**
 * Loading placeholders.
 *
 * Every placeholder carries `role="status"` plus visually hidden text so that
 * screen reader users are told that content is still loading instead of
 * hearing nothing at all. The animation is disabled by the reduced motion
 * media query in `app/globals.css`.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface LoadingStateProps {
  /** Announced text. Keep it specific, for example "Loading requests". */
  label?: string;
  className?: string;
}

export function LoadingState({ label = "Loading", className }: LoadingStateProps) {
  return (
    <div
      data-slot="loading-state"
      role="status"
      className={cn("flex flex-col gap-3", className)}
    >
      <span className="sr-only">{label}</span>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-full max-w-md" />
      <Skeleton className="h-4 w-full max-w-sm" />
    </div>
  );
}

export interface CardSkeletonProps {
  /** Number of text lines in the card body. */
  lines?: number;
  label?: string;
  className?: string;
}

export function CardSkeleton({
  lines = 3,
  label = "Loading",
  className,
}: CardSkeletonProps) {
  return (
    <div
      data-slot="card-skeleton"
      role="status"
      className={cn("flex flex-col gap-3 rounded-xl border p-4", className)}
    >
      <span className="sr-only">{label}</span>
      <Skeleton className="h-5 w-1/3" />
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn("h-4 w-full", index === lines - 1 && "w-2/3")}
        />
      ))}
    </div>
  );
}

export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  label?: string;
  className?: string;
}

export function TableSkeleton({
  rows = 5,
  columns = 4,
  label = "Loading",
  className,
}: TableSkeletonProps) {
  return (
    <div
      data-slot="table-skeleton"
      role="status"
      className={cn("flex flex-col gap-2 rounded-xl border p-4", className)}
    >
      <span className="sr-only">{label}</span>
      <div className="flex gap-3 border-b pb-3">
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className="flex gap-3 py-1.5">
          {Array.from({ length: columns }, (_, columnIndex) => (
            <Skeleton key={columnIndex} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export interface ListSkeletonProps {
  items?: number;
  label?: string;
  className?: string;
}

export function ListSkeleton({
  items = 4,
  label = "Loading",
  className,
}: ListSkeletonProps) {
  return (
    <div
      data-slot="list-skeleton"
      role="status"
      className={cn("flex flex-col gap-3", className)}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: items }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
