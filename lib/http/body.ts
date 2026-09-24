import { AppError } from "@/lib/core/errors";

/** Bound streamed bytes too; Content-Length alone is untrusted and often absent. */
export async function readBoundedBody(
  input: Pick<Request, "body" | "headers">,
  maxBytes: number
): Promise<string> {
  const declared = input.headers.get("content-length");
  if (declared && Number(declared) > maxBytes)
    throw new AppError({
      code: "VALIDATION_FAILED",
      status: 413,
      message: "The message exceeds the supported size.",
    });
  if (!input.body) return "";
  const reader = input.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new AppError({
          code: "VALIDATION_FAILED",
          status: 413,
          message: "The message exceeds the supported size.",
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size).toString("utf8");
}
