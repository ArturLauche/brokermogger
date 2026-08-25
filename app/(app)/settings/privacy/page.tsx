import Link from "next/link";

import { DefinitionList } from "@/components/common/definition-list";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { requireActorOrRedirect } from "@/lib/auth";
import { getSetting } from "@/lib/config/runtimeSettings";

export const metadata = { title: "Privacy settings" };
export const dynamic = "force-dynamic";

export default async function PrivacySettingsPage() {
  await requireActorOrRedirect();
  const [
    evidenceMonths,
    temporaryIdDays,
    closedRequestMonths,
    auditMonths,
    consentMonths,
  ] = await Promise.all([
    getSetting("retentionEvidenceMonths"),
    getSetting("retentionTemporaryIdFileDays"),
    getSetting("retentionClosedRequestMonths"),
    getSetting("retentionAuditLogMonths"),
    getSetting("retentionConsentRecordMonths"),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Privacy settings"
        description="What this instance stores, how long, and how you export or delete it. Brokermogger is not a law firm."
      />
      <DefinitionList
        layout="inline"
        items={[
          {
            term: "Evidence files",
            description: `${evidenceMonths} months after the related request closes.`,
          },
          {
            term: "Temporary identity files",
            description: `${temporaryIdDays} days, then deleted.`,
          },
          {
            term: "Closed requests",
            description: `${closedRequestMonths} months.`,
          },
          {
            term: "Audit log",
            description: `${auditMonths} months.`,
          },
          {
            term: "Consent records",
            description: `${consentMonths} months.`,
          },
        ]}
      />
      <p className="text-sm text-muted-foreground">
        Identifiers are stored encrypted. Lists show a masked preview until you choose
        Show in the data vault. Reveals are audited.
      </p>
      <Button asChild>
        <Link href="/api/account/export">Download a copy of my data</Link>
      </Button>
      <p className="text-sm">
        Delete individual fields from the{" "}
        <Link className="underline" href="/vault">
          data vault
        </Link>
        .
      </p>
    </div>
  );
}
