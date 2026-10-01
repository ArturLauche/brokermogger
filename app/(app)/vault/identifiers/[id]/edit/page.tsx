import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { requireActorOrRedirect } from "@/lib/auth";
import { isAppError } from "@/lib/core/errors";
import { revealOwnedIdentifier } from "@/lib/db/repositories/profiles";
import { IdentifierForm } from "../../../identifier-form";
export const metadata = { title: "Edit identifier" };
export default async function EditIdentifierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const row = await revealOwnedIdentifier(actor, (await params).id).catch((error) => {
    if (
      isAppError(error) &&
      ["NOT_FOUND", "FORBIDDEN", "VALIDATION_FAILED"].includes(error.code)
    )
      notFound();
    throw error;
  });
  if (row.isPrimary && ["FULL_NAME", "EMAIL"].includes(row.type))
    redirect(`/vault/profiles/${row.profileId}/edit`);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="Edit identifier"
        description="The stored value is shown here for editing. Affected drafts need fresh review after a change."
      />
      <IdentifierForm
        initial={{
          identifierId: row.id,
          profileId: row.profileId,
          type: row.type,
          value: row.value,
          label: row.label ?? "",
        }}
      />
      <Link href="/vault" className="text-sm underline underline-offset-4">
        Back to data vault
      </Link>
    </div>
  );
}
