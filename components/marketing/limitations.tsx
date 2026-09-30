/**
 * The honest section.
 *
 * These statements are a product requirement, not marketing copy: the software
 * must never claim a guaranteed removal or a legal right that a jurisdiction
 * does not clearly provide. If you change the wording here, keep every claim
 * this defensive.
 */
import { Section } from "@/components/marketing/section";

const LIMITATIONS = [
  {
    title: "A broker can refuse",
    body: "A privacy request is a request. A broker may reject it, ask for identity verification first, answer only in part, or not answer at all. The product records what happened; it cannot force a decision.",
  },
  {
    title: "Some jurisdictions provide no deletion right",
    body: "Not every country and not every state gives you a right to have your data erased. Where that right does not exist, a request is a voluntary ask that a broker is free to ignore.",
  },
  {
    title: "This is not legal advice",
    body: "Brokermogger is not a law firm. The texts it prepares describe what the software does and which rule it applied. They are not advice about your situation, and using them is your decision.",
  },
  {
    title: "Success is not guaranteed",
    body: "There is no promise that your data will disappear, and no claim about how many requests succeed. Removal from one broker also does not stop another one from holding the same data.",
  },
  {
    title: "The shipped broker list is demo data",
    body: "The broker entries that come with this software are demonstration data. They stay marked as unverified until the operator of an instance checks the contact details against the broker's own published information.",
  },
  {
    title: "No automation that breaks the rules",
    body: "The product does not scrape websites, does not work around CAPTCHAs and does not log into a broker portal for you. Where a step cannot be done safely, it becomes a task for you instead.",
  },
];

export function Limitations() {
  return (
    <Section
      id="limitations"
      title="What this product cannot do"
      description="The limits are part of the product. It is better to know them before you start than after a broker has answered."
    >
      <ul className="grid gap-5 sm:grid-cols-2">
        {LIMITATIONS.map((limitation) => (
          <li key={limitation.title} className="flex flex-col gap-1">
            <h3 className="font-heading font-semibold">{limitation.title}</h3>
            <p className="text-sm leading-6 text-pretty text-muted-foreground">
              {limitation.body}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
