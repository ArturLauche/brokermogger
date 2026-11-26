"use client";

/**
 * Generic table wrapper around TanStack Table v9 (v8-compatible legacy API).
 *
 * Accessibility contract of this component:
 *   - the table always has a caption (visually hidden by default),
 *   - header cells are `th` with `scope="col"`,
 *   - sortable columns are sorted through a real button and the header carries
 *     `aria-sort`, so the current order is exposed and not only painted,
 *   - the row count and the current page are announced through a polite live
 *     region,
 *   - empty and loading states replace the rows instead of the whole table, so
 *     the toolbar stays reachable.
 *
 * Column headers of sortable columns must be plain text: they are placed
 * inside the sort button.
 */
import * as React from "react";
import {
  flexRender,
  type ColumnVisibilityState,
  type RowData,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useLegacyTable,
  type LegacyColumnDef,
} from "@tanstack/react-table/legacy";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  SlidersHorizontalIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface DataTableProps<TData extends RowData> {
  columns: LegacyColumnDef<TData>[];
  data: TData[];
  /** Accessible name of the table. Always rendered as a caption element. */
  caption: string;
  /** Shows the caption on screen instead of only to assistive technology. */
  captionVisible?: boolean;
  isLoading?: boolean;
  loadingRowCount?: number;
  /** Replaces the default "No results" message. */
  empty?: React.ReactNode;
  enableSearch?: boolean;
  searchLabel?: string;
  searchPlaceholder?: string;
  enableColumnVisibility?: boolean;
  enablePagination?: boolean;
  pageSize?: number;
  enableRowSelection?: boolean;
  /** Used in the row checkbox name: "Select Acme Data Inc". */
  getRowLabel?: (row: TData) => string;
  getRowId?: (row: TData, index: number) => string;
  onRowSelectionChange?: (rows: TData[]) => void;
  /** Extra filters rendered next to the search field. */
  toolbar?: React.ReactNode;
  className?: string;
}

function humanizeColumnId(id: string): string {
  const spaced = id
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  caption,
  captionVisible = false,
  isLoading = false,
  loadingRowCount = 5,
  empty,
  enableSearch = true,
  searchLabel = "Search",
  searchPlaceholder = "Search",
  enableColumnVisibility = true,
  enablePagination = true,
  pageSize = 10,
  enableRowSelection = false,
  getRowLabel,
  getRowId,
  onRowSelectionChange,
  toolbar,
  className,
}: DataTableProps<TData>) {
  const searchId = React.useId();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>(
    {}
  );
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const resolvedColumns = React.useMemo<LegacyColumnDef<TData>[]>(() => {
    if (!enableRowSelection) {
      return columns;
    }

    const selectionColumn: LegacyColumnDef<TData> = {
      id: "select",
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? "indeterminate"
                : false
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(value === true)}
          aria-label="Select all rows on this page"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(value === true)}
          aria-label={getRowLabel ? `Select ${getRowLabel(row.original)}` : "Select row"}
        />
      ),
    };

    return [selectionColumn, ...columns];
  }, [columns, enableRowSelection, getRowLabel]);

  const table = useLegacyTable<TData>({
    data,
    columns: resolvedColumns,
    state: { sorting, globalFilter, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    enableRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(enablePagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    ...(getRowId ? { getRowId } : {}),
    initialState: { pagination: { pageIndex: 0, pageSize } },
  });

  const selectionCallback = React.useRef(onRowSelectionChange);
  React.useEffect(() => {
    selectionCallback.current = onRowSelectionChange;
  }, [onRowSelectionChange]);

  React.useEffect(() => {
    selectionCallback.current?.(
      table.getSelectedRowModel().rows.map((row) => row.original)
    );
  }, [rowSelection, table]);

  const rows = table.getRowModel().rows;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const hideableColumns = table
    .getAllLeafColumns()
    .filter((column) => column.getCanHide());
  const visibleColumnCount = table.getVisibleLeafColumns().length;

  return (
    <div className={cn("flex min-w-0 flex-col gap-4", className)} data-slot="data-table">
      {enableSearch || enableColumnVisibility || toolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          {enableSearch ? (
            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
              <Label htmlFor={searchId} className="sr-only">
                {searchLabel}
              </Label>
              <Input
                id={searchId}
                type="search"
                value={globalFilter}
                placeholder={searchPlaceholder}
                onChange={(event) => setGlobalFilter(event.target.value)}
              />
            </div>
          ) : null}
          {toolbar}
          {enableColumnVisibility && hideableColumns.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline">
                  <SlidersHorizontalIcon aria-hidden="true" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hideableColumns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(value === true)}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {humanizeColumnId(column.id)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}

      <div className="min-w-0 rounded-lg border">
        <Table scrollLabel={caption}>
          <TableCaption className={cn(captionVisible ? "mt-3 mb-3" : "sr-only")}>
            {caption}
          </TableCaption>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const content = header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext());

                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      aria-sort={
                        canSort
                          ? sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : "none"
                          : undefined
                      }
                      className="px-3"
                    >
                      {canSort ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="-ml-2"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {content}
                          {sorted === "asc" ? (
                            <ArrowUpIcon aria-hidden="true" />
                          ) : sorted === "desc" ? (
                            <ArrowDownIcon aria-hidden="true" />
                          ) : (
                            <ChevronsUpDownIcon aria-hidden="true" />
                          )}
                          <span className="sr-only">
                            {sorted === "asc"
                              ? ", sorted ascending, activate to sort descending"
                              : sorted === "desc"
                                ? ", sorted descending, activate to remove sorting"
                                : ", activate to sort ascending"}
                          </span>
                        </Button>
                      ) : (
                        content
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: loadingRowCount }, (_, rowIndex) => (
                  <TableRow key={`loading-${rowIndex}`}>
                    {Array.from({ length: visibleColumnCount }, (_, cellIndex) => (
                      <TableCell key={cellIndex} className="px-3 py-2.5">
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : null}

            {!isLoading && rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleColumnCount}
                  className="h-24 px-3 text-center whitespace-normal text-muted-foreground"
                >
                  {empty ?? "No results found."}
                </TableCell>
              </TableRow>
            ) : null}

            {!isLoading
              ? rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-3 py-2.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {isLoading
            ? "Loading rows"
            : enablePagination && table.getPageCount() > 1
              ? `Page ${table.getState().pagination.pageIndex + 1} of ${table.getPageCount()}, ${filteredCount} rows`
              : `${filteredCount} ${filteredCount === 1 ? "row" : "rows"}`}
          {enableRowSelection
            ? `, ${table.getSelectedRowModel().rows.length} selected`
            : ""}
        </p>
        {enablePagination && table.getPageCount() > 1 ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <span aria-hidden="true">Previous</span>
              <span className="sr-only">Previous page</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              <span aria-hidden="true">Next</span>
              <span className="sr-only">Next page</span>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
