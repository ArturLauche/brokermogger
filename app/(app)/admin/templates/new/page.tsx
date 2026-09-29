import Link from "next/link";
import { EditorForm } from "@/components/admin/editor-form";
import { TemplateReference } from "@/components/admin/template-reference";
import { PageHeader } from "@/components/common/page-header";
import { requireRole } from "@/lib/auth";
import { listActiveJurisdictions } from "@/lib/db/repositories/catalog";
import { DEFAULT_TEMPLATE_SOURCE } from "@/lib/templates/authoring";
import { createTemplateAction } from "../actions";
import { newTemplateFields } from "../fields";

export const metadata = { title: "New request template" };
export default async function NewTemplatePage() {
  await requireRole("MAINTAINER");
  const jurisdictions = await listActiveJurisdictions();
  return (
    <>
      <PageHeader
        title="New request template"
        description="Create a private catalogue draft, preview it with synthetic data, then publish it for future requests."
      />
      <Link href="/admin/templates" className="text-sm underline">
        Back to templates
      </Link>
      <div className="max-w-[680px] space-y-8">
        <EditorForm
          action={createTemplateAction}
          initialValues={{
            name: "",
            description: "",
            key: "",
            requestType: "DELETION",
            channel: "EMAIL",
            jurisdictionId: "",
            ...DEFAULT_TEMPLATE_SOURCE,
          }}
          fields={newTemplateFields(jurisdictions)}
          submitLabel="Create draft"
        />
        <TemplateReference />
      </div>
    </>
  );
}
