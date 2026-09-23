import type { ActionState } from "@/lib/validation/actionResult";

export function FormFeedback<T extends Record<string, string>>({
  state,
}: {
  state: ActionState<T>;
}) {
  if (state.status === "idle") return null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={state.status === "error" ? "text-sm text-destructive" : "text-sm"}
    >
      {state.message}
    </p>
  );
}

export function FieldError({
  id,
  message,
}: {
  id: string;
  message?: string | undefined;
}) {
  return (
    <p id={id} hidden={!message} className="text-sm text-destructive">
      {message}
    </p>
  );
}
