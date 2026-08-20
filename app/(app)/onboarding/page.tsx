import type { ReactNode } from "react";

import { WhyWeAsk } from "@/components/common/why-we-ask";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireActorOrRedirect } from "@/lib/auth";

import { saveOnboarding } from "./actions";

export const metadata = { title: "Onboarding" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireActorOrRedirect();
  const { error } = await searchParams;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Set up your profile"
        description="Only what is needed to match broker records. Date of birth, government ID, biometrics and children's data are not collected."
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>The profile could not be saved</AlertTitle>
          <AlertDescription>
            {error === "region"
              ? "United States residents must select a state or region so California can be distinguished from other states."
              : "Check the required fields. Full name, email, country and residency confirmation are required."}
          </AlertDescription>
        </Alert>
      ) : null}

      <form action={saveOnboarding} className="flex flex-col gap-6">
        <section className="flex flex-col gap-4 rounded-xl border p-4">
          <h2 className="font-heading text-lg font-medium">1. Basic profile</h2>
          <Field
            id="fullName"
            label="Full name"
            required
            why="Used as the legal name in generated requests so a broker can match their records."
          >
            <Input
              id="fullName"
              name="fullName"
              required
              maxLength={120}
              autoComplete="name"
            />
          </Field>
          <Field
            id="email"
            label="Email"
            required
            why="The address brokers should reply to for this profile. Also used to sign you in."
          >
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </Field>
          <Field
            id="country"
            label="Country"
            required
            why="Selects the jurisdiction pack (for example California, GDPR, UK GDPR)."
          >
            <select
              id="country"
              name="country"
              required
              className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
              defaultValue="DE"
            >
              <option value="US">United States</option>
              <option value="DE">Germany</option>
              <option value="GB">United Kingdom</option>
              <option value="BR">Brazil</option>
              <option value="IN">India</option>
              <option value="AU">Australia</option>
              <option value="SG">Singapore</option>
              <option value="FR">France (GDPR pack via Germany)</option>
            </select>
          </Field>
          <Field
            id="region"
            label="State or region"
            why="Required for United States residents so California is not treated as a generic US state."
          >
            <Input id="region" name="region" maxLength={80} placeholder="CA" />
          </Field>
          <div className="flex items-start gap-2">
            <input
              id="residencyConfirmed"
              name="residencyConfirmed"
              type="checkbox"
              required
              value="on"
              className="mt-1 size-4"
            />
            <div>
              <Label htmlFor="residencyConfirmed">I live in this country</Label>
              <WhyWeAsk
                field="residency confirmation"
                purpose="Legal rules depend on where you live. Confirming residency is required before a pack is selected."
                requirement="required"
                deletion="You can delete the profile later from the data vault."
              />
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-xl border p-4">
          <h2 className="font-heading text-lg font-medium">2. Matching identifiers</h2>
          <p className="text-sm text-muted-foreground">Optional. One value per line.</p>
          <Field
            id="previousNames"
            label="Previous names"
            why="Some directories still list a former name."
          >
            <Textarea id="previousNames" name="previousNames" rows={2} />
          </Field>
          <Field
            id="extraEmails"
            label="Additional email addresses"
            why="Brokers often key records off extra addresses."
          >
            <Textarea id="extraEmails" name="extraEmails" rows={2} />
          </Field>
          <Field id="phones" label="Phone numbers" why="People-search matching.">
            <Textarea id="phones" name="phones" rows={2} />
          </Field>
          <Field
            id="location"
            label="Approximate location"
            why="City or region only. Helps narrow directory matches. Optional."
          >
            <Input id="location" name="location" maxLength={80} />
          </Field>
        </section>

        <section className="flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="font-heading text-lg font-medium">3. Address details</h2>
          <p className="text-sm text-muted-foreground">
            Postal addresses are optional. Add them later in the data vault if a selected
            broker actually needs them.
          </p>
        </section>

        <section className="flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="font-heading text-lg font-medium">4. Sensitive verification</h2>
          <Alert>
            <AlertTitle>Identity documents are not collected by default</AlertTitle>
            <AlertDescription>
              A broker that later requires identity proof will ask on that request.
              Biometric data is never requested. Children&apos;s data is not collected in
              this version.
            </AlertDescription>
          </Alert>
        </section>

        <section className="flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="font-heading text-lg font-medium">5. Review and save</h2>
          <p className="text-sm text-muted-foreground">
            Required fields: full name, email, country, residency. Everything else is
            optional and can be deleted later from the data vault. Brokermogger is not a
            law firm and does not guarantee removal.
          </p>
          <Button type="submit">Save profile</Button>
        </section>
      </form>
    </div>
  );
}

function Field({
  id,
  label,
  why,
  required,
  children,
}: {
  id: string;
  label: string;
  why: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={id}>
          {label}
          {required ? " (required)" : " (optional)"}
        </Label>
        <WhyWeAsk
          field={label.toLowerCase()}
          purpose={why}
          requirement={required ? "required" : "optional"}
          deletion="You can delete this later from the data vault."
        />
      </div>
      {children}
    </div>
  );
}
