/** The narrow database adapter for this instance's email-only Auth.js contract. */
import { randomUUID } from "node:crypto";
import type { Adapter } from "@auth/core/adapters";

import { AppError } from "@/lib/core/errors";
import { prisma } from "@/lib/db/client";
import {
  accountEmailIndex,
  encryptedAccountEmail,
  readAccountEmail,
  verificationEmailIndex,
} from "@/lib/security/accountEmail";

export function createAuthAdapter(): Adapter {
  return {
    async createUser(input) {
      const id = randomUUID();
      const row = await prisma.user.create({
        data: {
          id,
          ...encryptedAccountEmail(id, input.email),
          emailVerified: input.emailVerified,
          name: input.name ?? null,
          image: null,
        },
      });
      return readAccountEmail(row);
    },
    async getUser(id) {
      const row = await prisma.user.findUnique({ where: { id } });
      return row ? readAccountEmail(row) : null;
    },
    async getUserByEmail(email) {
      const row = await prisma.user.findFirst({
        where: {
          OR: [
            { emailBi: accountEmailIndex(email) },
            {
              emailEnc: null,
              email: { equals: email.trim().toLowerCase(), mode: "insensitive" },
            },
          ],
        },
      });
      return row ? readAccountEmail(row) : null;
    },
    async updateUser(input) {
      const row = await prisma.user.update({
        where: { id: input.id },
        data: {
          ...(input.email ? encryptedAccountEmail(input.id, input.email) : {}),
          ...(input.emailVerified !== undefined
            ? { emailVerified: input.emailVerified }
            : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
        },
      });
      return readAccountEmail(row);
    },
    async createSession(input) {
      return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;
        const active = await tx.user.findFirst({
          where: {
            id: input.userId,
            status: "ACTIVE",
            deletionRequestedAt: null,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!active)
          throw new AppError({
            code: "FORBIDDEN",
            message: "This account is not active.",
          });
        return tx.session.create({ data: input });
      });
    },
    async getSessionAndUser(sessionToken) {
      const row = await prisma.session.findFirst({
        where: {
          sessionToken,
          expires: { gt: new Date() },
          user: { status: "ACTIVE", deletionRequestedAt: null, deletedAt: null },
        },
        include: { user: true },
      });
      if (!row) return null;
      const { user, ...session } = row;
      return { user: readAccountEmail(user), session };
    },
    async updateSession(input) {
      const changed = await prisma.session.updateMany({
        where: {
          sessionToken: input.sessionToken,
          user: { status: "ACTIVE", deletionRequestedAt: null, deletedAt: null },
        },
        data: { ...(input.expires ? { expires: input.expires } : {}) },
      });
      return changed.count
        ? prisma.session.findUnique({ where: { sessionToken: input.sessionToken } })
        : null;
    },
    async deleteSession(sessionToken) {
      try {
        // Auth.js passes this row to the sign-out audit event.
        return await prisma.session.delete({ where: { sessionToken } });
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2025"
        )
          return null;
        throw error;
      }
    },
    async createVerificationToken(input) {
      await prisma.verificationToken.create({
        data: { ...input, identifier: verificationEmailIndex(input.identifier) },
      });
      return input;
    },
    async useVerificationToken(input) {
      // Legacy plaintext tokens remain usable during the additive upgrade window.
      const identifiers = [
        verificationEmailIndex(input.identifier),
        input.identifier.toLowerCase(),
      ];
      for (const identifier of identifiers) {
        try {
          const token = await prisma.verificationToken.delete({
            where: { identifier_token: { identifier, token: input.token } },
          });
          return {
            identifier: input.identifier,
            token: token.token,
            expires: token.expires,
          };
        } catch (error) {
          if (
            typeof error !== "object" ||
            error === null ||
            !("code" in error) ||
            error.code !== "P2025"
          )
            throw error;
        }
      }
      return null;
    },
  };
}
