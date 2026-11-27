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
import { availableParallelism } from "node:os";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";

import { ConfigurationError } from "@/lib/core/errors";

/**
 * Prisma 6 defaults preserved deliberately:
 *   - connection_limit: physical CPUs * 2 + 1 (approximated by available
 *     parallelism, which is what Node can observe portably);
 *   - pool_timeout: 10 seconds.
 * pg exposes one acquisition timeout, so `pool_timeout` takes precedence over
 * `connect_timeout`; both also bound TCP connection establishment.
 */
const DEFAULT_POOL_MAX = Math.max(1, availableParallelism() * 2 + 1);
const DEFAULT_POOL_TIMEOUT_MS = 10_000;
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
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function hostnameOf(url: URL): string {
  return url.hostname.replace(/^\[(.+)\]$/, "$1").toLowerCase();
}

export interface DatabaseConnectionSettings {
  /** Effective schema. Always set: Prisma 6 defaulted to `public`. */
  schema: string;
  /** Pool size from `?connection_limit=` (Prisma 6 default: CPU-derived). */
  poolMax: number;
  /**
   * Bounded wait for a pooled connection. `?pool_timeout=` takes precedence,
   * then `?connect_timeout=`, then Prisma 6's 10 second pool timeout.
   */
  connectionTimeoutMillis: number;
  /**
   * Authoritative libpq options for the connection. Starts with any benign
   * `?options=` value and always ends with the search path, so the selected
   * schema wins even if the URL also configures other server settings.
   */
  options: string;
  /**
   * Connection string with `schema` and `options` removed. pg-connection-string
   * copies query parameters over the supplied config, so passing the original
   * URL would let `?options=` override our search_path.
   */
  connectionString: string;
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
      `DATABASE_URL ${name} must be a positive integer. The value is not echoed because connection strings may contain secrets.`
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
  connectionString: string,
  options: { requireExplicitSsl?: boolean | undefined } = {}
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

  const schemaValues = url.searchParams.getAll("schema");
  if (schemaValues.length > 1)
    throw new ConfigurationError(
      "DATABASE_URL contains more than one schema parameter. Keep exactly one explicit schema."
    );
  const rawSchema = schemaValues[0];
  if (rawSchema === "")
    throw new ConfigurationError(
      "DATABASE_URL schema is empty. Omit schema to use public, or name a plain lowercase PostgreSQL identifier."
    );
  if (
    rawSchema !== undefined &&
    (!PLAIN_SCHEMA_IDENTIFIER.test(rawSchema) ||
      Buffer.byteLength(rawSchema, "utf8") > MAX_IDENTIFIER_BYTES)
  )
    throw new ConfigurationError(
      "DATABASE_URL schema must be a plain lowercase PostgreSQL identifier (letters, digits, _ or $; at most 63 bytes). " +
        "Quoted or mixed-case schema names are rejected rather than silently ignored."
    );
  // Prisma 6's effective default was public. Applying it explicitly also stops
  // raw SQL from following a role/database default search_path elsewhere.
  const schema = rawSchema ?? "public";

  const optionValues = url.searchParams.getAll("options");
  if (optionValues.length > 1)
    throw new ConfigurationError(
      "DATABASE_URL contains more than one options parameter. Combine server settings into one options value."
    );
  const urlOptions = optionValues[0];
  if (urlOptions !== undefined && /search_path/i.test(urlOptions))
    throw new ConfigurationError(
      "DATABASE_URL options must not set search_path. Schema selection is controlled by the schema parameter so generated SQL and raw SQL cannot diverge."
    );

  if (options.requireExplicitSsl) {
    const sslmode = url.searchParams.get("sslmode");
    const isLoopback = LOOPBACK_HOSTS.has(hostnameOf(url));
    const isSocket = url.hostname === "" && url.searchParams.has("host");
    if (!isLoopback && !isSocket && !sslmode)
      throw new ConfigurationError(
        "DATABASE_URL must set an explicit sslmode for a non-loopback host in production. " +
          "Use sslmode=verify-full with sslrootcert where possible, or sslmode=disable only for a trusted private network such as Docker Compose."
      );
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

  // Remove the parameters that pg-connection-string would otherwise copy over
  // our explicit configuration. The effective schema is applied below.
  url.searchParams.delete("schema");
  url.searchParams.delete("options");
  const searchPathOption = `-c search_path="${schema}"`;

  return {
    schema,
    poolMax: connectionLimit ?? DEFAULT_POOL_MAX,
    connectionTimeoutMillis:
      timeoutSeconds === undefined ? DEFAULT_POOL_TIMEOUT_MS : timeoutSeconds * 1_000,
    options: urlOptions ? `${urlOptions} ${searchPathOption}` : searchPathOption,
    connectionString: url.toString(),
  };
}

/**
 * Prisma 7's pg adapter needs the schema twice: as the adapter option (so the
 * query compiler qualifies generated SQL) and on the connection `search_path`
 * (so `$queryRaw` sees the same schema). Both values come from the validated
 * plain identifier above.
 */
export function createPrismaPgAdapter(
  connectionString: string,
  options: { requireExplicitSsl?: boolean | undefined } = {}
): PrismaPg {
  const settings = parseDatabaseConnectionSettings(connectionString, options);
  return new PrismaPg(
    {
      connectionString: settings.connectionString,
      max: settings.poolMax,
      connectionTimeoutMillis: settings.connectionTimeoutMillis,
      options: settings.options,
    },
    { schema: settings.schema }
  );
}

export function createPrismaClientOptions(
  connectionString: string,
  options: { requireExplicitSsl?: boolean | undefined } = {}
): {
  adapter: PrismaPg;
  log: Prisma.LogLevel[] | Prisma.LogDefinition[];
} {
  return { adapter: createPrismaPgAdapter(connectionString, options), log: [] };
}

export function createPrismaClient<
  const TLog extends Prisma.LogLevel[] | Prisma.LogDefinition[] = [],
>(options: {
  connectionString: string;
  log?: TLog;
  requireExplicitSsl?: boolean | undefined;
}): PrismaClient<{ log: TLog }> {
  return new PrismaClient({
    // Prisma's formatted errors include query arguments, which may be personal.
    // Callers log stable error codes through createLogger instead.
    adapter: createPrismaPgAdapter(options.connectionString, {
      requireExplicitSsl: options.requireExplicitSsl,
    }),
    log: options.log ?? [],
  }) as PrismaClient<{ log: TLog }>;
}
