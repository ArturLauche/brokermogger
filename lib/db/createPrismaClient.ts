/**
 * Prisma 7 client factory.
 *
 * Prisma 7 no longer reads `DATABASE_URL` from the schema and requires an
 * explicit driver adapter. It also dropped the implicit translation of the
 * `?schema=`, `connection_limit`, `connect_timeout` and `pool_timeout`
 * connection-string parameters that Prisma 6 applied. This module preserves
 * those semantics in one place so the app, worker, seeds, tests and browser
 * fixtures all connect the same way.
 *
 * Everything here is pure URL parsing plus adapter construction; it takes an
 * explicit connection string so it can be unit tested and reused anywhere.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";

import { ConfigurationError } from "@/lib/core/errors";

/** Prisma 6 defaults preserved deliberately: finite acquisition, bounded pool. */
const DEFAULT_POOL_MAX = 10;
const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const MAX_POOL_MAX = 1_000;
const MAX_TIMEOUT_MS = 10 * 60 * 1_000;

/**
 * Unquoted PostgreSQL identifiers only. Quoted identifiers such as `tenant-one`
 * cannot be represented safely in the pg `options`/search_path hand-off, so
 * they are rejected at startup instead of silently falling back to the schema
 * on the connection's default search_path.
 */
const PLAIN_SCHEMA_IDENTIFIER = /^[a-z_][a-z0-9_$]*$/;
const MAX_IDENTIFIER_BYTES = 63;

export interface DatabaseConnectionSettings {
  /** Schema from `?schema=`, when present and representable. */
  schema?: string;
  /** Pool size from `?connection_limit=` (Prisma 6 default: 10). */
  poolMax: number;
  /**
   * Bounded wait for a pooled connection from `?pool_timeout=`, falling back to
   * `?connect_timeout=`, then to Prisma 6's 5 second connection timeout.
   */
  connectionTimeoutMillis: number;
}

function positiveInteger(
  parameters: URLSearchParams,
  name: string,
  maximum: number
): number | undefined {
  if (!parameters.has(name)) return undefined;
  const raw = parameters.get(name) ?? "";
  if (!/^\d+$/.test(raw))
    throw new ConfigurationError(
      `DATABASE_URL ${name} must be a positive integer count, not "${raw.slice(0, 20)}".`
    );
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new ConfigurationError(
      `DATABASE_URL ${name} must be between 1 and ${maximum}.`
    );
  return value;
}

/**
 * Parses the Prisma 6 connection-string settings that the pg adapter no longer
 * understands. Throws `ConfigurationError` for values that cannot be applied
 * exactly; it never includes the connection string (and therefore a password)
 * in the error.
 */
export function parseDatabaseConnectionSettings(
  connectionString: string
): DatabaseConnectionSettings {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new ConfigurationError(
      "DATABASE_URL is not a valid URL. Expected a postgresql:// connection string."
    );
  }
  if (!/^postgres(ql)?:$/.test(url.protocol))
    throw new ConfigurationError("DATABASE_URL must use the postgresql:// scheme.");

  const rawSchema = url.searchParams.get("schema");
  let schema: string | undefined;
  if (rawSchema !== null && rawSchema !== "") {
    if (
      !PLAIN_SCHEMA_IDENTIFIER.test(rawSchema) ||
      Buffer.byteLength(rawSchema, "utf8") > MAX_IDENTIFIER_BYTES
    )
      throw new ConfigurationError(
        "DATABASE_URL schema must be a plain lowercase PostgreSQL identifier (letters, digits, _ or $; at most 63 bytes). " +
          "Quoted or mixed-case schema names are rejected rather than silently ignored."
      );
    schema = rawSchema;
  }

  const connectionLimit = positiveInteger(
    url.searchParams,
    "connection_limit",
    MAX_POOL_MAX
  );
  const connectTimeout = positiveInteger(
    url.searchParams,
    "connect_timeout",
    MAX_TIMEOUT_MS / 1_000
  );
  const poolTimeout = positiveInteger(
    url.searchParams,
    "pool_timeout",
    MAX_TIMEOUT_MS / 1_000
  );
  const timeoutSeconds = poolTimeout ?? connectTimeout;

  return {
    ...(schema ? { schema } : {}),
    poolMax: connectionLimit ?? DEFAULT_POOL_MAX,
    connectionTimeoutMillis:
      timeoutSeconds === undefined ? DEFAULT_CONNECT_TIMEOUT_MS : timeoutSeconds * 1_000,
  };
}

/**
 * Prisma 7's pg adapter needs the schema twice: as the adapter option (so the
 * query compiler qualifies generated SQL) and on the connection `search_path`
 * (so `$queryRaw` sees the same schema). Both values come from the validated
 * plain identifier above.
 */
export function createPrismaPgAdapter(connectionString: string): PrismaPg {
  const settings = parseDatabaseConnectionSettings(connectionString);
  return new PrismaPg(
    {
      connectionString,
      max: settings.poolMax,
      connectionTimeoutMillis: settings.connectionTimeoutMillis,
      ...(settings.schema ? { options: `-c search_path="${settings.schema}"` } : {}),
    },
    settings.schema ? { schema: settings.schema } : undefined
  );
}

export function createPrismaClientOptions(connectionString: string): {
  adapter: PrismaPg;
  log: Prisma.LogLevel[] | Prisma.LogDefinition[];
} {
  return { adapter: createPrismaPgAdapter(connectionString), log: [] };
}

export function createPrismaClient<
  const TLog extends Prisma.LogLevel[] | Prisma.LogDefinition[] = [],
>(options: { connectionString: string; log?: TLog }): PrismaClient<{ log: TLog }> {
  return new PrismaClient({
    adapter: createPrismaPgAdapter(options.connectionString),
    log: options.log ?? [],
  }) as PrismaClient<{ log: TLog }>;
}
