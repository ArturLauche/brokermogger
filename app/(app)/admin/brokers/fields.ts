import { DataCategory } from "@prisma/client";
import type { EditorField } from "@/components/admin/editor-form";
import {
  brokerCategorySchema,
  brokerVerificationStatusSchema,
} from "@/lib/validation/enums";
import { INITIAL_REQUEST_TYPES } from "@/lib/requests/initial";
import { REQUEST_TYPE_LABELS } from "@/lib/requests/labels";

const humanize = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
const options = (values: readonly string[]) =>
  values.map((value) => ({ value, label: humanize(value) }));
const boolean = (name: string, label: string, description?: string): EditorField => ({
  name,
  label,
  kind: "select",
  options: [
    { value: "false", label: "No" },
    { value: "true", label: "Yes" },
  ],
  ...(description ? { description } : {}),
});

export const brokerFields: EditorField[] = [
  {
    name: "legalName",
    label: "Legal name",
    required: true,
    maxLength: 200,
    description: "Public company name used in the directory and request letters.",
  },
  {
    name: "slug",
    label: "Catalogue key",
    required: true,
    maxLength: 100,
    description:
      "A unique, stable key such as example-broker. Lowercase letters, digits and hyphens.",
  },
  {
    name: "websiteUrl",
    label: "Company website",
    description:
      "A public HTTP or HTTPS address. This instance does not fetch or scrape it.",
  },
  {
    name: "category",
    label: "Category",
    kind: "select",
    options: options(brokerCategorySchema.options),
  },
  {
    name: "tradingNames",
    label: "Trading names",
    kind: "textarea",
    maxLength: 2000,
    description: "Public alternative names, one per line. Optional.",
  },
  {
    name: "countriesServed",
    label: "Countries served",
    description:
      "Directory information only. Enter two-letter uppercase codes separated by commas, such as DE, US. Configure legal coverage separately below.",
  },
  {
    name: "dataCategories",
    label: "Reported data categories",
    kind: "checkboxes",
    options: options(Object.values(DataCategory)),
    description:
      "Describe the broker’s activities from public sources. These choices do not collect those data from users.",
  },
  {
    name: "sourceUrl",
    label: "Primary source URL",
    description: "The public source for this entry and its request instructions.",
  },
  {
    name: "lastVerifiedAt",
    label: "Last reviewed on",
    kind: "date",
    description:
      "When an operator actually checked this entry. Do not use an automated seed or build date.",
  },
  {
    name: "verificationStatus",
    label: "Verification stage",
    kind: "select",
    options: options(brokerVerificationStatusSchema.options),
  },
  {
    name: "confidenceScore",
    label: "Catalogue confidence (0–100)",
    kind: "number",
    description:
      "Confidence in this entry’s sourced information; this is not a removal probability.",
  },
  boolean("isActive", "Active in the directory"),
  boolean(
    "isDemoData",
    "Fictional demo data",
    "Keep this enabled for fictional examples. Demo entries cannot send to real brokers."
  ),
  boolean(
    "productionUnsafeFlag",
    "Unsafe for automated sending",
    "Enable when the current method cannot be safely automated."
  ),
  boolean(
    "manualReviewRequired",
    "Require manual review",
    "Explain any unusual requirements in the operator notes."
  ),
  boolean(
    "expectsIdentityDocument",
    "Source mentions an identity document",
    "This flags manual review only. Uploads remain optional and unavailable until a broker actually requests verification and the user consents."
  ),
  boolean(
    "accountRequired",
    "Method requires a broker account",
    "Users complete any login themselves; Brokermogger never bypasses it."
  ),
  boolean("notarisationRequired", "Source mentions notarisation"),
  {
    name: "verificationInstructions",
    label: "Verification and manual steps",
    kind: "textarea",
    maxLength: 4000,
    description:
      "Public instructions and limitations. Cite the source and distinguish confirmed requirements from uncertainty.",
  },
  {
    name: "riskTier",
    label: "Review tier",
    kind: "select",
    options: options(["STANDARD", "ELEVATED", "RESTRICTED"]),
  },
  {
    name: "notes",
    label: "Operator notes",
    kind: "textarea",
    maxLength: 4000,
    description:
      "Public request requirements, limitations and source context. Do not include personal identifiers or private correspondence.",
  },
];

export const newBrokerValues = {
  brokerId: "",
  expectedUpdatedAt: "",
  slug: "",
  legalName: "",
  websiteUrl: "",
  category: "PEOPLE_SEARCH",
  tradingNames: "",
  countriesServed: "",
  dataCategories: "",
  sourceUrl: "",
  lastVerifiedAt: "",
  verificationStatus: "UNVERIFIED",
  confidenceScore: "0",
  isActive: "true",
  isDemoData: "false",
  productionUnsafeFlag: "false",
  manualReviewRequired: "true",
  expectsIdentityDocument: "false",
  accountRequired: "false",
  notarisationRequired: "false",
  verificationInstructions: "",
  riskTier: "STANDARD",
  notes: "",
};

export const contactFields: EditorField[] = [
  {
    name: "type",
    label: "Contact method",
    kind: "select",
    options: options([
      "EMAIL",
      "WEB_FORM",
      "PRIVACY_PORTAL_URL",
      "POSTAL",
      "API",
      "DROP_PLATFORM",
    ]),
  },
  {
    name: "value",
    label: "Destination",
    kind: "textarea",
    required: true,
    maxLength: 2000,
    description:
      "The public email, URL or postal address. Portal, postal, API and DROP instructions remain manual tasks.",
  },
  {
    name: "label",
    label: "Method label",
    maxLength: 120,
    description: "A short description, such as privacy portal or postal privacy team.",
  },
  boolean(
    "isActive",
    "Method is active",
    "Set to No to retire a method while preserving historical requests."
  ),
  boolean(
    "isPreferred",
    "Preferred method",
    "Only one method is preferred. Verified methods are selected before unverified methods."
  ),
  {
    name: "priority",
    label: "Priority (0–1000)",
    kind: "number",
    description: "Lower numbers come first among otherwise equivalent methods.",
  },
  boolean(
    "isVerified",
    "I verified this destination against the source below",
    "Saving an edit requires this confirmation again; otherwise the method becomes unverified."
  ),
  { name: "verifiedAt", label: "Verified on", kind: "date" },
  { name: "sourceUrl", label: "Verification source URL" },
  {
    name: "verificationNote",
    label: "Verification evidence and instructions",
    kind: "textarea",
    maxLength: 2000,
    description:
      "Describe what the source confirms, manual steps and any restrictions. Do not contact the broker to test it or include private data.",
  },
];
export const newContactValues = {
  contactId: "",
  type: "EMAIL",
  value: "",
  label: "",
  isActive: "true",
  isPreferred: "false",
  priority: "100",
  isVerified: "false",
  verifiedAt: "",
  sourceUrl: "",
  verificationNote: "",
};

export function coverageFields(
  jurisdictions: { id: string; name: string; code: string }[]
): EditorField[] {
  return [
    {
      name: "jurisdictionId",
      label: "Jurisdiction",
      kind: "select",
      required: true,
      options: [
        { value: "", label: "Choose a jurisdiction" },
        ...jurisdictions.map((j) => ({ value: j.id, label: `${j.name} (${j.code})` })),
      ],
    },
    {
      name: "coverageType",
      label: "Basis for coverage",
      kind: "select",
      options: options(["UNKNOWN", "STATUTORY", "VOLUNTARY_OPT_OUT"]),
    },
    {
      name: "supportedRequestTypes",
      label: "Supported initial requests",
      kind: "checkboxes",
      options: INITIAL_REQUEST_TYPES.map((type) => ({
        value: type,
        label: REQUEST_TYPE_LABELS[type],
      })),
      description:
        "Only select types supported by the recorded source. Follow-ups belong to an existing initial request.",
    },
    {
      name: "confidence",
      label: "Confidence in coverage",
      kind: "select",
      options: options(["LOW", "MEDIUM", "HIGH"]),
    },
    boolean("isActive", "Coverage is active"),
    {
      name: "notes",
      label: "Source and applicability conditions",
      kind: "textarea",
      required: true,
      maxLength: 2000,
      description:
        "Record a primary source URL and any thresholds, exclusions, manual requirements or uncertainty. A country choice does not by itself establish a statutory right.",
    },
  ];
}
export const newCoverageValues = {
  jurisdictionId: "",
  coverageType: "UNKNOWN",
  supportedRequestTypes: "",
  confidence: "LOW",
  isActive: "true",
  notes: "",
};
