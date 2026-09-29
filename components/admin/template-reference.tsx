import { TEMPLATE_VARIABLES } from "@/lib/templates/variables";

export function TemplateReference() {
  return (
    <details className="border-t py-5">
      <summary className="cursor-pointer py-2 font-semibold">
        Template variable reference
      </summary>
      <p className="mt-3 text-sm text-muted-foreground">
        Placeholders only substitute plain text. There are no expressions, loops or
        conditional blocks. Optional values render empty when they do not apply.
      </p>
      <dl className="mt-4 divide-y">
        {TEMPLATE_VARIABLES.map((variable) => (
          <div
            key={variable.name}
            className="grid gap-1 py-3 sm:grid-cols-[15rem_1fr] sm:gap-4"
          >
            <dt className="text-sm font-medium">
              <code>{`{{${variable.name}}}`}</code>
            </dt>
            <dd className="space-y-1 text-sm">
              <p>{variable.description}</p>
              <p className="text-muted-foreground">
                {variable.required ? "Required when used" : "Optional"} · maximum{" "}
                {variable.maxLength} characters
              </p>
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
