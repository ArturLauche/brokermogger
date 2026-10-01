import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { requireActorOrRedirect, getSessionUser } from "@/lib/auth";
import { getResumableOnboarding } from "@/lib/db/repositories/onboarding";
import { decryptField } from "@/lib/security/crypto";
import { OnboardingForm } from "./profile-form";

export const metadata = { title: "Set up your profile" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const actor = await requireActorOrRedirect();
  const profile = await getResumableOnboarding(actor);
  const user = await getSessionUser();
  const read = (column: "legalNameEnc" | "contactEmailEnc") =>
    profile?.[column]
      ? decryptField(profile[column], {
          table: "UserProfile",
          column,
          recordId: profile.id,
        })
      : "";
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title={
          profile?.onboardingCompletedAt
            ? "Your profile is ready"
            : profile
              ? "Continue profile setup"
              : "Set up your profile"
        }
        description="Provide only the details needed to match your broker records. No date of birth, government ID, biometrics or children’s data."
      />
      {profile?.onboardingCompletedAt ? (
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/requests/new">Prepare a request</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/vault/profiles/${profile.id}/edit`}>Edit profile</Link>
          </Button>
        </div>
      ) : (
        <OnboardingForm
          initial={{
            profileId: profile?.id ?? "",
            displayName: profile?.displayName ?? "My profile",
            legalName: read("legalNameEnc"),
            contactEmail: read("contactEmailEnc") || user?.email || "",
            countryCode: profile?.countryCode ?? "DE",
            region: profile?.region ?? "",
            residencyConfirmed: profile?.residencyConfirmed ? "true" : "false",
            previousNames: "",
            extraEmails: "",
            phones: "",
            location: "",
          }}
        />
      )}
    </div>
  );
}
