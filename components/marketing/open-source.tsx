/**
 * Open source section. The point is verifiability: the request text, the legal
 * rule and the broker record behind a request can all be read.
 */
import { Section } from "@/components/marketing/section";

const POINTS = [
  {
    title: "You can read what would be sent",
    body: "Request templates are part of the source. The rendered text is shown in full before approval and stored unchanged as the snapshot that was approved.",
  },
  {
    title: "You can check the legal rule",
    body: "Every rule version carries the law it refers to, a source link, a confidence level, the date it was last reviewed and a note about what is uncertain.",
  },
  {
    title: "You can correct the data",
    body: "Broker records, legal rules and templates are versioned. Corrections are reviewed and published as new versions instead of silent edits.",
  },
  {
    title: "Licensed under AGPL-3.0-or-later",
    body: "You may use, study, change and share the software. If you run a modified version as a service, the modified source has to stay available.",
  },
];

export function OpenSource() {
  return (
    <Section
      id="open-source"
      title="Open source, and checkable"
      description="A privacy tool that cannot be inspected asks for more trust than it deserves. This one can be read end to end."
    >
      <ul className="grid gap-5 sm:grid-cols-2">
        {POINTS.map((point) => (
          <li key={point.title} className="flex flex-col gap-1">
            <h3 className="font-heading font-medium">{point.title}</h3>
            <p className="text-sm text-pretty text-muted-foreground">{point.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
