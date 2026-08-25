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

export const metadata = { title: "Brokers" };
export const dynamic = "force-dynamic";

export default async function BrokersPage() {
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

  const brokers = await listBrokersForDirectory(jurisdictionId ? { jurisdictionId } : {});

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Brokers"
        description="Directory of this instance. Seeded records are fictional demo data until a maintainer verifies them."
      />
      <Alert>
        <AlertTitle>Demo data</AlertTitle>
        <AlertDescription>
          Production sending is disabled for every seeded broker. Nothing is scraped and
          no real company is named here.
        </AlertDescription>
      </Alert>
      {brokers.length === 0 ? (
        <EmptyState
          icon={Building2Icon}
          title="No brokers match"
          description="Seed the database or ask a maintainer to add verified records."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Verification</TableHead>
              <TableHead>Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {brokers.map((broker) => (
              <TableRow key={broker.id}>
                <TableCell>
                  <Link className="underline" href={`/requests/new?brokers=${broker.id}`}>
                    {broker.legalName}
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
                <TableCell className="flex flex-wrap gap-1">
                  {broker.isDemoData ? <Badge variant="outline">Demo</Badge> : null}
                  {broker.productionSendingEnabled ? (
                    <Badge>Sending enabled</Badge>
                  ) : (
                    <Badge variant="outline">Sending off</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Button asChild>
        <Link href="/requests/new">Start new removal workflow</Link>
      </Button>
    </div>
  );
}
