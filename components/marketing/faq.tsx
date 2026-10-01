import { PUBLIC_FAQ_ITEMS } from "@/lib/content/faq";
import { Section } from "@/components/marketing/section";

export function Faq() {
  return (
    <Section
      id="faq"
      title="Questions people ask first"
      description="If something here is unclear, the documentation of the instance goes into more detail."
    >
      <div className="max-w-3xl border-t">
        {PUBLIC_FAQ_ITEMS.map((item) => (
          <details key={item.id} id={item.id} className="border-b py-2">
            <summary className="cursor-pointer py-3 text-base font-medium">
              {item.question}
            </summary>
            <p className="max-w-prose pb-4 text-sm leading-6 text-pretty text-muted-foreground">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}
