import { z } from "zod";
import { env } from "@/lib/config/env";
import { AppError, isAppError } from "@/lib/core/errors";
import { readBoundedBody } from "@/lib/http/body";
import { correspondenceText } from "@/lib/responses/content";
import { MAX_RECEIVING_RECIPIENTS } from "./limits";

export const receivedWebhookSchema = z.object({
  type: z.literal("email.received"),
  created_at: z.iso.datetime({ offset: true }),
  data: z.object({
    email_id: z.uuid(),
    from: z.string().max(1000),
    to: z.array(z.string().max(1000)).max(MAX_RECEIVING_RECIPIENTS),
    subject: z.string().max(1000),
    created_at: z.iso.datetime({ offset: true }).optional(),
  }),
});

const receivedEmailSchema = z.object({
  id: z.uuid(),
  from: z.string().max(1000),
  to: z.array(z.string().max(1000)).max(MAX_RECEIVING_RECIPIENTS),
  created_at: z.iso.datetime({ offset: true }),
  subject: z.string().max(1000),
  text: z.string().nullable().default(null),
  html: z.string().nullable().default(null),
  message_id: z.string().max(1000).optional(),
  authentication: z
    .object({
      spf: z.string().max(100).optional(),
      dkim: z.string().max(100).optional(),
      dmarc: z.string().max(100).optional(),
    })
    .nullable()
    .optional(),
  attachments: z
    .array(z.object({ id: z.string().max(200) }))
    .max(100)
    .default([]),
});

export type RetrievedCorrespondence =
  | {
      available: false;
      reason:
        "too_large" | "content_unavailable" | "invalid_content" | "retrieval_failed";
    }
  | {
      available: true;
      providerMailId: string;
      fromAddress: string;
      to: string[];
      subject: string;
      body: string;
      receivedAt: Date;
      metadata: Record<string, unknown>;
    };

/** Receiving webhooks are metadata only. Fetch content from this fixed provider origin. */
export async function retrieveReceivedEmail(
  rawId: string
): Promise<RetrievedCorrespondence> {
  const id = z.uuid().parse(rawId);
  if (!env.RESEND_RECEIVING_DOMAIN || !env.RESEND_API_KEY)
    throw new AppError({ code: "EMAIL_FAILED", message: "Receiving is not configured." });
  let result: Response;
  try {
    result = await fetch(
      `https://api.resend.com/emails/receiving/${id}?html_format=cid`,
      {
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
        redirect: "error",
      }
    );
  } catch {
    throw new AppError({
      code: "EMAIL_FAILED",
      message: "The receiving provider could not be reached. The job can retry.",
    });
  }
  if ([400, 404, 410, 422].includes(result.status)) {
    await result.body?.cancel();
    return { available: false, reason: "content_unavailable" };
  }
  if (!result.ok) {
    await result.body?.cancel();
    throw new AppError({
      code: "EMAIL_FAILED",
      message: "The receiving provider could not supply the message. The job can retry.",
    });
  }
  try {
    const parsed = receivedEmailSchema.safeParse(
      JSON.parse(await readBoundedBody(result, 4 * 1024 * 1024))
    );
    if (!parsed.success || parsed.data.id !== id)
      return { available: false, reason: "invalid_content" };
    const mail = parsed.data;
    const body = correspondenceText(mail);
    return {
      available: true,
      providerMailId: id,
      fromAddress: mail.from,
      to: mail.to,
      subject: mail.subject,
      body,
      receivedAt: new Date(mail.created_at),
      metadata: {
        providerMailId: id,
        messageId: mail.message_id ?? null,
        authentication: mail.authentication ?? null,
        attachmentCount: mail.attachments.length,
        convertedFromHtml: !mail.text?.trim() && Boolean(mail.html),
      },
    };
  } catch (error) {
    if (isAppError(error) && error.code === "VALIDATION_FAILED")
      return { available: false, reason: "too_large" };
    return { available: false, reason: "invalid_content" };
  }
}

/** Never match legacy short references or choose the first of several references. */
export function requestReferences(text: string): string[] {
  const references = [
    ...new Set(
      [...text.matchAll(/\bBM-[a-f0-9]{32}\b/gi)].map((match) => match[0].toUpperCase())
    ),
  ];
  // An unusually long thread remains unmatched; truncation could hide a second request.
  return references.length <= 100 ? references : [];
}
