import { Building2Icon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { resolveActiveProfileForRequest } from "@/app/_lib/active-profile";
import { requireActorOrRedirect } from "@/lib/auth";
import {
  listBrokersForDirectory,
  listActiveJurisdictions,
  listPublishedLegalRules,
} from "@/lib/db/repositories/catalog";
import { resolveJurisdiction } from "@/lib/jurisdiction/resolve";
import { ListNavigation } from "@/components/common/list-navigation";
import { ListFilters } from "@/components/common/list-filters";
import { ListResultSummary } from "@/components/common/list-result-summary";
import { brokerCategorySchema } from "@/lib/validation/enums";
import { readListResult } from "@/app/_lib/list-result";
import { ListInputErrorPage } from "@/components/common/list-input-error";

export const metadata = { title: "Brokers" };
export const dynamic = "force-dynamic";

export default async function BrokersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; category?: string; cursor?: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const { active } = await resolveActiveProfileForRequest(actor);
  const jurisdictions = await listActiveJurisdictions();
  const rules = await listPublishedLegalRules();

  let jurisdictionId: string | undefined;
  if (active?.residencyConfirmed) {
    try {
      const resolved = resolveJurisdiction(
        {
          countryCode: active.countryCode,
          region: active.region,
          residencyConfirmed: active.residencyConfirmed,
        },
        jurisdictions,
        rules
      );
      jurisdictionId = resolved.jurisdiction.id;
    } catch {
      jurisdictionId = undefined;
    }
  }

  const params = await searchParams;
  const result = await readListResult(
    listBrokersForDirectory({
      ...params,
      ...(jurisdictionId ? { jurisdictionId } : {}),
    })
  );
  if (!result.ok) return <ListInputErrorPage title="Brokers" path="/brokers" />;
  const page = result.value;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Brokers"
        description="This instance’s broker directory. Review the recorded sources and methods before preparing a request."
      />
      <Alert>
        <AlertTitle>Review each entry</AlertTitle>
        <AlertDescription>
          Fictional examples are labelled Demo and cannot send to real brokers.
          Operator-maintained entries need verified methods and explicit approval before
          sending.
        </AlertDescription>
      </Alert>
      <ListFilters
        path="/brokers"
        prefix="broker-directory"
        searchLabel="Broker name"
        values={params}
        selects={[
          {
            name: "category",
            label: "Category",
            options: [
              { value: "all", label: "All categories" },
              ...brokerCategorySchema.options.map((value) => ({
                value,
                label: value.toLowerCase().replaceAll("_", " "),
              })),
            ],
          },
        ]}
      />
      <ListResultSummary shown={page.items.length} total={page.total} noun="broker" />
      {page.items.length === 0 ? (
        <EmptyState
          icon={Building2Icon}
          title="No brokers match"
          description="Seed the database or ask a maintainer to add verified records."
        />
      ) : (
        <Table scrollLabel="Broker directory">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Verification</TableHead>
              <TableHead>Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.map((broker) => (
              <TableRow key={broker.id}>
                <TableCell>
                  <Link className="underline" href={`/requests/new?brokers=${broker.id}`}>
                    {broker.legalName}
                  </Link>
                  <Link
                    className="block! py-2 text-sm underline underline-offset-4"
                    href={`/brokers/${broker.id}`}
                  >
                    Sources and instructions
                    <span className="sr-only"> for {broker.legalName}</span>
                  </Link>
                </TableCell>
                <TableCell>
                  {broker.category.replaceAll("_", " ").toLowerCase()}
                </TableCell>
                <TableCell>
                  <StatusBadge
                    kind="brokerVerification"
                    status={broker.verificationStatus}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {broker.isDemoData ? <Badge variant="outline">Demo</Badge> : null}
                    {broker.productionSendingEnabled ? (
                      <Badge>Sending enabled</Badge>
                    ) : (
                      <Badge variant="outline">Sending off</Badge>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <ListNavigation
        path="/brokers"
        filters={{ search: params.search, category: params.category }}
        cursor={params.cursor}
        nextCursor={page.nextCursor}
        label="Broker results"
      />
      <Button asChild>
        <Link href="/requests/new">Start new removal workflow</Link>
      </Button>
    </div>
  );
}
