import { recordAudit } from "@/lib/audit/service";
import {
  type getEscalationSummary,
  prepareEscalationRecord,
} from "@/lib/db/repositories/requestEscalation";
import type { ActorContext } from "@/lib/permissions/actor";
import { RESPONSE_LABELS } from "@/lib/responses/labels";
import { REQUEST_TYPE_LABELS } from "./labels";

export async function prepareEscalation(actor: ActorContext, requestId: string) {
  const result = await prepareEscalationRecord(actor, requestId);
  await recordAudit({
    actor,
    action: "request.status_changed",
    resourceType: "removal_request",
    resourceId: result.requestId,
    metadata: { escalationPrepared: true },
  });
  return result;
}

export function escalationSummaryText(
  summary: Awaited<ReturnType<typeof getEscalationSummary>>
) {
  const date = (value: Date | null) =>
    value?.toISOString().slice(0, 10) ?? "Not recorded";
  return [
    "Privacy request: escalation preparation",
    "",
    "This is a summary of recorded information, not a complaint or legal advice. Brokermogger has not contacted an authority. Review the authority's eligibility, appeal requirements and submission instructions yourself.",
    "",
    `Broker: ${summary.brokerName}`,
    `Request reference: ${summary.reference ?? summary.requestId}`,
    `Request type: ${REQUEST_TYPE_LABELS[summary.requestType]}`,
    `Status before preparation: ${summary.previousStatus ?? "Not recorded"}`,
    `Recorded submission date (may be simulated): ${date(summary.sentAt)}`,
    `Manual submissions: ${summary.manualSubmissionCount}`,
    `First manual submission: ${date(summary.firstManualSubmission)}`,
    `Last manual submission: ${date(summary.lastManualSubmission)}`,
    `Recorded manual receipt date: ${date(summary.recordedReceipt)}`,
    `Emails accepted by a real provider: ${summary.realAcceptedEmails} (acceptance does not prove receipt)`,
    `Simulated or sandbox emails: ${summary.simulatedEmails} (these did not contact the broker)`,
    `Recorded response date: ${date(summary.deadlineAt)} (may be an estimate; verify the applicable rule and receipt date)`,
    "",
    `Legal basis recorded on the request: ${summary.legalBasis}`,
    `Source: ${summary.rule?.sourceTitle ?? "Not recorded"} ${summary.rule?.sourceUrl ?? ""}`,
    `Version: ${summary.rule?.version ?? "Not recorded"}; reviewed: ${date(summary.rule?.lastReviewedAt ?? null)}`,
    `Confidence: ${summary.rule?.confidence ?? "Unknown"}; legal review required: ${summary.rule?.requiresLegalReview !== false ? "yes" : "no"}`,
    `Authority listed in this rule: ${summary.rule?.escalationAuthority ?? "Not specified"}`,
    `Guidance: ${summary.rule?.escalationPath ?? "Ask the relevant privacy authority about its process."}`,
    `Authority link: ${summary.rule?.escalationUrl ?? "Not specified"}`,
    "",
    "Confirmed reply classifications:",
    ...(summary.replies.length
      ? summary.replies.map(
          (reply) => `- ${RESPONSE_LABELS[reply.classification]}: ${reply.count}`
        )
      : ["- None recorded"]),
    `Saved message snapshots: ${summary.snapshotCount}; available evidence files: ${summary.evidenceCount}`,
    "",
    "Before submitting anything:",
    "1. Check the authority is competent for the broker, location and subject matter. Complete a broker appeal first if the applicable process requires it.",
    "2. Describe the unresolved facts and desired outcome in your own words. Distinguish your records from anything the broker disputes.",
    "3. Gather the approved letters, submission or receipt proof, relevant replies and selected evidence. This summary does not embed their contents or personal identifiers.",
    "4. Review and redact unnecessary personal data. If acting for another adult, confirm their current permission for the external submission.",
    "5. Submit using the authority's own process and keep its acknowledgement. Add it as evidence to the request if you want a local record.",
    "",
  ].join("\n");
}
