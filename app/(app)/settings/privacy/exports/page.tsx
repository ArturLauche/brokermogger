import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireActorOrRedirect } from "@/lib/auth";
import { getDateFormatter } from "@/app/_lib/datetime";
import { listAccountExports } from "@/lib/db/repositories/accountExports";
import { PageHeader } from "@/components/common/page-header";
import { BackgroundRefresh } from "@/components/common/background-refresh";
import { Button } from "@/components/ui/button";
import { ExportForm, DeleteExportForm } from "./export-forms";

export const metadata = { title: "Account exports" };
export const dynamic = "force-dynamic";
export default async function AccountExportsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; queued?: string; removed?: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const query = await searchParams;
  const [page, { formatStamp }] = await Promise.all([
    listAccountExports(actor, { cursor: query.cursor }),
    getDateFormatter(),
  ]);
  const isWorking = (row: (typeof page.items)[number]) =>
    row.status !== "READY" &&
    Boolean(row.job && ["PENDING", "RUNNING", "RETRYABLE"].includes(row.job.status));
  return (
    <div className="flex max-w-4xl min-w-0 flex-col gap-8">
      <PageHeader
        title="Account exports"
        description="Make a private copy of your records across all profiles. Generated copies are encrypted on this instance and available for 24 hours after they are ready."
      />
      <Link
        href="/settings/privacy"
        className="w-fit text-sm underline underline-offset-4"
      >
        Back to privacy settings
      </Link>
      {query.queued ? (
        <p role="status" className="text-sm">
          Export queued. An existing export of the same type is reused while it is still
          in progress.
        </p>
      ) : null}
      {query.removed ? (
        <p role="status" className="text-sm">
          Download access is disabled. Any stored copy is scheduled for cleanup.
        </p>
      ) : null}
      <section aria-labelledby="new-export" className="space-y-5">
        <h2 id="new-export" className="text-xl font-semibold">
          Create an export
        </h2>
        <ExportForm
          key={query.queued ?? query.removed ?? "new"}
          submissionKey={randomUUID()}
        />
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          One export of each type can be generated at a time to share worker capacity
          fairly. You can leave this page; a notification appears when it is ready.
          Deleting source data also invalidates existing exports. Offline backups follow
          the instance operator’s retention policy.
        </p>
      </section>
      <section aria-labelledby="export-copies" className="space-y-5 border-t pt-6">
        <h2 id="export-copies" className="text-xl font-semibold">
          Your copies
        </h2>
        <BackgroundRefresh
          working={page.items.some(isWorking)}
          message="Status refreshes every 10 seconds while a copy is being generated."
        />
        {page.items.length ? (
          <ul aria-label="Account exports" className="divide-y border-y">
            {page.items.map((row) => {
              const working = isWorking(row);
              const available =
                row.status === "READY" &&
                row.expiresAt &&
                row.expiresAt > new Date() &&
                row.evidenceFile?.storageState === "READY" &&
                !row.evidenceFile.deletedAt;
              const status = available
                ? "Ready"
                : row.status === "READY"
                  ? "Expired or removed"
                  : working
                    ? row.job?.status === "RETRYABLE"
                      ? "Retry scheduled"
                      : row.status === "GENERATING"
                        ? "Generating"
                        : "Queued"
                    : "Could not finish";
              return (
                <li key={row.id} id={`export-${row.id}`} className="space-y-4 py-5">
                  <div className="flex flex-wrap justify-between gap-3">
                    <div className="space-y-2">
                      <h3 className="font-semibold">
                        {row.mode === "SENSITIVE" ? "Sensitive export" : "Masked export"}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Requested {formatStamp(row.createdAt)}
                      </p>
                    </div>
                    <p role="status" className="text-sm font-medium">
                      {status}
                    </p>
                  </div>
                  {row.status === "GENERATING" && working ? (
                    <p className="text-sm">{row.processedRecords} records read</p>
                  ) : null}
                  {available ? (
                    <p className="text-sm">
                      Download before {formatStamp(row.expiresAt!)}. Downloaded JSON is
                      unencrypted.
                    </p>
                  ) : null}
                  {row.job?.status === "RETRYABLE" && working ? (
                    <p className="text-sm">Next attempt: {formatStamp(row.job.runAt)}</p>
                  ) : null}
                  {!available && !working ? (
                    <p className="text-sm text-muted-foreground">
                      {row.error ?? "This copy is no longer available."} You can create a
                      new export above.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-3">
                    {available ? (
                      <Button variant="outline" asChild>
                        <a href={`/api/account/exports/${row.id}/download`}>
                          Download {row.mode === "SENSITIVE" ? "sensitive" : "masked"}{" "}
                          JSON
                        </a>
                      </Button>
                    ) : null}
                    <DeleteExportForm id={row.id} working={working} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="space-y-2 border-y py-8">
            <h3 className="text-lg font-semibold">No exports yet</h3>
            <p className="text-sm text-muted-foreground">
              Choose what to include above. Copies contain only records still available
              under the instance’s retention settings.
            </p>
          </div>
        )}
        <nav aria-label="Export pages" className="flex gap-3">
          {query.cursor ? (
            <Button asChild variant="outline">
              <Link href="/settings/privacy/exports">First page</Link>
            </Button>
          ) : null}
          {page.nextCursor ? (
            <Button asChild variant="outline">
              <Link href={`/settings/privacy/exports?cursor=${page.nextCursor}`}>
                Next 25 exports
              </Link>
            </Button>
          ) : null}
        </nav>
      </section>
    </div>
  );
}
