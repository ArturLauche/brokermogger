import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireActorOrRedirect } from "@/lib/auth";
import { loadPrivateRequest } from "@/app/_lib/private-request";
import { getDateFormatter } from "@/app/_lib/datetime";
import { dateInTimeZone } from "@/lib/format/datetime";
import { PageHeader } from "@/components/common/page-header";
import { RecordResponseForm } from "@/app/(app)/responses/response-forms";

export const metadata = { title: "Record a broker reply" };
export const dynamic = "force-dynamic";

export default async function RecordReplyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const request = await loadPrivateRequest(actor, (await params).id);
  const { timeZone } = await getDateFormatter();
  const today = dateInTimeZone(new Date(), timeZone);
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title="Record a broker reply" description={request.broker.legalName} />
      <p className="text-sm">
        <Link className="underline" href={`/evidence?requestId=${request.id}`}>
          Upload a PDF or screenshot
        </Link>{" "}
        before attaching it here, or paste the reply text below.
      </p>
      <RecordResponseForm
        initial={{
          requestId: request.id,
          submissionKey: randomUUID(),
          receivedOn: today,
          fromAddress: "",
          subject: "",
          body: "",
          channel: request.channel,
          evidenceFileId: "",
        }}
        today={today}
        timeZone={timeZone}
      />
    </div>
  );
}
