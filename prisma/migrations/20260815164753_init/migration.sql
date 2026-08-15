-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'MAINTAINER', 'INSTANCE_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_DELETION', 'DELETED');

-- CreateEnum
CREATE TYPE "ProfileKind" AS ENUM ('SELF', 'HOUSEHOLD_ADULT', 'GUARDIAN_MANAGED_MINOR');

-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('SELF', 'GUARDIAN_MANAGED', 'EXPLICIT_CONSENT_OBTAINED', 'PENDING_CONSENT', 'NOT_ALLOWED');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('PROFILE_MANAGEMENT', 'REQUEST_GENERATION', 'REQUEST_SUBMISSION', 'IDENTITY_VERIFICATION');

-- CreateEnum
CREATE TYPE "ConsentMethod" AS ENUM ('SELF_ATTESTATION', 'DOUBLE_OPT_IN_EMAIL', 'UPLOADED_DECLARATION', 'GUARDIAN_DECLARATION');

-- CreateEnum
CREATE TYPE "HouseholdRelationship" AS ENUM ('SELF', 'SPOUSE_OR_PARTNER', 'PARENT', 'ADULT_CHILD', 'SIBLING', 'OTHER_ADULT');

-- CreateEnum
CREATE TYPE "HouseholdMemberStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "HouseholdConsentStatus" AS ENUM ('PENDING', 'VERIFIED', 'DECLINED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "IdentifierType" AS ENUM ('FULL_NAME', 'PREVIOUS_NAME', 'EMAIL', 'PHONE', 'POSTAL_ADDRESS', 'PREVIOUS_ADDRESS', 'APPROXIMATE_LOCATION', 'USERNAME', 'OTHER');

-- CreateEnum
CREATE TYPE "IdentifierSensitivity" AS ENUM ('NORMAL', 'SENSITIVE');

-- CreateEnum
CREATE TYPE "BrokerCategory" AS ENUM ('PEOPLE_SEARCH', 'MARKETING_LIST_PROVIDER', 'LEAD_GENERATION', 'DATA_ENRICHMENT', 'ADTECH_AUDIENCE_DATA', 'RECRUITMENT_PROFILE_AGGREGATION', 'PROPERTY_PUBLIC_RECORDS', 'RISK_IDENTITY_FRAUD');

-- CreateEnum
CREATE TYPE "DataCategory" AS ENUM ('IDENTITY', 'CONTACT', 'LOCATION', 'EMPLOYMENT', 'EDUCATION', 'PROPERTY', 'PUBLIC_RECORDS', 'ONLINE_BEHAVIOUR', 'INFERRED_ATTRIBUTES', 'HOUSEHOLD_RELATIONSHIPS', 'FINANCIAL_INDICATORS');

-- CreateEnum
CREATE TYPE "BrokerVerificationStatus" AS ENUM ('UNVERIFIED', 'SOURCE_FOUND', 'CONTACT_VERIFIED', 'REQUEST_METHOD_VERIFIED', 'RESPONSE_BEHAVIOR_VERIFIED', 'DEPRECATED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BrokerRiskTier" AS ENUM ('STANDARD', 'ELEVATED', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "ContactMethodType" AS ENUM ('EMAIL', 'WEB_FORM', 'PRIVACY_PORTAL_URL', 'POSTAL', 'API', 'DROP_PLATFORM');

-- CreateEnum
CREATE TYPE "BrokerAliasKind" AS ENUM ('TRADING_NAME', 'LEGACY_NAME', 'DOMAIN', 'BRAND');

-- CreateEnum
CREATE TYPE "SeedSourceType" AS ENUM ('OFFICIAL_PRIVACY_PAGE', 'PUBLIC_REGISTRY', 'MANUAL_ENTRY', 'DEMO_FICTIONAL');

-- CreateEnum
CREATE TYPE "CoverageType" AS ENUM ('STATUTORY', 'VOLUNTARY_OPT_OUT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('DELETION', 'ACCESS', 'CORRECTION', 'OBJECTION', 'OPT_OUT', 'SUPPRESSION', 'CONSENT_WITHDRAWAL', 'FOLLOW_UP', 'FINAL_REMINDER', 'ESCALATION');

-- CreateEnum
CREATE TYPE "RequestChannel" AS ENUM ('EMAIL', 'WEB_FORM', 'API', 'POSTAL', 'DROP');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('DRAFT', 'PREPARED', 'AWAITING_USER_APPROVAL', 'APPROVED', 'SENT', 'DELIVERED', 'WAITING_FOR_BROKER', 'BROKER_REQUESTED_VERIFICATION', 'NEEDS_USER_ACTION', 'FOLLOW_UP_SCHEDULED', 'FOLLOW_UP_SENT', 'COMPLETED', 'PARTIALLY_COMPLETED', 'REJECTED', 'NO_RESPONSE', 'ESCALATION_RECOMMENDED', 'MANUAL_REVIEW_REQUIRED', 'CLOSED', 'FAILED');

-- CreateEnum
CREATE TYPE "RequestEventType" AS ENUM ('CREATED', 'STATUS_CHANGE', 'APPROVAL', 'MANUAL_REVIEW', 'EMAIL_QUEUED', 'EMAIL_SENT', 'EMAIL_DELIVERED', 'EMAIL_FAILED', 'RESPONSE_RECEIVED', 'EVIDENCE_ADDED', 'NOTE', 'CORRECTION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'ADMIN', 'BROKER');

-- CreateEnum
CREATE TYPE "LegalConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BrokerResponseClassification" AS ENUM ('CONFIRMED_COMPLETED', 'PARTIALLY_COMPLETED', 'REJECTED', 'VERIFICATION_REQUESTED', 'AUTO_ACKNOWLEDGEMENT', 'UNCLEAR', 'OUT_OF_SCOPE');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('SENT_MESSAGE', 'BROKER_RESPONSE', 'SCREENSHOT', 'IDENTITY_DOCUMENT', 'REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "EvidenceEncryption" AS ENUM ('NONE', 'SERVER_SIDE', 'CLIENT_SIDE_AES_GCM');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('REQUEST_PREPARED', 'APPROVAL_NEEDED', 'REQUEST_SENT', 'BROKER_RESPONSE_RECEIVED', 'VERIFICATION_NEEDED', 'DEADLINE_APPROACHING', 'FOLLOW_UP_SENT', 'REMOVAL_CONFIRMED', 'REQUEST_REJECTED', 'RECHECK_RECOMMENDED', 'ACCOUNT_SECURITY_EVENT', 'FAIR_USE_LIMIT_REACHED', 'HOUSEHOLD_CONSENT_UPDATE');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'ACTION_REQUIRED', 'WARNING');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'DENIED', 'ERROR');

-- CreateEnum
CREATE TYPE "AdminActionType" AS ENUM ('BREAK_GLASS_GRANT', 'USER_DATA_VIEW', 'BROKER_EDIT', 'BROKER_VERIFICATION_CHANGE', 'LEGAL_RULE_PUBLISH', 'TEMPLATE_PUBLISH', 'JOB_RETRY', 'JOB_CANCEL', 'SETTING_CHANGE', 'MANUAL_REVIEW_DECISION', 'USER_SUSPEND');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('SEND_REQUEST', 'PREPARE_FOLLOW_UP', 'DISPATCH_NOTIFICATION', 'PROCESS_EMAIL_WEBHOOK', 'GENERATE_REPORT', 'DELETE_ACCOUNT_DATA', 'PURGE_EVIDENCE', 'PURGE_TEMP_ID_FILES', 'DEADLINE_WATCH', 'RECHECK_REMINDER', 'RETENTION_SWEEP');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'RETRYABLE', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobLogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "EmailPurpose" AS ENUM ('MAGIC_LINK', 'NOTIFICATION', 'BROKER_REQUEST', 'BROKER_FOLLOW_UP', 'CONSENT_INVITE', 'ACCOUNT_SECURITY');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "EmailProviderKind" AS ENUM ('MOCK', 'SANDBOX', 'RESEND');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('JSON', 'PDF');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "lastLoginAt" TIMESTAMP(3),
    "deletionRequestedAt" TIMESTAMP(3),
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "refresh_token_expires_in" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "kind" "ProfileKind" NOT NULL,
    "status" "ProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "displayName" TEXT NOT NULL,
    "legalNameEnc" TEXT,
    "legalNameBi" TEXT,
    "countryCode" TEXT NOT NULL,
    "region" TEXT,
    "residencyConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "residencyNote" TEXT,
    "consentStatus" "ConsentStatus" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "contactEmailEnc" TEXT,
    "contactEmailBi" TEXT,
    "contactEmailMasked" TEXT,
    "onboardingCompletedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileIdentifier" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "type" "IdentifierType" NOT NULL,
    "label" TEXT,
    "valueEnc" TEXT NOT NULL,
    "valueBi" TEXT NOT NULL,
    "maskedPreview" TEXT NOT NULL,
    "sensitivity" "IdentifierSensitivity" NOT NULL DEFAULT 'NORMAL',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "usageScope" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "ProfileIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMember" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "relationship" "HouseholdRelationship" NOT NULL,
    "status" "HouseholdMemberStatus" NOT NULL DEFAULT 'PENDING',
    "invitedEmailEnc" TEXT,
    "invitedEmailBi" TEXT,
    "invitedEmailMasked" TEXT,
    "addedReason" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdConsent" (
    "id" TEXT NOT NULL,
    "householdMemberId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" "HouseholdConsentStatus" NOT NULL DEFAULT 'PENDING',
    "contactEmailEnc" TEXT NOT NULL,
    "contactEmailBi" TEXT NOT NULL,
    "contactEmailMasked" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "statementText" TEXT NOT NULL,
    "statementHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "verificationIpHash" TEXT,
    "verificationUserAgentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "method" "ConsentMethod" NOT NULL,
    "status" "ConsentStatus" NOT NULL,
    "householdConsentId" TEXT,
    "removalRequestId" TEXT,
    "statementText" TEXT NOT NULL,
    "statementHash" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "prevHash" TEXT,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Jurisdiction" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "region" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Jurisdiction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalRule" (
    "id" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "lawName" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "LegalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalRuleVersion" (
    "id" TEXT NOT NULL,
    "legalRuleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "supportedRequestTypes" "RequestType"[],
    "legalBasisText" TEXT NOT NULL,
    "deadlineDays" INTEGER,
    "deadlineRule" JSONB NOT NULL DEFAULT '{}',
    "verificationRequirements" JSONB NOT NULL DEFAULT '{}',
    "escalationPath" TEXT NOT NULL,
    "escalationAuthority" TEXT,
    "escalationUrl" TEXT,
    "templateClauses" JSONB NOT NULL DEFAULT '[]',
    "riskNotes" TEXT NOT NULL,
    "requiresLegalReview" BOOLEAN NOT NULL DEFAULT true,
    "confidence" "LegalConfidence" NOT NULL DEFAULT 'LOW',
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT NOT NULL,
    "additionalSources" JSONB NOT NULL DEFAULT '[]',
    "lastReviewedAt" TIMESTAMP(3) NOT NULL,
    "reviewedBy" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveUntil" TIMESTAMP(3),
    "changeNotes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "LegalRuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broker" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradingNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "websiteUrl" TEXT,
    "category" "BrokerCategory" NOT NULL,
    "subcategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "countriesServed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "regionsServed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dataCategories" "DataCategory"[] DEFAULT ARRAY[]::"DataCategory"[],
    "privacyEmail" TEXT,
    "privacyRequestUrl" TEXT,
    "optOutUrl" TEXT,
    "webFormUrl" TEXT,
    "postalAddress" TEXT,
    "apiSupported" BOOLEAN NOT NULL DEFAULT false,
    "apiNotes" TEXT,
    "verificationRequirements" JSONB NOT NULL DEFAULT '{}',
    "knownResponseBehavior" JSONB NOT NULL DEFAULT '{}',
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "sourceUrl" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "manualReviewRequired" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "verificationStatus" "BrokerVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "productionSendingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "productionUnsafeFlag" BOOLEAN NOT NULL DEFAULT false,
    "isDemoData" BOOLEAN NOT NULL DEFAULT true,
    "riskTier" "BrokerRiskTier" NOT NULL DEFAULT 'STANDARD',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "Broker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerAlias" (
    "id" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "kind" "BrokerAliasKind" NOT NULL DEFAULT 'TRADING_NAME',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerContactMethod" (
    "id" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "type" "ContactMethodType" NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "verificationNote" TEXT,
    "sourceUrl" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "BrokerContactMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerJurisdictionCoverage" (
    "id" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "coverageType" "CoverageType" NOT NULL DEFAULT 'UNKNOWN',
    "supportedRequestTypes" "RequestType"[] DEFAULT ARRAY[]::"RequestType"[],
    "notes" TEXT,
    "confidence" "LegalConfidence" NOT NULL DEFAULT 'LOW',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerJurisdictionCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerSeedSource" (
    "id" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceTitle" TEXT NOT NULL,
    "sourceType" "SeedSourceType" NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerSeedSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "requestType" "RequestType" NOT NULL,
    "channel" "RequestChannel" NOT NULL DEFAULT 'EMAIL',
    "jurisdictionId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "RequestTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "subjectTemplate" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "requiredVariables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "optionalVariables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "locale" TEXT NOT NULL DEFAULT 'en',
    "changeNotes" TEXT NOT NULL DEFAULT '',
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "RequestTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemovalRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "requestType" "RequestType" NOT NULL,
    "channel" "RequestChannel" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "legalRuleVersionId" TEXT,
    "templateVersionId" TEXT,
    "legalBasisText" TEXT NOT NULL,
    "deadlineDays" INTEGER,
    "deadlineAt" TIMESTAMP(3),
    "manualReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "manualReviewReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "manualReviewResolvedAt" TIMESTAMP(3),
    "manualReviewResolvedBy" TEXT,
    "destinationType" "ContactMethodType",
    "destinationValue" TEXT,
    "includedIdentifierIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "includedIdentifiers" JSONB NOT NULL DEFAULT '[]',
    "currentSnapshotId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvalConsentRecordId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closureReason" TEXT,
    "followUpCount" INTEGER NOT NULL DEFAULT 0,
    "nextFollowUpAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalReference" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "RemovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemovalRequestEvent" (
    "id" TEXT NOT NULL,
    "removalRequestId" TEXT NOT NULL,
    "type" "RequestEventType" NOT NULL,
    "fromStatus" "RequestStatus",
    "toStatus" "RequestStatus",
    "actorType" "ActorType" NOT NULL,
    "actorUserId" TEXT,
    "message" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "correctsEventId" TEXT,
    "prevHash" TEXT,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemovalRequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestSnapshot" (
    "id" TEXT NOT NULL,
    "removalRequestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "templateVersionId" TEXT,
    "legalRuleVersionId" TEXT,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "contentHash" TEXT NOT NULL,
    "identifierDigest" TEXT NOT NULL,
    "renderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerResponse" (
    "id" TEXT NOT NULL,
    "removalRequestId" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "channel" "RequestChannel" NOT NULL DEFAULT 'EMAIL',
    "fromAddress" TEXT,
    "subjectEnc" TEXT,
    "bodyEnc" TEXT,
    "bodyPreview" TEXT,
    "classification" "BrokerResponseClassification" NOT NULL DEFAULT 'UNCLEAR',
    "classificationConfidence" "LegalConfidence" NOT NULL DEFAULT 'LOW',
    "classifiedBy" "ActorType" NOT NULL DEFAULT 'SYSTEM',
    "requiresUserAction" BOOLEAN NOT NULL DEFAULT false,
    "evidenceFileId" TEXT,
    "rawMetadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "BrokerResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceFile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileId" TEXT,
    "removalRequestId" TEXT,
    "kind" "EvidenceKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "storageBackend" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "encryption" "EvidenceEncryption" NOT NULL DEFAULT 'SERVER_SIDE',
    "encryptionKeyId" TEXT,
    "filenameEnc" TEXT,
    "filenameMasked" TEXT,
    "isTemporary" BOOLEAN NOT NULL DEFAULT false,
    "retentionPolicy" TEXT NOT NULL DEFAULT 'default',
    "expiresAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "EvidenceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileId" TEXT,
    "removalRequestId" TEXT,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionUrl" TEXT,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "dedupeKey" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileId" TEXT,
    "title" TEXT NOT NULL,
    "dateFrom" TIMESTAMP(3) NOT NULL,
    "dateTo" TIMESTAMP(3) NOT NULL,
    "format" "ReportFormat" NOT NULL DEFAULT 'PDF',
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "evidenceFileId" TEXT,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "generatedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorUserId" TEXT,
    "actorRole" "UserRole",
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "targetUserId" TEXT,
    "outcome" "AuditOutcome" NOT NULL DEFAULT 'SUCCESS',
    "reason" TEXT,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "requestId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "prevHash" TEXT,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAction" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "type" "AdminActionType" NOT NULL,
    "targetUserId" TEXT,
    "targetResourceType" TEXT,
    "targetResourceId" TEXT,
    "justification" TEXT NOT NULL,
    "grantExpiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "auditLogId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lockExpiresAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "payloadJson" JSONB NOT NULL DEFAULT '{}',
    "idempotencyKey" TEXT NOT NULL,
    "relatedUserId" TEXT,
    "relatedRequestId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJobLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "level" "JobLogLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "durationMs" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackgroundJobLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundEmail" (
    "id" TEXT NOT NULL,
    "purpose" "EmailPurpose" NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" "EmailProviderKind" NOT NULL,
    "removalRequestId" TEXT,
    "userId" TEXT,
    "profileId" TEXT,
    "toAddressEnc" TEXT NOT NULL,
    "toAddressMasked" TEXT NOT NULL,
    "toAddressHash" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "replyTo" TEXT,
    "subjectEnc" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "outboundEmailId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserQuota" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "maxProfiles" INTEGER NOT NULL DEFAULT 6,
    "requestsPerDay" INTEGER NOT NULL DEFAULT 25,
    "requestsPerMonth" INTEGER NOT NULL DEFAULT 200,
    "requestsPerBrokerPer30Days" INTEGER NOT NULL DEFAULT 5,
    "evidenceUploadsPerDay" INTEGER NOT NULL DEFAULT 50,
    "magicLinksPer15Minutes" INTEGER NOT NULL DEFAULT 3,
    "notes" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowSeconds" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expires_idx" ON "Session"("expires");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE INDEX "VerificationToken_expires_idx" ON "VerificationToken"("expires");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "UserProfile_ownerUserId_status_idx" ON "UserProfile"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "UserProfile_ownerUserId_kind_idx" ON "UserProfile"("ownerUserId", "kind");

-- CreateIndex
CREATE INDEX "UserProfile_countryCode_region_idx" ON "UserProfile"("countryCode", "region");

-- CreateIndex
CREATE INDEX "UserProfile_deletedAt_idx" ON "UserProfile"("deletedAt");

-- CreateIndex
CREATE INDEX "ProfileIdentifier_profileId_type_idx" ON "ProfileIdentifier"("profileId", "type");

-- CreateIndex
CREATE INDEX "ProfileIdentifier_valueBi_idx" ON "ProfileIdentifier"("valueBi");

-- CreateIndex
CREATE INDEX "ProfileIdentifier_deletedAt_idx" ON "ProfileIdentifier"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileIdentifier_profileId_type_valueBi_key" ON "ProfileIdentifier"("profileId", "type", "valueBi");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMember_profileId_key" ON "HouseholdMember"("profileId");

-- CreateIndex
CREATE INDEX "HouseholdMember_ownerUserId_status_idx" ON "HouseholdMember"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "HouseholdMember_deletedAt_idx" ON "HouseholdMember"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdConsent_tokenHash_key" ON "HouseholdConsent"("tokenHash");

-- CreateIndex
CREATE INDEX "HouseholdConsent_profileId_status_idx" ON "HouseholdConsent"("profileId", "status");

-- CreateIndex
CREATE INDEX "HouseholdConsent_status_expiresAt_idx" ON "HouseholdConsent"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_profileId_purpose_idx" ON "ConsentRecord"("profileId", "purpose");

-- CreateIndex
CREATE INDEX "ConsentRecord_removalRequestId_idx" ON "ConsentRecord"("removalRequestId");

-- CreateIndex
CREATE INDEX "ConsentRecord_createdAt_idx" ON "ConsentRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Jurisdiction_code_key" ON "Jurisdiction"("code");

-- CreateIndex
CREATE INDEX "Jurisdiction_countryCode_region_idx" ON "Jurisdiction"("countryCode", "region");

-- CreateIndex
CREATE INDEX "Jurisdiction_isActive_idx" ON "Jurisdiction"("isActive");

-- CreateIndex
CREATE INDEX "LegalRule_isActive_idx" ON "LegalRule"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LegalRule_jurisdictionId_key_key" ON "LegalRule"("jurisdictionId", "key");

-- CreateIndex
CREATE INDEX "LegalRuleVersion_status_effectiveFrom_idx" ON "LegalRuleVersion"("status", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "LegalRuleVersion_legalRuleId_version_key" ON "LegalRuleVersion"("legalRuleId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Broker_slug_key" ON "Broker"("slug");

-- CreateIndex
CREATE INDEX "Broker_category_isActive_idx" ON "Broker"("category", "isActive");

-- CreateIndex
CREATE INDEX "Broker_verificationStatus_idx" ON "Broker"("verificationStatus");

-- CreateIndex
CREATE INDEX "Broker_isDemoData_idx" ON "Broker"("isDemoData");

-- CreateIndex
CREATE INDEX "Broker_deletedAt_idx" ON "Broker"("deletedAt");

-- CreateIndex
CREATE INDEX "BrokerAlias_alias_idx" ON "BrokerAlias"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerAlias_brokerId_alias_key" ON "BrokerAlias"("brokerId", "alias");

-- CreateIndex
CREATE INDEX "BrokerContactMethod_brokerId_isActive_idx" ON "BrokerContactMethod"("brokerId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerContactMethod_brokerId_type_value_key" ON "BrokerContactMethod"("brokerId", "type", "value");

-- CreateIndex
CREATE INDEX "BrokerJurisdictionCoverage_jurisdictionId_isActive_idx" ON "BrokerJurisdictionCoverage"("jurisdictionId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerJurisdictionCoverage_brokerId_jurisdictionId_key" ON "BrokerJurisdictionCoverage"("brokerId", "jurisdictionId");

-- CreateIndex
CREATE INDEX "BrokerSeedSource_brokerId_idx" ON "BrokerSeedSource"("brokerId");

-- CreateIndex
CREATE UNIQUE INDEX "RequestTemplate_key_key" ON "RequestTemplate"("key");

-- CreateIndex
CREATE INDEX "RequestTemplate_requestType_isActive_idx" ON "RequestTemplate"("requestType", "isActive");

-- CreateIndex
CREATE INDEX "RequestTemplate_jurisdictionId_idx" ON "RequestTemplate"("jurisdictionId");

-- CreateIndex
CREATE INDEX "RequestTemplateVersion_status_idx" ON "RequestTemplateVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RequestTemplateVersion_templateId_version_key" ON "RequestTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE INDEX "RemovalRequest_userId_status_idx" ON "RemovalRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "RemovalRequest_profileId_status_idx" ON "RemovalRequest"("profileId", "status");

-- CreateIndex
CREATE INDEX "RemovalRequest_brokerId_status_idx" ON "RemovalRequest"("brokerId", "status");

-- CreateIndex
CREATE INDEX "RemovalRequest_status_deadlineAt_idx" ON "RemovalRequest"("status", "deadlineAt");

-- CreateIndex
CREATE INDEX "RemovalRequest_status_nextFollowUpAt_idx" ON "RemovalRequest"("status", "nextFollowUpAt");

-- CreateIndex
CREATE INDEX "RemovalRequest_deletedAt_idx" ON "RemovalRequest"("deletedAt");

-- CreateIndex
CREATE INDEX "RemovalRequestEvent_removalRequestId_createdAt_idx" ON "RemovalRequestEvent"("removalRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "RemovalRequestEvent_type_idx" ON "RemovalRequestEvent"("type");

-- CreateIndex
CREATE INDEX "RequestSnapshot_contentHash_idx" ON "RequestSnapshot"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "RequestSnapshot_removalRequestId_version_key" ON "RequestSnapshot"("removalRequestId", "version");

-- CreateIndex
CREATE INDEX "BrokerResponse_removalRequestId_receivedAt_idx" ON "BrokerResponse"("removalRequestId", "receivedAt");

-- CreateIndex
CREATE INDEX "BrokerResponse_classification_idx" ON "BrokerResponse"("classification");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceFile_storageKey_key" ON "EvidenceFile"("storageKey");

-- CreateIndex
CREATE INDEX "EvidenceFile_userId_kind_idx" ON "EvidenceFile"("userId", "kind");

-- CreateIndex
CREATE INDEX "EvidenceFile_removalRequestId_idx" ON "EvidenceFile"("removalRequestId");

-- CreateIndex
CREATE INDEX "EvidenceFile_isTemporary_expiresAt_idx" ON "EvidenceFile"("isTemporary", "expiresAt");

-- CreateIndex
CREATE INDEX "EvidenceFile_deletedAt_idx" ON "EvidenceFile"("deletedAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "Report_userId_status_idx" ON "Report"("userId", "status");

-- CreateIndex
CREATE INDEX "Report_deletedAt_idx" ON "Report"("deletedAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetUserId_createdAt_idx" ON "AuditLog"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_sequence_idx" ON "AuditLog"("sequence");

-- CreateIndex
CREATE INDEX "AdminAction_adminUserId_createdAt_idx" ON "AdminAction"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAction_targetUserId_createdAt_idx" ON "AdminAction"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAction_type_createdAt_idx" ON "AdminAction"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundJob_idempotencyKey_key" ON "BackgroundJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BackgroundJob_status_runAt_idx" ON "BackgroundJob"("status", "runAt");

-- CreateIndex
CREATE INDEX "BackgroundJob_type_status_idx" ON "BackgroundJob"("type", "status");

-- CreateIndex
CREATE INDEX "BackgroundJob_relatedUserId_idx" ON "BackgroundJob"("relatedUserId");

-- CreateIndex
CREATE INDEX "BackgroundJob_relatedRequestId_idx" ON "BackgroundJob"("relatedRequestId");

-- CreateIndex
CREATE INDEX "BackgroundJob_lockExpiresAt_idx" ON "BackgroundJob"("lockExpiresAt");

-- CreateIndex
CREATE INDEX "BackgroundJobLog_jobId_createdAt_idx" ON "BackgroundJobLog"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "BackgroundJobLog_level_createdAt_idx" ON "BackgroundJobLog"("level", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundEmail_status_createdAt_idx" ON "OutboundEmail"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundEmail_toAddressHash_createdAt_idx" ON "OutboundEmail"("toAddressHash", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundEmail_providerMessageId_idx" ON "OutboundEmail"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundEmail_removalRequestId_purpose_attempt_key" ON "OutboundEmail"("removalRequestId", "purpose", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailWebhookEvent_eventId_key" ON "EmailWebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "EmailWebhookEvent_processedAt_idx" ON "EmailWebhookEvent"("processedAt");

-- CreateIndex
CREATE INDEX "EmailWebhookEvent_eventType_receivedAt_idx" ON "EmailWebhookEvent"("eventType", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE INDEX "SystemSetting_category_idx" ON "SystemSetting"("category");

-- CreateIndex
CREATE UNIQUE INDEX "UserQuota_userId_key" ON "UserQuota"("userId");

-- CreateIndex
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitBucket_scope_key_windowStart_key" ON "RateLimitBucket"("scope", "key", "windowStart");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileIdentifier" ADD CONSTRAINT "ProfileIdentifier_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdConsent" ADD CONSTRAINT "HouseholdConsent_householdMemberId_fkey" FOREIGN KEY ("householdMemberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdConsent" ADD CONSTRAINT "HouseholdConsent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdConsent" ADD CONSTRAINT "HouseholdConsent_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_householdConsentId_fkey" FOREIGN KEY ("householdConsentId") REFERENCES "HouseholdConsent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_removalRequestId_fkey" FOREIGN KEY ("removalRequestId") REFERENCES "RemovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalRule" ADD CONSTRAINT "LegalRule_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalRuleVersion" ADD CONSTRAINT "LegalRuleVersion_legalRuleId_fkey" FOREIGN KEY ("legalRuleId") REFERENCES "LegalRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerAlias" ADD CONSTRAINT "BrokerAlias_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerContactMethod" ADD CONSTRAINT "BrokerContactMethod_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerJurisdictionCoverage" ADD CONSTRAINT "BrokerJurisdictionCoverage_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerJurisdictionCoverage" ADD CONSTRAINT "BrokerJurisdictionCoverage_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerSeedSource" ADD CONSTRAINT "BrokerSeedSource_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestTemplate" ADD CONSTRAINT "RequestTemplate_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestTemplateVersion" ADD CONSTRAINT "RequestTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RequestTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemovalRequest" ADD CONSTRAINT "RemovalRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemovalRequest" ADD CONSTRAINT "RemovalRequest_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemovalRequest" ADD CONSTRAINT "RemovalRequest_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemovalRequest" ADD CONSTRAINT "RemovalRequest_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemovalRequest" ADD CONSTRAINT "RemovalRequest_legalRuleVersionId_fkey" FOREIGN KEY ("legalRuleVersionId") REFERENCES "LegalRuleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemovalRequest" ADD CONSTRAINT "RemovalRequest_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "RequestTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemovalRequestEvent" ADD CONSTRAINT "RemovalRequestEvent_removalRequestId_fkey" FOREIGN KEY ("removalRequestId") REFERENCES "RemovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestSnapshot" ADD CONSTRAINT "RequestSnapshot_removalRequestId_fkey" FOREIGN KEY ("removalRequestId") REFERENCES "RemovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerResponse" ADD CONSTRAINT "BrokerResponse_removalRequestId_fkey" FOREIGN KEY ("removalRequestId") REFERENCES "RemovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerResponse" ADD CONSTRAINT "BrokerResponse_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_removalRequestId_fkey" FOREIGN KEY ("removalRequestId") REFERENCES "RemovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_removalRequestId_fkey" FOREIGN KEY ("removalRequestId") REFERENCES "RemovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_evidenceFileId_fkey" FOREIGN KEY ("evidenceFileId") REFERENCES "EvidenceFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAction" ADD CONSTRAINT "AdminAction_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAction" ADD CONSTRAINT "AdminAction_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAction" ADD CONSTRAINT "AdminAction_auditLogId_fkey" FOREIGN KEY ("auditLogId") REFERENCES "AuditLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackgroundJobLog" ADD CONSTRAINT "BackgroundJobLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_removalRequestId_fkey" FOREIGN KEY ("removalRequestId") REFERENCES "RemovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailWebhookEvent" ADD CONSTRAINT "EmailWebhookEvent_outboundEmailId_fkey" FOREIGN KEY ("outboundEmailId") REFERENCES "OutboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuota" ADD CONSTRAINT "UserQuota_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
