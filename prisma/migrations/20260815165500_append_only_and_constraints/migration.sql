-- Brokermogger hardening migration.
--
-- 1. Append-only guard triggers for the tamper evident tables.
-- 2. Check constraints that encode invariants the application must never break.
-- 3. Partial unique indexes for rules Prisma cannot express.

-- ---------------------------------------------------------------------------
-- 1. Append-only guards
-- ---------------------------------------------------------------------------

-- UPDATE is always rejected. DELETE is rejected unless the caller explicitly
-- opens the retention escape hatch for the current transaction:
--   SELECT set_config('brokermogger.allow_append_only_delete', 'on', true);
-- The retention and account deletion jobs are the only callers that do this and
-- both write an AuditLog entry before they run.
CREATE OR REPLACE FUNCTION brokermogger_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Table % is append-only: UPDATE is not allowed', TG_TABLE_NAME
      USING ERRCODE = '0A000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF coalesce(current_setting('brokermogger.allow_append_only_delete', true), 'off') <> 'on' THEN
      RAISE EXCEPTION 'Table % is append-only: DELETE requires the retention escape hatch', TG_TABLE_NAME
        USING ERRCODE = '0A000';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION brokermogger_append_only();

CREATE TRIGGER removal_request_event_append_only
  BEFORE UPDATE OR DELETE ON "RemovalRequestEvent"
  FOR EACH ROW EXECUTE FUNCTION brokermogger_append_only();

CREATE TRIGGER request_snapshot_append_only
  BEFORE UPDATE OR DELETE ON "RequestSnapshot"
  FOR EACH ROW EXECUTE FUNCTION brokermogger_append_only();

CREATE TRIGGER consent_record_append_only
  BEFORE UPDATE OR DELETE ON "ConsentRecord"
  FOR EACH ROW EXECUTE FUNCTION brokermogger_append_only();

-- ---------------------------------------------------------------------------
-- 2. Check constraints
-- ---------------------------------------------------------------------------

-- Children's data is out of scope for the MVP. The guard lives in the database
-- so that no code path can create such a profile by accident.
ALTER TABLE "UserProfile"
  ADD CONSTRAINT user_profile_no_minor_profiles
  CHECK (kind <> 'GUARDIAN_MANAGED_MINOR');

ALTER TABLE "UserProfile"
  ADD CONSTRAINT user_profile_consent_matches_kind
  CHECK (
    (kind = 'SELF' AND "consentStatus" = 'SELF')
    OR (kind = 'HOUSEHOLD_ADULT' AND "consentStatus" IN ('EXPLICIT_CONSENT_OBTAINED', 'PENDING_CONSENT', 'NOT_ALLOWED'))
  );

ALTER TABLE "UserProfile"
  ADD CONSTRAINT user_profile_country_code_format
  CHECK ("countryCode" ~ '^[A-Z]{2}$');

-- A broker may only be used for production sending when every verification
-- precondition is satisfied. The application checks this too, this is defence
-- in depth for direct database access and admin tooling.
ALTER TABLE "Broker"
  ADD CONSTRAINT broker_production_sending_requires_verification
  CHECK (
    "productionSendingEnabled" = false
    OR (
      "isActive" = true
      AND "productionUnsafeFlag" = false
      AND "deletedAt" IS NULL
      AND "lastVerifiedAt" IS NOT NULL
      AND "sourceUrl" IS NOT NULL
      AND "verificationStatus" IN ('CONTACT_VERIFIED', 'REQUEST_METHOD_VERIFIED', 'RESPONSE_BEHAVIOR_VERIFIED')
    )
  );

ALTER TABLE "Broker"
  ADD CONSTRAINT broker_confidence_score_range
  CHECK ("confidenceScore" >= 0 AND "confidenceScore" <= 100);

ALTER TABLE "LegalRuleVersion"
  ADD CONSTRAINT legal_rule_version_effective_range
  CHECK ("effectiveUntil" IS NULL OR "effectiveUntil" > "effectiveFrom");

ALTER TABLE "LegalRuleVersion"
  ADD CONSTRAINT legal_rule_version_positive
  CHECK (version >= 1);

-- Low confidence legal logic must always be flagged for review.
ALTER TABLE "LegalRuleVersion"
  ADD CONSTRAINT legal_rule_version_low_confidence_requires_review
  CHECK (confidence <> 'LOW' OR "requiresLegalReview" = true);

ALTER TABLE "LegalRuleVersion"
  ADD CONSTRAINT legal_rule_version_deadline_days_range
  CHECK ("deadlineDays" IS NULL OR ("deadlineDays" >= 0 AND "deadlineDays" <= 365));

ALTER TABLE "RequestTemplateVersion"
  ADD CONSTRAINT request_template_version_positive
  CHECK (version >= 1);

ALTER TABLE "RequestSnapshot"
  ADD CONSTRAINT request_snapshot_version_positive
  CHECK (version >= 1);

ALTER TABLE "RemovalRequest"
  ADD CONSTRAINT removal_request_counters_non_negative
  CHECK ("followUpCount" >= 0 AND ("deadlineDays" IS NULL OR "deadlineDays" >= 0));

ALTER TABLE "RemovalRequest"
  ADD CONSTRAINT removal_request_approval_consistency
  CHECK (
    ("approvedAt" IS NULL AND "approvedByUserId" IS NULL)
    OR ("approvedAt" IS NOT NULL AND "approvedByUserId" IS NOT NULL)
  );

-- Nothing may be marked as sent without an approval timestamp.
ALTER TABLE "RemovalRequest"
  ADD CONSTRAINT removal_request_sent_requires_approval
  CHECK ("sentAt" IS NULL OR "approvedAt" IS NOT NULL);

ALTER TABLE "BackgroundJob"
  ADD CONSTRAINT background_job_attempts_range
  CHECK ("attemptCount" >= 0 AND "maxAttempts" >= 1 AND "attemptCount" <= "maxAttempts");

ALTER TABLE "BackgroundJobLog"
  ADD CONSTRAINT background_job_log_attempt_non_negative
  CHECK (attempt >= 0);

ALTER TABLE "RateLimitBucket"
  ADD CONSTRAINT rate_limit_bucket_sane
  CHECK (count >= 0 AND "windowSeconds" > 0 AND "expiresAt" > "windowStart");

ALTER TABLE "UserQuota"
  ADD CONSTRAINT user_quota_non_negative
  CHECK (
    "maxProfiles" >= 0
    AND "requestsPerDay" >= 0
    AND "requestsPerMonth" >= 0
    AND "requestsPerBrokerPer30Days" >= 0
    AND "evidenceUploadsPerDay" >= 0
    AND "magicLinksPer15Minutes" >= 0
  );

ALTER TABLE "EvidenceFile"
  ADD CONSTRAINT evidence_file_size_non_negative
  CHECK ("byteSize" >= 0);

-- Temporary evidence (identity documents) must always carry an expiry.
ALTER TABLE "EvidenceFile"
  ADD CONSTRAINT evidence_file_temporary_requires_expiry
  CHECK ("isTemporary" = false OR "expiresAt" IS NOT NULL);

ALTER TABLE "HouseholdConsent"
  ADD CONSTRAINT household_consent_expiry_after_creation
  CHECK ("expiresAt" > "createdAt");

ALTER TABLE "Report"
  ADD CONSTRAINT report_date_range
  CHECK ("dateTo" >= "dateFrom");

-- ---------------------------------------------------------------------------
-- 3. Partial unique indexes
-- ---------------------------------------------------------------------------

-- Email uniqueness must be case insensitive.
CREATE UNIQUE INDEX "User_email_lower_key" ON "User" (lower(email));

-- Exactly one self profile and at most one primary profile per account.
CREATE UNIQUE INDEX "UserProfile_one_self_per_owner"
  ON "UserProfile" ("ownerUserId")
  WHERE kind = 'SELF' AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX "UserProfile_one_primary_per_owner"
  ON "UserProfile" ("ownerUserId")
  WHERE "isPrimary" = true AND "deletedAt" IS NULL;

-- Only one consent invitation may be outstanding per household member.
CREATE UNIQUE INDEX "HouseholdConsent_one_pending_per_member"
  ON "HouseholdConsent" ("householdMemberId")
  WHERE status = 'PENDING';

-- Prevent duplicate in-flight requests for the same profile, broker and type.
CREATE UNIQUE INDEX "RemovalRequest_unique_open_per_target"
  ON "RemovalRequest" ("profileId", "brokerId", "requestType")
  WHERE "deletedAt" IS NULL
    AND status NOT IN ('CLOSED', 'COMPLETED', 'REJECTED', 'FAILED');

-- Fast lookup of jobs that are ready to run.
CREATE INDEX "BackgroundJob_due_jobs_idx"
  ON "BackgroundJob" ("runAt", priority)
  WHERE status IN ('PENDING', 'RETRYABLE');
