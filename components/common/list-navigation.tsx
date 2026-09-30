import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ListNavigation({
  path,
  filters,
  cursor,
  nextCursor,
  label,
  cursorName = "cursor",
}: {
  path: string;
  filters: Record<string, string | undefined>;
  cursor?: string | undefined;
  nextCursor: string | null;
  label: string;
  cursorName?: string;
}) {
  const first = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value && key !== cursorName) first.set(key, value);
  const next = new URLSearchParams(first);
  if (nextCursor) next.set(cursorName, nextCursor);
  if (!cursor && !nextCursor) return null;
  return (
    <nav aria-label={`${label} pages`} className="flex flex-wrap gap-3">
      {cursor ? (
        <Button asChild variant="outline">
          <Link href={`${path}?${first}`}>First page</Link>
        </Button>
      ) : null}
      {nextCursor ? (
        <Button asChild variant="outline">
          <Link href={`${path}?${next}`}>
            Next page<span className="sr-only"> of {label.toLowerCase()}</span>
          </Link>
        </Button>
      ) : null}
    </nav>
  );
}
