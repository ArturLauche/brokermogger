import Link from "next/link";
import { EditorForm } from "@/components/admin/editor-form";
import { PageHeader } from "@/components/common/page-header";
import { requireRole } from "@/lib/auth";
import { brokerFields, newBrokerValues } from "../fields";
import { saveBrokerAction } from "../actions";

export const metadata = { title: "Add broker" };
export default async function NewBrokerPage() {
  await requireRole("MAINTAINER");
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6">
      <Link href="/admin/brokers" className="text-sm underline">
        Broker administration
      </Link>
      <PageHeader
        title="Add a broker"
        description="Create a sourced catalogue entry. Sending starts disabled. Add and verify contact methods and jurisdiction coverage after saving."
      />
      <EditorForm
        action={saveBrokerAction}
        initialValues={newBrokerValues}
        fields={brokerFields}
        submitLabel="Create broker"
      />
    </div>
  );
}
