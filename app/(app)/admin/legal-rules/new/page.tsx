import Link from "next/link";
import { EditorForm } from "@/components/admin/editor-form";
import { PageHeader } from "@/components/common/page-header";
import { requireRole } from "@/lib/auth";
import { listActiveJurisdictions } from "@/lib/db/repositories/catalog";
import { DEFAULT_LEGAL_SOURCE } from "@/lib/jurisdiction/authoring";
import { createLegalRuleAction } from "../actions";
import { newLegalRuleFields } from "../fields";

export const metadata = { title: "New legal rule" };
export default async function NewLegalRulePage() {
  await requireRole("MAINTAINER");
  const jurisdictions = await listActiveJurisdictions();
  return (
    <>
      <PageHeader
        title="New legal rule"
        description="Create an inactive, sourced draft. Review applicability, timing and the saved synthetic preview before publishing."
      />
      <Link className="text-sm underline" href="/admin/legal-rules">
        Back to legal rules
      </Link>
      <div className="max-w-[680px]">
        <EditorForm
          action={createLegalRuleAction}
          initialValues={{
            lawName: "",
            shortName: "",
            description: "",
            key: "",
            jurisdictionId: "",
            ...DEFAULT_LEGAL_SOURCE,
          }}
          fields={newLegalRuleFields(jurisdictions)}
          submitLabel="Create legal draft"
        />
      </div>
    </>
  );
}
