/**
 * FormData parsing at the server-action boundary.
 *
 * Actions stay thin: they parse, then call domain services. Invalid input is a
 * `ValidationError` with a stable code, never an unsafe enum cast.
 */
import type { ZodType } from "zod";

import { ValidationError } from "@/lib/core/errors";

export function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function formStrings(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

export function formCheckbox(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === "on" || value === "true" || value === "1";
}

export function parseWithSchema<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError("The submitted values are not valid.", {
      issues: parsed.error.issues.map((issue) => issue.path.join(".")).filter(Boolean),
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])
      ),
    });
  }
  return parsed.data;
}
