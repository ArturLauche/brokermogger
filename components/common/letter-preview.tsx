/** Plain correspondence, masked until a deliberate reveal; never executes broker HTML. */
export function LetterPreview({
  subject,
  body,
  label = "Reveal request text (contains personal data)",
}: {
  subject: string;
  body: string;
  label?: string;
}) {
  return (
    <details className="min-w-0 border-y py-4">
      <summary className="w-fit cursor-pointer py-2 text-sm font-medium">{label}</summary>
      <div className="max-w-prose space-y-6 py-6 text-base leading-7 [overflow-wrap:anywhere]">
        <p className="font-semibold">Subject: {subject}</p>
        <div className="whitespace-pre-wrap">{body}</div>
      </div>
    </details>
  );
}
