import { blindIndex, decryptField, encryptField } from "./crypto";
import { assertValidEmailAddress } from "./sanitize";

export function encryptedAccountEmail(id: string, value: string) {
  const email = assertValidEmailAddress(value, "email");
  return {
    email: `account-${id}@account.invalid`,
    emailEnc: encryptField(email, { table: "User", column: "emailEnc", recordId: id }),
    emailBi: accountEmailIndex(email),
  };
}

export function accountEmailIndex(email: string): string {
  return blindIndex(email, "user:email", "email");
}

export function readAccountEmail<
  T extends { id: string; email: string; emailEnc: string | null },
>(user: T): T {
  return {
    ...user,
    email: user.emailEnc
      ? decryptField(user.emailEnc, {
          table: "User",
          column: "emailEnc",
          recordId: user.id,
        })
      : user.email,
  };
}

export function verificationEmailIndex(email: string): string {
  return blindIndex(email, "auth:verification", "email");
}
