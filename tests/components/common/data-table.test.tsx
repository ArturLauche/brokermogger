import type { ColumnDef } from "@tanstack/react-table";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "@/components/common/data-table";

interface BrokerRow {
  id: string;
  name: string;
  category: string;
}

const columns: ColumnDef<BrokerRow>[] = [
  { id: "name", accessorKey: "name", header: "Broker" },
  { id: "category", accessorKey: "category", header: "Category", enableSorting: false },
];

const rows: BrokerRow[] = [
  { id: "1", name: "Northwind Directory", category: "People search" },
  { id: "2", name: "Acme Data Exchange", category: "Marketing list" },
  { id: "3", name: "Mercury Insights", category: "Data enrichment" },
];

function bodyRowNames(): string[] {
  const table = screen.getByRole("table");
  const bodyRows = within(table).getAllByRole("row").slice(1);
  return bodyRows.map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");
}

describe("DataTable", () => {
  it("renders every row with a caption that names the table", () => {
    render(<DataTable columns={columns} data={rows} caption="Broker directory" />);

    expect(screen.getByRole("table", { name: "Broker directory" })).toBeInTheDocument();
    expect(bodyRowNames()).toEqual([
      "Northwind Directory",
      "Acme Data Exchange",
      "Mercury Insights",
    ]);
  });

  it("sorts when the column header is activated and exposes the order", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={rows} caption="Broker directory" />);

    const header = screen.getByRole("columnheader", { name: /Broker/ });
    expect(header).toHaveAttribute("aria-sort", "none");

    await user.click(within(header).getByRole("button"));

    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(bodyRowNames()).toEqual([
      "Acme Data Exchange",
      "Mercury Insights",
      "Northwind Directory",
    ]);

    await user.click(within(header).getByRole("button"));

    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(bodyRowNames()).toEqual([
      "Northwind Directory",
      "Mercury Insights",
      "Acme Data Exchange",
    ]);
  });

  it("does not offer sorting for columns that disabled it", () => {
    render(<DataTable columns={columns} data={rows} caption="Broker directory" />);

    const header = screen.getByRole("columnheader", { name: "Category" });
    expect(header).not.toHaveAttribute("aria-sort");
    expect(within(header).queryByRole("button")).not.toBeInTheDocument();
  });

  it("filters through the search field", async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        columns={columns}
        data={rows}
        caption="Broker directory"
        searchLabel="Search brokers"
      />
    );

    await user.type(screen.getByLabelText("Search brokers"), "mercury");

    expect(bodyRowNames()).toEqual(["Mercury Insights"]);
  });

  it("shows the empty state when there is nothing to display", () => {
    render(<DataTable columns={columns} data={[]} caption="Broker directory" />);

    expect(screen.getByText("No results found.")).toBeInTheDocument();
  });

  it("shows a custom empty state when the caller supplies one", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        caption="Broker directory"
        empty={<span>No broker matches this filter.</span>}
      />
    );

    expect(screen.getByText("No broker matches this filter.")).toBeInTheDocument();
  });

  it("announces the loading state instead of rendering rows", () => {
    render(
      <DataTable columns={columns} data={rows} caption="Broker directory" isLoading />
    );

    expect(screen.getByText("Loading rows")).toBeInTheDocument();
    expect(screen.queryByText("Northwind Directory")).not.toBeInTheDocument();
  });

  it("reports the selected rows to the caller", async () => {
    const user = userEvent.setup();
    const onRowSelectionChange = vi.fn();

    render(
      <DataTable
        columns={columns}
        data={rows}
        caption="Broker directory"
        enableRowSelection
        getRowLabel={(row) => row.name}
        onRowSelectionChange={onRowSelectionChange}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: "Select Acme Data Exchange" }));

    expect(onRowSelectionChange).toHaveBeenLastCalledWith([rows[1]]);
  });

  it("paginates long lists and keeps the page state readable", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 12 }, (_, index) => ({
      id: String(index),
      name: `Broker ${String(index).padStart(2, "0")}`,
      category: "People search",
    }));

    render(
      <DataTable columns={columns} data={many} caption="Broker directory" pageSize={10} />
    );

    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
    expect(bodyRowNames()).toHaveLength(10);

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
    expect(bodyRowNames()).toHaveLength(2);
  });
});
