"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { recordAudit } from "@/lib/audit/service";
import { requireActor } from "@/lib/auth";
import { appendConsentRecord } from "@/lib/db/repositories/consent";
import {
  addIdentifier,
  createSelfProfile,
  markOnboardingComplete,
} from "@/lib/db/repositories/profiles";
import { ACTIVE_PROFILE_COOKIE } from "@/lib/profiles/active";
import { sanitiseText } from "@/lib/security/sanitize";

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  country: z.string().length(2),
  region: z.string().trim().max(80).optional(),
  residencyConfirmed: z.literal("on").or(z.literal("true")),
  previousNames: z.string().max(400).optional(),
  extraEmails: z.string().max(400).optional(),
  phones: z.string().max(400).optional(),
  location: z.string().max(80).optional(),
});

export async function saveOnboarding(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
    country: String(formData.get("country") ?? "").toUpperCase(),
    region: formData.get("region") || undefined,
    residencyConfirmed: formData.get("residencyConfirmed") ?? "",
    previousNames: formData.get("previousNames") || undefined,
    extraEmails: formData.get("extraEmails") || undefined,
    phones: formData.get("phones") || undefined,
    location: formData.get("location") || undefined,
  });

  if (!parsed.success) {
    redirect("/onboarding?error=validation");
  }

  const data = parsed.data;
  const fullName = sanitiseText(data.fullName, { fieldName: "fullName" });
  const region =
    data.country === "US"
      ? sanitiseText(data.region ?? "", { fieldName: "region" }).toUpperCase()
      : data.region
        ? sanitiseText(data.region, { fieldName: "region" })
        : null;

  if (data.country === "US" && !region) {
    redirect("/onboarding?error=region");
  }

  const profile = await createSelfProfile(actor, {
    displayName: "My profile",
    legalName: fullName,
    countryCode: data.country,
    region,
    residencyConfirmed: true,
    contactEmail: data.email,
  });

  await addIdentifier(actor, profile.id, {
    type: "FULL_NAME",
    value: fullName,
    isPrimary: true,
  });
  await addIdentifier(actor, profile.id, {
    type: "EMAIL",
    value: data.email,
    isPrimary: true,
  });

  const extras = [
    ...(data.previousNames ?? "")
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => ({ type: "PREVIOUS_NAME" as const, value })),
    ...(data.extraEmails ?? "")
      .split("\n")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
      .map((value) => ({ type: "EMAIL" as const, value })),
    ...(data.phones ?? "")
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => ({ type: "PHONE" as const, value })),
    ...(data.location
      ? [{ type: "APPROXIMATE_LOCATION" as const, value: data.location.trim() }]
      : []),
  ];

  for (const extra of extras) {
    await addIdentifier(actor, profile.id, extra);
  }

  const statement =
    "I confirm that this profile is about me, that I live in the country I selected, and that I understand Brokermogger is not a law firm and does not guarantee removal.";

  await appendConsentRecord({
    profileId: profile.id,
    actorUserId: actor.userId,
    purpose: "PROFILE_MANAGEMENT",
    method: "SELF_ATTESTATION",
    status: "SELF",
    statementText: statement,
  });

  await markOnboardingComplete(actor, profile.id);
  const jar = await cookies();
  jar.set(ACTIVE_PROFILE_COOKIE, profile.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  await recordAudit({
    actor,
    action: "profile.created",
    resourceType: "profile",
    resourceId: profile.id,
  });
  await recordAudit({
    actor,
    action: "consent.recorded",
    resourceType: "consent_record",
    resourceId: profile.id,
  });

  redirect("/dashboard");
}
