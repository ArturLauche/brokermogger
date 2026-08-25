/**
 * Zod enums that match Prisma enumerations used at HTTP and job boundaries.
 */
import { z } from "zod";

export const requestTypeSchema = z.enum([
  "DELETION",
  "ACCESS",
  "CORRECTION",
  "OBJECTION",
  "OPT_OUT",
  "SUPPRESSION",
  "CONSENT_WITHDRAWAL",
  "FOLLOW_UP",
  "FINAL_REMINDER",
  "ESCALATION",
]);

export const identifierTypeSchema = z.enum([
  "FULL_NAME",
  "PREVIOUS_NAME",
  "EMAIL",
  "PHONE",
  "POSTAL_ADDRESS",
  "PREVIOUS_ADDRESS",
  "APPROXIMATE_LOCATION",
  "USERNAME",
  "OTHER",
]);

export const evidenceKindSchema = z.enum([
  "SENT_MESSAGE",
  "BROKER_RESPONSE",
  "SCREENSHOT",
  "IDENTITY_DOCUMENT",
  "REPORT",
  "OTHER",
]);

export const reportFormatSchema = z.enum(["JSON", "PDF"]);

export const householdRelationshipSchema = z.enum([
  "SELF",
  "SPOUSE_OR_PARTNER",
  "PARENT",
  "ADULT_CHILD",
  "SIBLING",
  "OTHER_ADULT",
]);

export const brokerVerificationStatusSchema = z.enum([
  "UNVERIFIED",
  "SOURCE_FOUND",
  "CONTACT_VERIFIED",
  "REQUEST_METHOD_VERIFIED",
  "RESPONSE_BEHAVIOR_VERIFIED",
  "DEPRECATED",
  "INACTIVE",
]);

export const brokerCategorySchema = z.enum([
  "PEOPLE_SEARCH",
  "MARKETING_LIST_PROVIDER",
  "LEAD_GENERATION",
  "DATA_ENRICHMENT",
  "ADTECH_AUDIENCE_DATA",
  "RECRUITMENT_PROFILE_AGGREGATION",
  "PROPERTY_PUBLIC_RECORDS",
  "RISK_IDENTITY_FRAUD",
]);

export const householdConsentDecisionSchema = z.enum(["agree", "decline"]);
