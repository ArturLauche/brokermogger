import { z } from "zod";
import { findSetting } from "@/lib/config/systemSettings";
import { ValidationError } from "@/lib/core/errors";

export const settingCommandSchema = z.object({
  key: z.string().min(1).max(120),
  value: z.string().max(2000),
  expectedUpdatedAt: z.iso.datetime().or(z.literal("")),
  intent: z.enum(["save", "reset"]),
});

export function parseSettingValue(key: string, value: string) {
  const definition = findSetting(key);
  if (!definition || definition.isSensitive)
    throw new ValidationError("This setting cannot be edited here.");
  const type = typeof definition.defaultValue;
  const raw =
    type === "boolean"
      ? value === "true"
        ? true
        : value === "false"
          ? false
          : value
      : type === "number" && value.trim() !== ""
        ? Number(value)
        : value.trim();
  const parsed = definition.schema.safeParse(raw);
  if (!parsed.success)
    throw new ValidationError("Check the setting value.", {
      fieldErrors: { value: parsed.error.issues[0]?.message ?? "Invalid value." },
    });
  return parsed.data as string | number | boolean;
}
