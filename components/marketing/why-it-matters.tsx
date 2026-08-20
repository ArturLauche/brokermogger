/**
 * Why somebody would use this at all, described without pressure: the problem
 * is the repetition and the bookkeeping, not a threat.
 */
import {
  ClipboardListIcon,
  FileTextIcon,
  ListChecksIcon,
  ShieldIcon,
} from "lucide-react";

import { Section } from "@/components/marketing/section";
import { Card, CardContent } from "@/components/ui/card";

const POINTS = [
  {
    icon: ListChecksIcon,
    title: "One place for the whole process",
    body: "Which broker was asked what, which deadline is running, what came back. Without that overview the second round of requests is guesswork.",
  },
  {
    icon: FileTextIcon,
    title: "The wording is prepared",
    body: "Each request refers to the legal basis that fits the jurisdiction and the request type, and you see the complete text before it is sent.",
  },
  {
    icon: ClipboardListIcon,
    title: "The evidence stays with you",
    body: "Sent messages, broker replies and confirmations are kept together, so you can show later what you asked for and when.",
  },
  {
    icon: ShieldIcon,
    title: "As little data as possible",
    body: "No date of birth, no identity document by default, no financial data. Every field that is collected explains why it exists.",
  },
];

export function WhyItMatters() {
  return (
    <Section
      id="why-it-matters"
      title="Why this is worth doing carefully"
      description="Data brokers collect and resell information about people who never contacted them. Many of them answer a properly worded request. The work is in the repetition: every broker has its own address, its own format and its own deadline."
    >
      <ul className="grid gap-4 sm:grid-cols-2">
        {POINTS.map((point) => (
          <li key={point.title}>
            <Card className="h-full">
              <CardContent className="flex flex-col gap-2">
                <point.icon aria-hidden="true" className="size-5 text-muted-foreground" />
                <h3 className="font-heading font-medium">{point.title}</h3>
                <p className="text-sm text-pretty text-muted-foreground">{point.body}</p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}
