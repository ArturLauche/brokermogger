import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ListFilters({
  path,
  prefix,
  searchLabel,
  values,
  selects = [],
  hidden = {},
}: {
  path: string;
  prefix: string;
  searchLabel?: string;
  values: Record<string, string | undefined>;
  selects?: {
    name: string;
    label: string;
    options: { value: string; label: string }[];
  }[];
  hidden?: Record<string, string | undefined>;
}) {
  return (
    <form method="get" action={path} className="flex flex-wrap items-end gap-3">
      {Object.entries(hidden).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null
      )}
      {searchLabel ? (
        <div className="min-w-0 flex-1 basis-52 space-y-2">
          <Label htmlFor={`${prefix}-search`}>{searchLabel}</Label>
          <Input
            id={`${prefix}-search`}
            name="search"
            type="search"
            defaultValue={values.search ?? ""}
            maxLength={100}
          />
        </div>
      ) : null}
      {selects.map((select) => (
        <div key={select.name} className="min-w-0 space-y-2">
          <Label htmlFor={`${prefix}-${select.name}`}>{select.label}</Label>
          <select
            id={`${prefix}-${select.name}`}
            name={select.name}
            defaultValue={values[select.name] ?? "all"}
            className="h-11 max-w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm md:h-10"
          >
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      <Button type="submit" variant="outline">
        Apply filters
      </Button>
      <Link className="inline-flex min-h-11 items-center text-sm underline" href={path}>
        Reset
      </Link>
    </form>
  );
}
