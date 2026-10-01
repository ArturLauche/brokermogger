/**
 * Security properties of the implementation, stated as facts about the code
 * rather than as reassurance.
 */
import { Section } from "@/components/marketing/section";

const PRINCIPLES = [
  {
    title: "Identifiers are encrypted",
    body: "Names, addresses, email addresses and phone numbers are stored encrypted. Lookups use a keyed index instead of the plain value, so equality checks work without storing readable data.",
  },
  {
    title: "Masked by default",
    body: "Stored identifiers show a masked preview. Revealing an identifier is recorded in the audit trail. Request letters and replies require a separate reveal action before their text is displayed.",
  },
  {
    title: "Append only history",
    body: "Ordinary edits preserve audit entries, request history, approved snapshots, and consent records. Corrections create new entries. Account or profile erasure removes personal content while retaining only the proof described by the instance policy.",
  },
  {
    title: "Nothing is sent by accident",
    body: "An outgoing broker message needs an approved snapshot, a valid consent record, a broker the operator marked as sendable, and external sending switched on for the instance.",
  },
  {
    title: "Outgoing text is sanitised",
    body: "Anything that can reach an email is cleaned first: no line breaks smuggled into headers, no unescaped HTML, no invisible characters.",
  },
  {
    title: "Administrators stay out of your data",
    body: "An instance administrator cannot read your decrypted identifiers and cannot download your evidence files. Access to another account requires an explicit, time limited grant and is recorded.",
  },
];

export function SecurityPrinciples() {
  return (
    <Section
      id="security"
      title="How your data is handled"
      description="These are properties of the implementation. You can read the code that enforces each of them."
    >
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PRINCIPLES.map((principle) => (
          <li key={principle.title} className="flex flex-col gap-1">
            <h3 className="font-heading font-semibold">{principle.title}</h3>
            <p className="text-sm leading-6 text-pretty text-muted-foreground">
              {principle.body}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
