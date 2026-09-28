import type { ConsentStatus, HouseholdConsentStatus, ProfileKind } from "@prisma/client";
import { AppError } from "@/lib/core/errors";
import { profileIdentityDigest, type ProfileIdentity } from "@/lib/requests/envelope";
import { assertConsentAllowsRequests } from "./status";

export function assertCurrentProfileConsent(
  profile: ProfileIdentity & {
    id: string;
    kind: ProfileKind;
    consentStatus: ConsentStatus;
    onboardingCompletedAt: Date | null;
    householdMember: {
      revokedAt: Date | null;
      consents: {
        id: string;
        status: HouseholdConsentStatus;
        verifiedAt: Date | null;
        revokedAt: Date | null;
        scope: unknown;
      }[];
    } | null;
  }
) {
  if (profile.kind === "SELF" && !profile.onboardingCompletedAt)
    throw new AppError({
      code: "CONSENT_REQUIRED",
      message:
        "Finish profile setup and confirm your details before preparing or submitting requests.",
    });
  if (profile.consentStatus === "PENDING_CONSENT")
    assertConsentAllowsRequests({
      profileId: profile.id,
      kind: profile.kind,
      consentStatus: profile.consentStatus,
      consentVerifiedAt: null,
    });
  const consent = profile.householdMember?.consents[0];
  const bound =
    consent?.scope &&
    typeof consent.scope === "object" &&
    "profileDigest" in consent.scope &&
    consent.scope.profileDigest === profileIdentityDigest(profile);
  if (
    profile.kind !== "SELF" &&
    (profile.householdMember?.revokedAt ||
      consent?.status !== "VERIFIED" ||
      consent.revokedAt ||
      !bound)
  )
    throw new AppError({
      code: "CONSENT_INVALID",
      message:
        "Household consent is no longer valid for these profile details. A new invitation is required.",
    });
  assertConsentAllowsRequests({
    profileId: profile.id,
    kind: profile.kind,
    consentStatus: profile.consentStatus,
    consentVerifiedAt:
      profile.kind === "SELF" ? new Date() : (consent?.verifiedAt ?? null),
  });
  return consent;
}
