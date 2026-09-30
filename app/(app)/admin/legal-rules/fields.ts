import { RequestType } from "@prisma/client";
import type { EditorField } from "@/components/admin/editor-form";
import { REQUEST_TYPE_LABELS } from "@/lib/requests/labels";
import { TEMPLATE_CLAUSES } from "@/lib/templates/clauses";

const yesNo = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];
export const legalMetadataFields: EditorField[] = [
  { name: "lawName", label: "Law or policy name", required: true, maxLength: 300 },
  { name: "shortName", label: "Short name", required: true, maxLength: 150 },
  {
    name: "description",
    label: "Operator description",
    kind: "textarea",
    maxLength: 2000,
    description:
      "Explain when to select this rule. Published versions carry their own applicability and risks.",
  },
];
export const legalSourceFields: EditorField[] = [
  {
    name: "allowedChannels",
    label: "Applicable submission channels",
    kind: "checkboxes",
    section: "Scope and applicability",
    options: [
      { value: "EMAIL", label: "Email" },
      { value: "WEB_FORM", label: "Broker portal or web form" },
      { value: "POSTAL", label: "Postal" },
      { value: "API", label: "Manual API instructions" },
      { value: "DROP", label: "California DROP" },
    ],
    description:
      "Select only channels the rule supports. DROP is a separate government workflow; an ordinary email does not submit to it.",
  },
  {
    name: "supportedRequestTypes",
    label: "Supported request types",
    kind: "checkboxes",
    options: Object.values(RequestType).map((value) => ({
      value,
      label: REQUEST_TYPE_LABELS[value],
    })),
    description:
      "Include only rights the sources provide. Follow-ups, final reminders and escalation remain actions on an existing request.",
  },
  {
    name: "legalBasisText",
    label: "Legal basis in letters",
    required: true,
    maxLength: 400,
    description:
      "One plain-text line, read after “under”. Use conditional wording when scope depends on the broker or person.",
  },
  {
    name: "riskNotes",
    label: "Applicability and risks",
    kind: "textarea",
    required: true,
    rows: 6,
    maxLength: 10_000,
    description:
      "Record residency, covered organisations, exclusions, verification requirements and uncertainties. Do not promise removal.",
  },
  {
    name: "confidence",
    label: "Confidence",
    kind: "select",
    options: [
      { value: "LOW", label: "Low — uncertainty remains" },
      { value: "MEDIUM", label: "Medium — sourced, with conditions" },
      { value: "HIGH", label: "High — clearly supported by the sources" },
    ],
  },
  {
    name: "requiresLegalReview",
    label: "Require legal review",
    kind: "select",
    options: yesNo,
    description:
      "Required for low confidence or unverified timing. A confidence label is not a legal guarantee.",
  },
  {
    name: "deadlineUnit",
    label: "Response-period unit",
    kind: "select",
    section: "Response timing",
    options: [
      { value: "NONE", label: "No fixed period" },
      { value: "CALENDAR_DAYS", label: "Calendar days" },
      { value: "CALENDAR_MONTHS", label: "Calendar months" },
      { value: "BUSINESS_DAYS", label: "Business days" },
    ],
    description:
      "The original submission starts an estimate; a recorded receipt refines it. Draft creation never starts a clock.",
  },
  {
    name: "deadlinePeriod",
    label: "Response period",
    kind: "number",
    description:
      "Leave empty for no fixed period. Calendar months are not converted to days.",
  },
  {
    name: "deadlineVerified",
    label: "Period checked against primary source",
    kind: "select",
    options: yesNo,
  },
  {
    name: "deadlineSourceUrl",
    label: "Timing source URL",
    maxLength: 2000,
    description: "Public HTTPS source. Leave empty to use the primary source below.",
  },
  {
    name: "deadlineRollForward",
    label: "Non-working final day",
    kind: "select",
    options: [
      { value: "NONE", label: "No adjustment" },
      { value: "NEXT_WORKING_DAY", label: "Move to the next working day" },
    ],
    description: "Select an adjustment only when the timing source requires it.",
  },
  {
    name: "deadlineConditions",
    label: "Timing conditions",
    kind: "textarea",
    maxLength: 10_000,
    description:
      "One condition per line. Include receipt, verification, extensions and any law-specific limits.",
  },
  { name: "deadlineNotes", label: "Timing notes", kind: "textarea", maxLength: 4000 },
  {
    name: "deadlineCalendar",
    label: "Holiday calendar (JSON)",
    kind: "textarea",
    rows: 6,
    required: true,
    maxLength: 50_000,
    description:
      "Use null when unverified. A calendar declares validFrom, validThrough, holidays, nonWorkingWeekdays (0 is Sunday), sourceUrl, reviewedOn and verified. Incomplete coverage stays estimated.",
  },
  {
    name: "deadlineExtension",
    label: "Conditional extension (JSON)",
    kind: "textarea",
    rows: 5,
    required: true,
    maxLength: 6000,
    description:
      "Use null for none, or an object with unit, period, noticeRequired and conditions. Extensions and pauses are disclosed; they are not applied automatically.",
  },
  {
    name: "verificationFlags",
    label: "Expected verification",
    kind: "checkboxes",
    section: "Identity verification",
    options: [
      {
        value: "identityVerificationExpected",
        label: "Record matching or identity verification",
      },
      { value: "governmentIdExpected", label: "Government document may be requested" },
      { value: "accountRequired", label: "Broker account required" },
      { value: "notarisationExpected", label: "Notarisation may be requested" },
    ],
    description:
      "These describe the source. Documents remain optional and require a recorded broker verification request and explicit consent.",
  },
  {
    name: "authorisedAgentSupported",
    label: "Authorised-agent requests",
    kind: "select",
    options: [
      { value: "unknown", label: "Not established" },
      { value: "true", label: "Supported with stated conditions" },
      { value: "false", label: "Not supported by this rule" },
    ],
  },
  {
    name: "dataMinimisationNote",
    label: "Verification and minimisation instructions",
    kind: "textarea",
    required: true,
    maxLength: 2000,
  },
  {
    name: "escalationPath",
    label: "Manual escalation instructions",
    kind: "textarea",
    section: "Escalation",
    required: true,
    rows: 5,
    maxLength: 4000,
    description:
      "Explain the authority or review path, conditions and exceptions. The app does not submit a complaint.",
  },
  { name: "escalationAuthority", label: "Authority name", maxLength: 300 },
  { name: "escalationUrl", label: "Authority or complaint URL", maxLength: 2000 },
  {
    name: "templateClauses",
    label: "Expected letter clauses",
    kind: "checkboxes",
    options: TEMPLATE_CLAUSES.map((clause) => ({
      value: clause.key,
      label: clause.description,
    })),
    description:
      "Review the actual templates separately. The synthetic preview uses the generic letter; this list does not automatically insert clauses.",
  },
  {
    name: "sourceUrl",
    label: "Primary source URL",
    section: "Sources and review",
    required: true,
    maxLength: 2000,
  },
  { name: "sourceTitle", label: "Primary source title", required: true, maxLength: 300 },
  {
    name: "additionalSources",
    label: "Additional sources (JSON)",
    kind: "textarea",
    rows: 4,
    required: true,
    maxLength: 30_000,
    description: 'Use [] or an array of objects with "title" and a public HTTPS "url".',
  },
  {
    name: "lastReviewedOn",
    label: "Actually reviewed on",
    kind: "date",
    required: true,
    description:
      "The date someone checked these sources. A publication or seed date is not a source review.",
  },
  {
    name: "reviewedBy",
    label: "Reviewer attribution",
    required: true,
    maxLength: 200,
    description:
      "Use an operator or team attribution; do not imply counsel reviewed it unless that happened.",
  },
  {
    name: "effectiveFrom",
    label: "Effective from (UTC)",
    section: "Publication schedule",
    required: true,
    description:
      "An ISO UTC instant, such as 2027-01-01T08:00:00.000Z. Verify the law's local effective time and convert it; future versions are not selected early.",
  },
  {
    name: "effectiveUntil",
    label: "Effective until (UTC)",
    description:
      "Optional ISO UTC instant after the start. An expired replacement does not revive old law.",
  },
  {
    name: "changeNotes",
    label: "Review notes",
    kind: "textarea",
    maxLength: 2000,
    description:
      "Required before publication. Describe the changes, primary sources and applicability you checked.",
  },
];
export function newLegalRuleFields(
  jurisdictions: { id: string; name: string }[]
): EditorField[] {
  return [
    { ...legalMetadataFields[0]!, section: "Rule details" },
    ...legalMetadataFields.slice(1),
    {
      name: "key",
      label: "Stable key",
      required: true,
      maxLength: 100,
      description:
        "Lowercase letters, numbers, dots and hyphens. The key and jurisdiction cannot change after creation.",
    },
    {
      name: "jurisdictionId",
      label: "Jurisdiction",
      kind: "select",
      options: [
        { value: "", label: "Choose a jurisdiction" },
        ...jurisdictions.map((row) => ({ value: row.id, label: row.name })),
      ],
      required: true,
    },
    ...legalSourceFields,
  ];
}
