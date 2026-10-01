import { isAppError } from "@/lib/core/errors";

/** Bad URL filters are a recoverable user state. Persistence and authorization errors still propagate. */
export async function readListResult<T>(
  operation: Promise<T>
): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await operation };
  } catch (error) {
    if (isAppError(error) && error.code === "VALIDATION_FAILED") return { ok: false };
    throw error;
  }
}
