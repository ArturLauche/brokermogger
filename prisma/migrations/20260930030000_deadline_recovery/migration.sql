ALTER TABLE "RemovalRequest" ADD COLUMN "deadlineHandledForAt" TIMESTAMP(3),
  ADD COLUMN "deadlineHandledFollowUpCount" INTEGER;

-- Old watcher notifications prove only the target current when that notification
-- was recorded. Later receipt corrections must receive fresh handling.
UPDATE "RemovalRequest" r SET "deadlineHandledForAt" = r."deadlineAt",
  "deadlineHandledFollowUpCount" = r."followUpCount"
WHERE r."deadlineAt" IS NOT NULL AND r.status = 'NO_RESPONSE' AND EXISTS (
  SELECT 1 FROM "Notification" n WHERE n."removalRequestId" = r.id
    AND n."dedupeKey" = 'deadline-handled:' || r.id || ':' || r."followUpCount"::text
    AND NOT EXISTS (SELECT 1 FROM "RemovalRequestEvent" e WHERE e."removalRequestId" = r.id
      AND e.type = 'CORRECTION' AND e."createdAt" > n."createdAt")
);

-- Only a proven system scheduling event identifies an old automatic preparation.
-- Unclassified legacy jobs retain their original payload and require normal review.
UPDATE "BackgroundJob" j SET "payloadJson" = j."payloadJson" || jsonb_build_object(
  'origin', 'DEADLINE', 'expectedDeadlineAt', to_char(r."deadlineAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
FROM "RemovalRequest" r WHERE j."relatedRequestId" = r.id
  AND j."relatedUserId" = r."userId" AND j.type = 'PREPARE_FOLLOW_UP'
  AND j.status IN ('PENDING', 'RETRYABLE', 'RUNNING') AND r.status = 'FOLLOW_UP_SCHEDULED'
  AND r."deadlineAt" IS NOT NULL AND jsonb_typeof(j."payloadJson") = 'object'
  AND NOT (j."payloadJson" ? 'origin')
  AND (NOT (j."payloadJson" ? 'kind') OR j."payloadJson"->>'kind' = 'FOLLOW_UP')
  AND j."payloadJson"->>'removalRequestId' = r.id
  AND j."payloadJson"->>'followUpNumber' = (r."followUpCount" + 1)::text
  AND EXISTS (
    SELECT 1 FROM "RemovalRequestEvent" e WHERE e."removalRequestId" = r.id
      AND e.type = 'STATUS_CHANGE' AND e."toStatus" = 'FOLLOW_UP_SCHEDULED'
      AND e."actorType" = 'SYSTEM'
      -- A later correction, receipt/delivery event, or other change makes the
      -- original automatic clock uncertain. Do not infer provenance from it.
      AND NOT EXISTS (SELECT 1 FROM "RemovalRequestEvent" later
        WHERE later."removalRequestId" = r.id
          AND (later."createdAt", later.id) > (e."createdAt", e.id))
  );

-- CHECK must reject NULL rather than treating an incomplete failed result as unknown.
ALTER TABLE "AuditChainVerification" DROP CONSTRAINT "AuditChainVerification_result_check";
ALTER TABLE "AuditChainVerification" ADD CONSTRAINT "AuditChainVerification_result_check" CHECK (
  "checkedCount" >= 0 AND
  (("isValid" AND "problemSequence" IS NULL AND "problemKind" IS NULL) OR
   (NOT "isValid" AND "problemSequence" IS NOT NULL AND "problemKind" IS NOT NULL
    AND "problemKind" IN ('hash_mismatch', 'broken_link')))
);
