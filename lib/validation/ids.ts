/**
 * Shared boundary schemas for identifiers that arrive from forms, routes and
 * job payloads. Prisma uses cuid for most rows; some ledgers use UUID.
 */
import { z } from "zod";

/** Cuid or UUID, never an empty or oversized client string. */
export const entityIdSchema = z.string().trim().min(1).max(64);

export const optionalEntityIdSchema = z
  .string()
  .trim()
  .max(64)
  .transform((value) => (value.length === 0 ? null : value));

export const isoDateSchema = z
  .string()
  .trim()
  .min(8)
  .max(40)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: "Enter a valid date.",
  })
  .transform((value) => new Date(value));
