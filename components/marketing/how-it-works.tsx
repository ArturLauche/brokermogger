/**
 * The four steps of a removal workflow, in the order the product performs
 * them. Step three exists because approval is a hard requirement, not a
 * convenience.
 */
import { Section } from "@/components/marketing/section";

interface Step {
  title: string;
  body: string;
}

const STEPS: readonly Step[] = [
  {
    title: "Describe yourself",
    body: "You enter the details a broker needs to find a record: the name they would hold, a contact address for replies, and the places you have lived. Every field explains why it is asked, whether it is optional and how to delete it again.",
  },
  {
    title: "Choose brokers",
    body: "You pick the brokers you want to contact from the directory of this instance. Each entry shows the categories of data it deals in, how well its contact details are verified and where its coverage applies.",
  },
  {
    title: "Review and approve",
    body: "Before anything is sent you see the final request text, the destination, the legal basis and the data that would be included. The request only moves on after you confirm it, and that confirmation is recorded.",
  },
  {
    title: "Track responses",
    body: "Each request keeps its own history: sent, delivered, waiting, answered, completed or rejected. Deadlines are calculated from the rule that was used, and replies can be stored as evidence.",
  },
];

export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      title="How it works"
      description="Four steps. You are in control of the third one, and nothing happens without it."
    >
      <ol className="grid gap-6 sm:grid-cols-2">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground"
            >
              {index + 1}
            </span>
            <div className="flex flex-col gap-1">
              <h3 className="font-heading font-medium">
                <span className="sr-only">Step {index + 1}: </span>
                {step.title}
              </h3>
              <p className="text-sm text-pretty text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
