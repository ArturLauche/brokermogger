import { RequestChannel, RequestType } from "@prisma/client";
import type { EditorField } from "@/components/admin/editor-form";
import { REQUEST_TYPE_LABELS } from "@/lib/requests/labels";

export const templateMetadataFields: EditorField[] = [
  { name: "name", label: "Name", required: true, maxLength: 200 },
  {
    name: "description",
    label: "Description",
    kind: "textarea",
    maxLength: 2000,
    description: "Explain when operators should use this template.",
  },
];
export const templateSourceFields: EditorField[] = [
  {
    name: "subjectTemplate",
    label: "Subject template",
    required: true,
    maxLength: 1000,
    description:
      "One line. The completed subject must fit within 200 characters, including supported placeholder values.",
  },
  {
    name: "bodyTemplate",
    label: "Letter template",
    kind: "textarea",
    rows: 18,
    required: true,
    maxLength: 50_000,
    description:
      "Plain text only. Use {{variable.name}} placeholders from the reference below.",
  },
  {
    name: "locale",
    label: "Language",
    required: true,
    maxLength: 6,
    description:
      "Use a language code such as en or en-GB. This labels the text; it does not translate it.",
  },
  {
    name: "changeNotes",
    label: "Review notes",
    kind: "textarea",
    maxLength: 2000,
    description:
      "Required before publication. Describe the change, its sources and what you checked.",
  },
];
export function newTemplateFields(
  jurisdictions: { id: string; name: string }[]
): EditorField[] {
  return [
    ...templateMetadataFields,
    {
      name: "key",
      label: "Stable key",
      required: true,
      maxLength: 100,
      description:
        "Lowercase letters, numbers, dots and hyphens, such as instance.deletion. This key and the scope cannot change after creation.",
    },
    {
      name: "requestType",
      label: "Request type",
      kind: "select",
      options: Object.values(RequestType).map((value) => ({
        value,
        label: REQUEST_TYPE_LABELS[value],
      })),
    },
    {
      name: "channel",
      label: "Delivery channel",
      kind: "select",
      options: Object.values(RequestChannel).map((value) => ({
        value,
        label: value.toLowerCase().replaceAll("_", " "),
      })),
      description:
        "Email templates also provide the shared plain-letter fallback for manual channels. Channel-specific templates take precedence within the same jurisdiction.",
    },
    {
      name: "jurisdictionId",
      label: "Jurisdiction",
      kind: "select",
      options: [
        { value: "", label: "Generic — all jurisdictions" },
        ...jurisdictions.map((row) => ({ value: row.id, label: row.name })),
      ],
    },
    ...templateSourceFields,
  ];
}
