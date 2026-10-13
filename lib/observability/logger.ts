/**
 * Structured logging.
 *
 * Rules enforced here:
 *  - No raw personal data. Known sensitive keys are redacted automatically and
 *    `safeMeta()` drops anything that is not explicitly allow listed.
 *  - Every log line carries a component and, where available, a request id.
 *  - Tests run at level "silent" so that assertions stay readable.
 */
import pino, { type Logger, type LoggerOptions } from "pino";

import { env, type AppEnv } from "@/lib/config/env";

const REDACTED = "[redacted]";

/**
 * Keys that must never appear in logs, regardless of nesting depth.
 * pino applies these paths before serialisation.
 */
const REDACT_PATHS = [
  "*.email",
  "*.emailAddress",
  "*.password",
  "*.token",
  "*.tokenHash",
  "*.secret",
  "*.apiKey",
  "*.authorization",
  "*.cookie",
  "*.name",
  "*.fullName",
  "*.legalName",
  "*.phone",
  "*.address",
  "*.postalAddress",
  "*.valueEnc",
  "*.value",
  "*.body",
  "*.subject",
  "*.identifiers",
  "email",
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "req.headers.authorization",
  "req.headers.cookie",
];

export function shouldUsePrettyTransport(config: {
  APP_ENV: AppEnv["APP_ENV"];
  NODE_ENV: AppEnv["NODE_ENV"];
}): boolean {
  // pino-pretty is a local-dev convenience and a devDependency. Docker compose
  // and CI e2e run NODE_ENV=production with APP_ENV=development; pretty
  // transport would crash those processes if the package is omitted.
  return config.APP_ENV === "development" && config.NODE_ENV === "development";
}

function buildOptions(diagnostic = false): LoggerOptions {
  const base: LoggerOptions = {
    level: diagnostic ? "info" : env.LOG_LEVEL,
    redact: { paths: REDACT_PATHS, censor: REDACTED },
    base: { app: "brokermogger", appEnv: diagnostic ? "unvalidated" : env.APP_ENV },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: { err: safeError, error: safeError },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  };

  if (!diagnostic && shouldUsePrettyTransport(env)) {
    return {
      ...base,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname,app",
        },
      },
    };
  }

  return base;
}

/** Error messages/stacks can contain SQL parameters, tokens or provider bodies. */
export function safeError(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") return { type: "Error" };
  const name =
    "name" in error &&
    typeof error.name === "string" &&
    /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(error.name)
      ? error.name
      : "Error";
  const code =
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]{1,80}$/.test(error.code)
      ? error.code
      : undefined;
  return { type: name, ...(code ? { code } : {}) };
}

let rootLogger: Logger | undefined;

function getRootLogger(): Logger {
  rootLogger ??= pino(buildOptions());
  return rootLogger;
}

export function createLogger(
  component: string,
  bindings: Record<string, unknown> = {},
  options: {
    /** One-off CLI startup only: creates a separate logger per call; never use in request or worker loops. */
    diagnostic?: boolean;
  } = {}
): Logger {
  // CLI startup diagnostics must work before full environment validation. Keep
  // the same redaction/error serializers, without reconfiguring runtime logging.
  if (options.diagnostic)
    return pino(buildOptions(true)).child({ component, ...bindings });
  return getRootLogger().child({ component, ...bindings });
}

export const logger: Logger = new Proxy({} as Logger, {
  get(_target, property: string | symbol) {
    const value = getRootLogger()[property as keyof Logger];
    return typeof value === "function" ? value.bind(getRootLogger()) : value;
  },
});

/**
 * Allow list based metadata builder. Only primitive values survive and strings
 * are truncated, so an accidental identifier never ends up in the log stream.
 */
export function safeMeta(
  input: Record<string, unknown>,
  allowedKeys: readonly string[]
): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const key of allowedKeys) {
    const value = input[key];
    if (value === undefined || value === null) continue;

    if (typeof value === "string") {
      output[key] = value.length > 200 ? `${value.slice(0, 200)}...` : value;
    } else if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value instanceof Date
    ) {
      output[key] = value;
    } else if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      output[key] = value.slice(0, 20);
    }
  }

  return output;
}
