export function ListResultSummary({
  shown,
  total,
  noun,
  order = "Newest first",
}: {
  shown: number;
  total: number;
  noun: string;
  order?: string;
}) {
  return (
    <p className="text-sm text-muted-foreground">
      Showing {shown} of {total} matching {noun}
      {total === 1 ? "" : "s"}. {order}.
    </p>
  );
}
