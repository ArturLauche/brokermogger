import { AppError } from "@/lib/core/errors";

/** Every successful edit invalidates its predecessor, including edits in one millisecond. */
export function nextCatalogueRevision(previous: Date) {
  return new Date(Math.max(Date.now(), previous.getTime() + 1));
}

export function assertCatalogueRevision(current: Date, expected: string) {
  if (current.toISOString() !== expected)
    throw new AppError({
      code: "CONFLICT",
      message:
        "This entry changed in another session. Reload and review the current version before saving or publishing.",
    });
}

export async function translateCatalogueConflict<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002")
      throw new AppError({
        code: "CONFLICT",
        message:
          "An entry with this key already exists. Open it to create a new version, or choose another key.",
      });
    throw error;
  }
}
