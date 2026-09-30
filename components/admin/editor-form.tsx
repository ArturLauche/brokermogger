"use client";

import { useActionState, useId, useState } from "react";
import { FieldError, FormFeedback } from "@/components/common/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type ActionState, initialActionState } from "@/lib/validation/actionResult";

export type EditorValues = Record<string, string>;
export interface EditorField {
  name: string;
  label: string;
  kind?: "text" | "number" | "date" | "textarea" | "select" | "checkboxes";
  description?: string;
  required?: boolean;
  maxLength?: number;
  rows?: number;
  options?: { value: string; label: string }[];
}

/** Small, native-control editor shared by public catalogue and instance configuration. */
export function EditorForm({
  action,
  initialValues,
  fields,
  submitLabel = "Save changes",
  allowReset = false,
}: {
  action: (
    state: ActionState<EditorValues>,
    data: FormData
  ) => Promise<ActionState<EditorValues>>;
  initialValues: EditorValues;
  fields: EditorField[];
  submitLabel?: string;
  allowReset?: boolean;
}) {
  const prefix = useId();
  const [values, setValues] = useState(initialValues);
  const [state, submit, pending] = useActionState(
    action,
    initialActionState(initialValues)
  );
  const visible = new Set(fields.map((field) => field.name));
  return (
    <form
      action={submit}
      className="min-w-0 space-y-5 [overflow-wrap:anywhere]"
      aria-busy={pending}
    >
      {Object.entries(values)
        .filter(([key]) => !visible.has(key))
        .map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
      <FormFeedback state={state} />
      {fields.map((field) => {
        const id = `${prefix}-${field.name}`;
        const error =
          state.fieldErrors[field.name] ??
          Object.entries(state.fieldErrors).find(([key]) =>
            key.startsWith(`${field.name}.`)
          )?.[1];
        if (field.kind === "checkboxes") {
          const selected = (values[field.name] ?? "").split(",").filter(Boolean);
          return (
            <fieldset
              key={field.name}
              className="space-y-2"
              aria-describedby={`${id}-help ${id}-error`}
              aria-invalid={!!error}
            >
              <legend className="text-sm font-medium">{field.label}</legend>
              <p
                id={`${id}-help`}
                className="text-sm text-muted-foreground"
                hidden={!field.description}
              >
                {field.description}
              </p>
              <input type="hidden" name={field.name} value={selected.join(",")} />
              <div className="grid gap-x-6 sm:grid-cols-2">
                {field.options?.map((option) => (
                  <label
                    key={option.value}
                    className="flex min-h-11 items-center gap-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      disabled={pending}
                      checked={selected.includes(option.value)}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [field.name]: (event.target.checked
                            ? [...selected, option.value]
                            : selected.filter((v) => v !== option.value)
                          ).join(","),
                        }))
                      }
                      className="size-4 accent-primary"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              <FieldError id={`${id}-error`} message={error} />
            </fieldset>
          );
        }
        const props = {
          id,
          name: field.name,
          value: values[field.name] ?? "",
          required: field.required,
          disabled: pending,
          "aria-invalid": !!error,
          "aria-describedby": `${id}-help ${id}-error`,
          onChange: (
            event: React.ChangeEvent<
              HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
            >
          ) => setValues((current) => ({ ...current, [field.name]: event.target.value })),
        };
        return (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={id}>{field.label}</Label>
            <p
              id={`${id}-help`}
              className="text-sm text-muted-foreground"
              hidden={!field.description}
            >
              {field.description}
            </p>
            {field.kind === "select" ? (
              <select
                {...props}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:h-10 md:text-sm"
              >
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.kind === "textarea" ? (
              <Textarea {...props} maxLength={field.maxLength} rows={field.rows ?? 4} />
            ) : (
              <Input
                {...props}
                type={field.kind ?? "text"}
                maxLength={field.maxLength}
                className="h-11 md:h-10"
              />
            )}
            <FieldError id={`${id}-error`} message={error} />
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" name="intent" value="save" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {allowReset ? (
          <Button
            type="submit"
            name="intent"
            value="reset"
            variant="outline"
            disabled={pending}
            formNoValidate
          >
            Use default
          </Button>
        ) : null}
      </div>
    </form>
  );
}
