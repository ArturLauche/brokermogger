/**
 * Mock email provider for development and tests.
 *
 * Never touches the network. Every message is appended to an in-memory outbox
 * and written as a readable `.eml` style file into `MOCK_EMAIL_DIR`, so a
 * developer can open the magic link without configuring a mail service.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { EmailProviderKind } from "@prisma/client";

import { env } from "@/lib/config/env";
import { createLogger } from "@/lib/observability/logger";
import { maskEmail } from "@/lib/security/masking";

import type { SendResult } from "../types";
import { formatRecipient, type ValidatedEmailMessage } from "../validate";
import { BaseEmailProvider } from "./base";

const log = createLogger("email.mock");

export interface MockOutboxEntry {
  message: ValidatedEmailMessage;
  from: string;
  /** Absolute path of the written file, null when writing failed. */
  filePath: string | null;
  sentAt: Date;
}

const outbox: MockOutboxEntry[] = [];

/** Test and development helper. Returns a copy, so callers cannot mutate it. */
export function getMockOutbox(): MockOutboxEntry[] {
  return [...outbox];
}

export function clearMockOutbox(): void {
  outbox.length = 0;
}

function renderEml(message: ValidatedEmailMessage, from: string, sentAt: Date): string {
  const headerLines = [
    `Date: ${sentAt.toUTCString()}`,
    `From: ${from}`,
    `To: ${formatRecipient(message.to)}`,
    `Subject: ${message.subject}`,
    `X-Brokermogger-Provider: mock`,
    `X-Brokermogger-Purpose: ${message.purpose}`,
    `X-Brokermogger-Idempotency-Key: ${message.idempotencyKey}`,
  ];

  if (message.replyTo) {
    headerLines.push(`Reply-To: ${message.replyTo}`);
  }

  for (const [name, value] of Object.entries(message.headers ?? {})) {
    headerLines.push(`${name}: ${value}`);
  }

  for (const [name, value] of Object.entries(message.tags ?? {})) {
    headerLines.push(`X-Brokermogger-Tag-${name}: ${value}`);
  }

  const sections = [headerLines.join("\n"), "", message.text];

  if (message.html) {
    sections.push("", "--- html part ---", message.html);
  }

  return `${sections.join("\n")}\n`;
}

function fileNameFor(message: ValidatedEmailMessage, sentAt: Date): string {
  const stamp = sentAt.toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${message.purpose.toLowerCase()}-${randomUUID().slice(0, 8)}.eml`;
}

export class MockEmailProvider extends BaseEmailProvider {
  readonly kind: EmailProviderKind = "MOCK";

  protected async dispatch(message: ValidatedEmailMessage): Promise<SendResult> {
    const sentAt = new Date();
    const from = this.fromAddress();
    const directory = env.MOCK_EMAIL_DIR;
    let filePath: string | null = null;

    try {
      await mkdir(directory, { recursive: true });
      filePath = join(directory, fileNameFor(message, sentAt));
      await writeFile(filePath, renderEml(message, from, sentAt), "utf8");
    } catch (error) {
      // A missing mail directory must never break a sign in during development.
      filePath = null;
      log.warn(
        { directory, purpose: message.purpose, err: error },
        "Could not write the mock email file"
      );
    }

    outbox.push({ message, from, filePath, sentAt });

    log.info(
      {
        purpose: message.purpose,
        maskedRecipient: maskEmail(message.to.address),
        filePath,
      },
      "Mock email captured, nothing left the instance"
    );

    return {
      provider: this.kind,
      providerMessageId: null,
      dispatched: false,
      suppressionReason: "mock_provider",
      sentAt,
    };
  }
}
