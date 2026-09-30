/**
 * Application error taxonomy.
 *
 * Every error carries a stable machine readable `code` so that server actions,
 * route handlers, logs and the UI agree on the same vocabulary. Messages are
 * safe to show to the signed in user and must never contain raw personal data,
 * secrets or database internals.
 */

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "CONSENT_REQUIRED"
  | "CONSENT_INVALID"
  | "BROKER_NOT_SENDABLE"
  | "LEGAL_RULE_UNAVAILABLE"
  | "MANUAL_REVIEW_REQUIRED"
  | "INVALID_STATE_TRANSITION"
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  | "EXTERNAL_SENDING_DISABLED"
  | "TEMPLATE_RENDER_FAILED"
  | "UNSAFE_INPUT"
  | "STORAGE_FAILED"
  | "EMAIL_FAILED"
  | "INTERNAL_ERROR";

export interface AppErrorOptions {
  code: AppErrorCode;
  message: string;
  /** HTTP status used when the error surfaces through a route handler. */
  status?: number;
  /** Structured, non-sensitive context for logs and the UI. */
  details?: Record<string, unknown>;
  cause?: unknown;
}

const DEFAULT_STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  CONSENT_REQUIRED: 403,
  CONSENT_INVALID: 403,
  BROKER_NOT_SENDABLE: 409,
  LEGAL_RULE_UNAVAILABLE: 409,
  MANUAL_REVIEW_REQUIRED: 409,
  INVALID_STATE_TRANSITION: 409,
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 429,
  EXTERNAL_SENDING_DISABLED: 409,
  TEMPLATE_RENDER_FAILED: 422,
  UNSAFE_INPUT: 400,
  STORAGE_FAILED: 500,
  EMAIL_FAILED: 502,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(options: AppErrorOptions) {
    super(
      options.message,
      options.cause === undefined ? undefined : { cause: options.cause }
    );
    this.name = "AppError";
    this.code = options.code;
    this.status = options.status ?? DEFAULT_STATUS[options.code];
    this.details = options.details ?? {};
  }

  toJSON(): { code: AppErrorCode; message: string; details: Record<string, unknown> } {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "You need to sign in to continue.") {
    super({ code: "UNAUTHENTICATED", message });
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = "You do not have access to this resource.",
    details?: Record<string, unknown>
  ) {
    super({ code: "FORBIDDEN", message, ...(details ? { details } : {}) });
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested item does not exist.") {
    super({ code: "NOT_FOUND", message });
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({ code: "VALIDATION_FAILED", message, ...(details ? { details } : {}) });
    this.name = "ValidationError";
  }
}

export class ConsentError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({ code: "CONSENT_REQUIRED", message, ...(details ? { details } : {}) });
    this.name = "ConsentError";
  }
}

export class RateLimitError extends AppError {
  constructor(message: string, retryAfterSeconds: number) {
    super({ code: "RATE_LIMITED", message, details: { retryAfterSeconds } });
    this.name = "RateLimitError";
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(from: string, to: string, reason?: string) {
    super({
      code: "INVALID_STATE_TRANSITION",
      message: `A request cannot move from ${from} to ${to}.`,
      details: reason ? { from, to, reason } : { from, to },
    });
    this.name = "InvalidStateTransitionError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Converts any thrown value into a safe, serialisable shape for the client.
 * Unknown errors never leak their message.
 */
export function toClientError(error: unknown): {
  code: AppErrorCode;
  message: string;
  details: Record<string, unknown>;
} {
  if (isAppError(error)) {
    return error.toJSON();
  }

  return {
    code: "INTERNAL_ERROR",
    message: "Something went wrong. The incident was logged.",
    details: {},
  };
}
