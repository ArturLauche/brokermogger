import Link from "next/link";

import { DefinitionList } from "@/components/common/definition-list";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { SETTINGS } from "@/lib/config/systemSettings";
import { requireActorOrRedirect } from "@/lib/auth";

export const metadata = { title: "Privacy settings" };
export const dynamic = "force-dynamic";

export default async function PrivacySettingsPage() {
  await requireActorOrRedirect();

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
            description: `${SETTINGS.retentionEvidenceMonths.defaultValue} months after the related request closes.`,
          },
          {
            term: "Temporary identity files",
            description: `${SETTINGS.retentionTemporaryIdFileDays.defaultValue} days, then deleted.`,
          },
          {
            term: "Closed requests",
            description: `${SETTINGS.retentionClosedRequestMonths.defaultValue} months.`,
          },
          {
            term: "Audit log",
            description: `${SETTINGS.retentionAuditLogMonths.defaultValue} months.`,
          },
          {
            term: "Consent records",
            description: `${SETTINGS.retentionConsentRecordMonths.defaultValue} months.`,
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
