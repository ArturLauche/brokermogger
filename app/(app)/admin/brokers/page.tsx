import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { listBrokerAdministration } from "@/lib/db/repositories/adminBrokers";

export const metadata = { title: "Admin brokers" };
export default async function AdminBrokersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; cursor?: string }>;
}) {
  const actor = await requireRole("MAINTAINER");
  const filters = await searchParams;
  const page = await listBrokerAdministration(actor, filters);
  const next = new URLSearchParams({
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(page.nextCursor ? { cursor: page.nextCursor } : {}),
  });
  return (
    <>
      <PageHeader
        title="Brokers"
        description="Maintain sourced entries, verified methods and jurisdiction coverage. Sending remains a separate, explicit choice."
        actions={
          <Button asChild>
            <Link href="/admin/brokers/new">Add broker</Link>
          </Button>
        }
      />
      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="broker-search">Search brokers</Label>
          <Input
            id="broker-search"
            name="search"
            defaultValue={filters.search ?? ""}
            maxLength={100}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="broker-status">Show</Label>
          <select
            id="broker-status"
            name="status"
            defaultValue={filters.status ?? "all"}
            className="h-11 rounded-md border border-input bg-background px-3 text-sm md:h-10"
          >
            <option value="all">All brokers</option>
            <option value="sending">Sending enabled</option>
            <option value="unverified">Needs verification</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <Button type="submit" variant="outline">
          Apply filters
        </Button>
        <Link href="/admin/brokers" className="py-2 text-sm underline">
          Reset
        </Link>
      </form>
      <p className="text-sm text-muted-foreground">
        {page.total} matching {page.total === 1 ? "broker" : "brokers"}. Newest entries
        first.
      </p>
      {page.items.length ? (
        <div
          role="region"
          aria-label="Broker administration results"
          tabIndex={0}
          className="min-w-0 overflow-x-auto rounded-md focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Table scrollLabel="Broker catalogue">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Verification</TableHead>
                <TableHead>Availability</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((broker) => (
                <TableRow key={broker.id}>
                  <TableCell>
                    <Link
                      className="inline-block py-2 font-medium underline underline-offset-4"
                      href={`/admin/brokers/${broker.id}`}
                    >
                      {broker.legalName}
                    </Link>
                    {broker.isDemoData ? (
                      <Badge variant="outline" className="ml-2">
                        Demo
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {broker.category.toLowerCase().replaceAll("_", " ")}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      kind="brokerVerification"
                      status={broker.verificationStatus}
                    />
                  </TableCell>
                  <TableCell>
                    {!broker.isActive
                      ? "Inactive"
                      : broker.productionSendingEnabled
                        ? "Sending enabled"
                        : "Sending disabled"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="space-y-2 border-t py-6">
          <h2 className="text-lg font-semibold">No matching brokers</h2>
          <p className="text-sm">Change the filters or add a sourced entry.</p>
        </div>
      )}
      <nav aria-label="Broker result pages" className="flex gap-4 text-sm">
        {filters.cursor ? (
          <Link
            className="underline"
            href={`/admin/brokers?${new URLSearchParams({ search: filters.search ?? "", status: filters.status ?? "all" })}`}
          >
            First page
          </Link>
        ) : null}
        {page.nextCursor ? (
          <Link className="underline" href={`/admin/brokers?${next}`}>
            Next page
          </Link>
        ) : null}
      </nav>
    </>
  );
}
