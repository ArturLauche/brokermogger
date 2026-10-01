import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { requireActorOrRedirect } from "@/lib/auth";
import { isAppError } from "@/lib/core/errors";
import { getOwnedProfile } from "@/lib/db/repositories/profiles";
import { requirePermission } from "@/lib/permissions/policy";
import { decryptField } from "@/lib/security/crypto";
import { EditProfileForm } from "./profile-form";
export const metadata = { title: "Edit profile" };
export default async function EditProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const profile = await getOwnedProfile(actor, (await params).id)
    .then((row) => {
      requirePermission(actor, "profile:update", { ownerUserId: row.ownerUserId });
      return row;
    })
    .catch((error) => {
      if (
        isAppError(error) &&
        ["NOT_FOUND", "FORBIDDEN", "VALIDATION_FAILED"].includes(error.code)
      )
        notFound();
      throw error;
    });
  const read = (column: "legalNameEnc" | "contactEmailEnc") =>
    profile[column]
      ? decryptField(profile[column], {
          table: "UserProfile",
          column,
          recordId: profile.id,
        })
      : "";
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="Edit profile"
        description="Review the details used in this profile’s requests. Sensitive fields are shown here for editing."
      />
      <EditProfileForm
        household={profile.kind === "HOUSEHOLD_ADULT"}
        initial={{
          profileId: profile.id,
          displayName: profile.displayName,
          legalName: read("legalNameEnc"),
          contactEmail: read("contactEmailEnc"),
          countryCode: profile.countryCode,
          region: profile.region ?? "",
          residencyConfirmed: profile.residencyConfirmed ? "true" : "false",
        }}
      />
      <Link href="/vault" className="text-sm underline underline-offset-4">
        Back to data vault
      </Link>
    </div>
  );
}
