import { isAppError, type AppErrorCode } from "@/lib/core/errors";

export interface ActionState<T extends Record<string, string>> {
  status: "idle" | "error" | "success";
  message: string;
  code: AppErrorCode | null;
  fieldErrors: Partial<Record<keyof T, string>>;
  values: T;
}

export function initialActionState<T extends Record<string, string>>(
  values: T
): ActionState<T> {
  return { status: "idle", message: "", code: null, fieldErrors: {}, values };
}

export function failedAction<T extends Record<string, string>>(
  error: unknown,
  values: T
): ActionState<T> {
  const known = isAppError(error);
  const fieldErrors =
    known &&
    typeof error.details.fieldErrors === "object" &&
    error.details.fieldErrors !== null
      ? (error.details.fieldErrors as Partial<Record<keyof T, string>>)
      : {};
  return {
    status: "error",
    message: known
      ? error.message
      : "This could not be saved. Your entries are still here; try again.",
    code: known ? error.code : "INTERNAL_ERROR",
    fieldErrors,
    values,
  };
}
