/**
 * Validated environment configuration.
 *
 * This is the only module in the application that is allowed to read
 * `process.env` (enforced by ESLint). Everything else imports `env`.
 *
 * During `next build` inside Docker no real secrets exist. Set
 * `SKIP_ENV_VALIDATION=true` for that case: the module then falls back to inert
 * placeholder values and refuses to hand out anything that could be mistaken
 * for a working configuration at runtime.
 */
import { z } from "zod";

if (typeof window !== "undefined") {
  throw new Error(
    "lib/config/env.ts was imported into client code. Configuration must stay on the server."
  );
}

const booleanFromString = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0", ""])])
  .transform((value) => value === true || value === "true" || value === "1");

const appEnvSchema = z.enum(["development", "staging", "production"]);
const emailProviderSchema = z.enum(["mock", "sandbox", "resend"]);
const storageBackendSchema = z.enum(["local", "s3", "memory"]);

const rawSchema = z.object({
  APP_ENV: appEnvSchema.default("development"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.url().default("http://localhost:3000"),
  LOG_LEVEL: z
    .enum(["silent", "fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TEST_DATABASE_URL: z.string().optional(),

  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  AUTH_URL: z.url().optional(),
  AUTH_TRUST_HOST: booleanFromString.default(false),
  TRUSTED_PROXY_IP_HEADER: z
    .enum(["none", "x-real-ip", "x-forwarded-for"])
    .default("none"),
  ALLOW_SHARED_AUTH_NETWORK_BUCKET: booleanFromString.default(false),
  AUTH_MAGIC_LINK_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  INSTANCE_ADMIN_EMAILS: z.string().default(""),

  ENCRYPTION_KEYS: z.string().min(1, "ENCRYPTION_KEYS is required"),
  ENCRYPTION_ACTIVE_KEY_ID: z.string().min(1),
  BLIND_INDEX_KEY: z.string().min(1),

  EMAIL_PROVIDER: emailProviderSchema.default("mock"),
  EMAIL_FROM: z.string().min(3),
  EMAIL_REPLY_TO: z.email().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  RESEND_RECEIVING_DOMAIN: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/)
    .optional(),
  EMAIL_SANDBOX_REDIRECT_TO: z.email().optional().or(z.literal("")),
  MOCK_EMAIL_DIR: z.string().default(".mail"),
  ALLOW_EXTERNAL_SENDING: booleanFromString.default(false),

  STORAGE_BACKEND: storageBackendSchema.default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: booleanFromString.default(true),

  JOB_POLL_INTERVAL_MS: z.coerce.number().int().min(50).max(600_000).default(2000),
  JOB_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(5),
  JOB_LOCK_SECONDS: z.coerce.number().int().min(10).max(3600).default(300),
  JOB_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  WORKER_HEALTH_FILE: z.string().optional(),
  CRON_SECRET: z.string().optional(),

  METRICS_TOKEN: z.string().optional(),
  RATE_LIMIT_ENABLED: booleanFromString.default(true),
  SECURITY_CONTACT_EMAIL: z.email().default("security@example.invalid"),
});

export type RawEnv = z.infer<typeof rawSchema>;

export interface EncryptionKeyEntry {
  keyId: string;
  key: Buffer;
}

export interface AppEnv extends RawEnv {
  /** Parsed AES-256-GCM keyring, newest key first. */
  encryptionKeyring: EncryptionKeyEntry[];
  encryptionActiveKey: EncryptionKeyEntry;
  blindIndexKey: Buffer;
  instanceAdminEmails: string[];
  isProduction: boolean;
  isStaging: boolean;
  isDevelopment: boolean;
  isTest: boolean;
}

const PLACEHOLDER_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  AUTH_SECRET: "build-time-placeholder-secret-value",
  ENCRYPTION_KEYS: "build:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  ENCRYPTION_ACTIVE_KEY_ID: "build",
  BLIND_INDEX_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  EMAIL_FROM: "Brokermogger <build@example.invalid>",
};

function parseKeyring(raw: string): EncryptionKeyEntry[] {
  const entries: EncryptionKeyEntry[] = [];

  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;

    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex <= 0) {
      throw new Error(
        'ENCRYPTION_KEYS contains a malformed entry. Expected "<keyId>:<base64 key>".'
      );
    }

    const keyId = trimmed.slice(0, separatorIndex);
    if (
      !/^[A-Za-z0-9_-]{1,64}$/.test(keyId) ||
      entries.some((entry) => entry.keyId === keyId)
    ) {
      throw new Error(
        "ENCRYPTION_KEYS must use unique key IDs containing only letters, numbers, underscores or hyphens (up to 64 characters)."
      );
    }
    const material = decodeKey(trimmed.slice(separatorIndex + 1), "ENCRYPTION_KEYS");

    if (material.byteLength !== 32) {
      throw new Error(
        `ENCRYPTION_KEYS entry "${keyId}" must decode to exactly 32 bytes (got ${material.byteLength}).`
      );
    }

    entries.push({ keyId, key: material });
  }

  if (entries.length === 0) {
    throw new Error("ENCRYPTION_KEYS must contain at least one key.");
  }

  return entries;
}

function decodeKey(value: string, field: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || key.toString("base64") !== value) {
    throw new Error(`${field} must contain canonical base64 key material.`);
  }
  return key;
}

function isExampleKey(key: Buffer): boolean {
  return (
    key.every((byte) => byte === key[0]) ||
    /dev-only|test-|do-not-use|placeholder/i.test(key.toString("utf8"))
  );
}

function crossFieldChecks(parsed: RawEnv): string[] {
  const problems: string[] = [];

  if (
    parsed.RESEND_RECEIVING_DOMAIN &&
    (!parsed.RESEND_API_KEY || !parsed.RESEND_WEBHOOK_SECRET)
  ) {
    problems.push(
      "RESEND_RECEIVING_DOMAIN requires RESEND_API_KEY and RESEND_WEBHOOK_SECRET for authenticated content retrieval."
    );
  }

  if (parsed.EMAIL_PROVIDER === "resend") {
    if (!parsed.RESEND_API_KEY) {
      problems.push("EMAIL_PROVIDER=resend requires RESEND_API_KEY.");
    }
    if (parsed.APP_ENV === "development") {
      problems.push(
        "EMAIL_PROVIDER=resend is refused while APP_ENV=development. Use mock locally or set APP_ENV=staging."
      );
    }
  }

  if (parsed.EMAIL_PROVIDER === "sandbox" && !parsed.EMAIL_SANDBOX_REDIRECT_TO) {
    problems.push("EMAIL_PROVIDER=sandbox requires EMAIL_SANDBOX_REDIRECT_TO.");
  }

  if (parsed.ALLOW_EXTERNAL_SENDING && parsed.EMAIL_PROVIDER === "mock") {
    problems.push(
      "ALLOW_EXTERNAL_SENDING=true has no effect with EMAIL_PROVIDER=mock. Fix the configuration explicitly."
    );
  }

  if (parsed.STORAGE_BACKEND === "s3") {
    if (!parsed.S3_BUCKET) problems.push("STORAGE_BACKEND=s3 requires S3_BUCKET.");
    if (!parsed.S3_ACCESS_KEY_ID)
      problems.push("STORAGE_BACKEND=s3 requires S3_ACCESS_KEY_ID.");
    if (!parsed.S3_SECRET_ACCESS_KEY) {
      problems.push("STORAGE_BACKEND=s3 requires S3_SECRET_ACCESS_KEY.");
    }
  }

  if (parsed.APP_ENV === "production") {
    if (!parsed.RATE_LIMIT_ENABLED) {
      problems.push("RATE_LIMIT_ENABLED must be true in production.");
    }
    if (
      parsed.TRUSTED_PROXY_IP_HEADER === "none" &&
      !parsed.ALLOW_SHARED_AUTH_NETWORK_BUCKET
    ) {
      problems.push(
        "Production login requires a verified ingress-overwritten TRUSTED_PROXY_IP_HEADER. For a private single-user instance only, explicitly acknowledge the shared ten-attempts-per-hour allowance with ALLOW_SHARED_AUTH_NETWORK_BUCKET=true; any caller can exhaust it for the entire instance."
      );
    }
    if (!parsed.APP_BASE_URL.startsWith("https://")) {
      problems.push("APP_BASE_URL must use https in production.");
    }
    if (parsed.AUTH_SECRET.length < 32) {
      problems.push("AUTH_SECRET must be at least 32 characters in production.");
    }
    if (
      parsed.AUTH_SECRET.includes("dev-only") ||
      parsed.AUTH_SECRET.includes("replace-me")
    ) {
      problems.push("AUTH_SECRET still contains the example value.");
    }
    if (parsed.ENCRYPTION_KEYS.includes("dev-only")) {
      problems.push("ENCRYPTION_KEYS still contains the example development key.");
    }
    if (parsed.STORAGE_BACKEND === "memory") {
      problems.push("STORAGE_BACKEND=memory is not allowed in production.");
    }
    if (parsed.EMAIL_PROVIDER === "mock") {
      problems.push(
        "EMAIL_PROVIDER=mock is not allowed in production. Configure resend or another adapter."
      );
    }
  }

  return problems;
}

function readEnvFlag(name: string): boolean {
  // Bracket access keeps Next.js from inlining this flag at `next build` time.
  // Docker and CI set SKIP_ENV_VALIDATION only while compiling; runtime must
  // still validate the real environment.
  return process.env[name] === "true";
}

function buildEnv(): AppEnv {
  const skipValidation = readEnvFlag("SKIP_ENV_VALIDATION");
  // Read dynamically so the build phase is not compiled into the runtime bundle.
  const phaseName = "NEXT_PHASE";
  if (skipValidation && process.env[phaseName] !== "phase-production-build") {
    throw new Error(
      "SKIP_ENV_VALIDATION is only permitted while compiling with next build. Remove it from the runtime environment."
    );
  }
  const source: NodeJS.ProcessEnv = skipValidation
    ? { ...PLACEHOLDER_ENV, ...process.env }
    : process.env;

  const parsedResult = rawSchema.safeParse(source);

  if (!parsedResult.success) {
    const details = parsedResult.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const parsed = parsedResult.data;

  if (!skipValidation) {
    const problems = crossFieldChecks(parsed);
    if (problems.length > 0) {
      throw new Error(
        `Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`
      );
    }
  }

  const keyring = parseKeyring(parsed.ENCRYPTION_KEYS);
  const activeKey = keyring.find(
    (entry) => entry.keyId === parsed.ENCRYPTION_ACTIVE_KEY_ID
  );
  if (!activeKey) {
    throw new Error(
      `ENCRYPTION_ACTIVE_KEY_ID "${parsed.ENCRYPTION_ACTIVE_KEY_ID}" is not part of ENCRYPTION_KEYS.`
    );
  }

  const blindIndexKey = decodeKey(parsed.BLIND_INDEX_KEY, "BLIND_INDEX_KEY");
  if (blindIndexKey.byteLength < 32) {
    throw new Error("BLIND_INDEX_KEY must decode to at least 32 bytes.");
  }
  if (!skipValidation && parsed.APP_ENV === "production") {
    if (keyring.some((entry) => isExampleKey(entry.key)) || isExampleKey(blindIndexKey)) {
      throw new Error(
        "Encryption and blind-index keys must not use example, test or build placeholder material in production."
      );
    }
    if (/placeholder|test-|build-time/i.test(parsed.AUTH_SECRET)) {
      throw new Error(
        "AUTH_SECRET must not use a test or build placeholder in production."
      );
    }
  }

  return {
    ...parsed,
    encryptionKeyring: keyring,
    encryptionActiveKey: activeKey,
    blindIndexKey,
    instanceAdminEmails: parsed.INSTANCE_ADMIN_EMAILS.split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
    isProduction: parsed.APP_ENV === "production",
    isStaging: parsed.APP_ENV === "staging",
    isDevelopment: parsed.APP_ENV === "development",
    isTest: parsed.NODE_ENV === "test",
  };
}

let cached: AppEnv | undefined;

export function getEnv(): AppEnv {
  cached ??= buildEnv();
  return cached;
}

/** Test helper. Never call this from application code. */
export function resetEnvCacheForTests(): void {
  cached = undefined;
}

export const env: AppEnv = new Proxy({} as AppEnv, {
  get(_target, property: string | symbol) {
    return getEnv()[property as keyof AppEnv];
  },
  has(_target, property) {
    return property in getEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(getEnv());
  },
  getOwnPropertyDescriptor(_target, property) {
    return Object.getOwnPropertyDescriptor(getEnv(), property);
  },
});
