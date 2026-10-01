import {
  scanAuditChain,
  publishAuditVerification,
} from "@/lib/db/repositories/auditVerification";
import type { ClaimedJob } from "@/lib/jobs/types";

export async function verifyAuditForJob(job: ClaimedJob<"VERIFY_AUDIT_CHAIN">) {
  const result = await scanAuditChain(job);
  if (!result || !(await publishAuditVerification(job, result)))
    return { message: "Audit verification was cancelled or its worker lease ended." };
  return {
    message: result.isValid
      ? `Checked ${result.checkedCount} retained audit rows; no inconsistency found.`
      : `Audit inconsistency at sequence ${result.problemSequence}: ${result.problemKind}.`,
    metadata: { checkedCount: result.checkedCount, valid: result.isValid },
  };
}
