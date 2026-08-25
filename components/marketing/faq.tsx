/**
 * Frequently asked questions.
 *
 * The accordion opens every item by default. That keeps the answers readable
 * when JavaScript is unavailable and still lets a reader collapse what they
 * have already read.
 */
import { PUBLIC_FAQ_ITEMS } from "@/lib/content/faq";
import { Section } from "@/components/marketing/section";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function Faq() {
  return (
    <Section
      id="faq"
      title="Questions people ask first"
      description="If something here is unclear, the documentation of the instance goes into more detail."
    >
      <Accordion
        type="multiple"
        defaultValue={PUBLIC_FAQ_ITEMS.map((item) => item.id)}
        className="max-w-3xl"
      >
        {PUBLIC_FAQ_ITEMS.map((item) => (
          <AccordionItem key={item.id} value={item.id}>
            {/* Radix renders the trigger inside an h3, so the question must
                not carry its own heading element. */}
            <AccordionTrigger>{item.question}</AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-pretty text-muted-foreground">{item.answer}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  );
}
