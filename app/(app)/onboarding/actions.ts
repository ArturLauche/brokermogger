"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { secureCookiesEnabled } from "@/lib/auth/cookies";
import { ACTIVE_PROFILE_COOKIE } from "@/lib/profiles/active";
import { saveOnboardingProfile } from "@/lib/profiles/onboarding";
import { parseAdditionalOnboardingIdentifiers } from "@/lib/profiles/onboardingIdentifiers";
import { failedAction, type ActionState } from "@/lib/validation/actionResult";
import { formCheckbox, formString } from "@/lib/validation/form";

export type OnboardingFields = {
  profileId: string;
  displayName: string;
  legalName: string;
  contactEmail: string;
  countryCode: string;
  region: string;
  residencyConfirmed: string;
  previousNames: string;
  extraEmails: string;
  phones: string;
  location: string;
};

export async function saveOnboarding(
  _previous: ActionState<OnboardingFields>,
  formData: FormData
): Promise<ActionState<OnboardingFields>> {
  const actor = await requireActor();
  const values: OnboardingFields = {
    profileId: formString(formData, "profileId"),
    displayName: formString(formData, "displayName"),
    legalName: formString(formData, "legalName"),
    contactEmail: formString(formData, "contactEmail"),
    countryCode: formString(formData, "countryCode"),
    region: formString(formData, "region"),
    residencyConfirmed: formCheckbox(formData, "residencyConfirmed") ? "true" : "false",
    previousNames: formString(formData, "previousNames"),
    extraEmails: formString(formData, "extraEmails"),
    phones: formString(formData, "phones"),
    location: formString(formData, "location"),
  };
  let sources: (keyof OnboardingFields)[] = [];
  let result;
  try {
    const parsed = parseAdditionalOnboardingIdentifiers(values);
    sources = parsed.sources;
    result = await saveOnboardingProfile(actor, {
      profileId: values.profileId || null,
      complete: formString(formData, "intent") !== "save",
      profile: {
        displayName: values.displayName,
        legalName: values.legalName,
        contactEmail: values.contactEmail,
        countryCode: values.countryCode,
        region: values.region || null,
        residencyConfirmed: values.residencyConfirmed === "true",
      },
      identifiers: parsed.identifiers,
    });
  } catch (error) {
    const failed = failedAction(error, values);
    failed.fieldErrors = Object.fromEntries(
      Object.entries(failed.fieldErrors).map(([key, message]) => {
        const index = /^identifiers\.(\d+)/.exec(key)?.[1];
        return [
          index
            ? (sources[Number(index)] ?? "extraEmails")
            : key.replace(/^profile\./, ""),
          message,
        ];
      })
    );
    return failed;
  }
  const jar = await cookies();
  jar.set(ACTIVE_PROFILE_COOKIE, result.profileId, {
    httpOnly: true,
    secure: secureCookiesEnabled(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  if (result.completed) redirect("/dashboard");
  return {
    status: "success",
    code: null,
    message:
      "Your profile is saved. You can return to finish setup. Saved identifiers are available in the data vault.",
    fieldErrors: {},
    values: {
      ...values,
      profileId: result.profileId,
      previousNames: "",
      extraEmails: "",
      phones: "",
      location: "",
    },
  };
}
