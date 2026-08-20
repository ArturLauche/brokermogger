/**
 * Self hosting section: what an operator needs and what stays switched off
 * until they decide otherwise.
 */
import { Section } from "@/components/marketing/section";

const REQUIREMENTS = [
  {
    title: "What you need",
    body: "A PostgreSQL database, an object store for evidence files, an email provider, and a place to run the application and its background worker. A Docker compose setup for local development ships with the source.",
  },
  {
    title: "What stays off by default",
    body: "Sending to real brokers is disabled until the operator enables it explicitly. Until then the instance behaves normally but writes outgoing mail to a local mailbox instead of the internet.",
  },
  {
    title: "What you decide",
    body: "Retention periods for evidence, closed requests, audit entries and consent records, the fair use limits, and which brokers are verified enough to be contacted.",
  },
  {
    title: "Where the data lives",
    body: "On your infrastructure. Encryption keys stay in your environment, and no part of the product reports usage anywhere.",
  },
];

export function SelfHosting() {
  return (
    <Section
      id="self-hosting"
      title="Run your own instance"
      description="The hosted setup and the self hosted setup are the same software. Nothing is held back for an operator who runs it themselves."
    >
      <ul className="grid gap-5 sm:grid-cols-2">
        {REQUIREMENTS.map((requirement) => (
          <li key={requirement.title} className="flex flex-col gap-1">
            <h3 className="font-heading font-medium">{requirement.title}</h3>
            <p className="text-sm text-pretty text-muted-foreground">
              {requirement.body}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
