import type { ViviViewerApiErrorPayload } from "./protocol.js";

export type ViviViewerApiClientErrorCode =
  | "invalid_endpoint"
  | "non_loopback_endpoint"
  | "transport_unavailable"
  | "transport_timeout"
  | "frame_too_large"
  | "invalid_message"
  | "protocol_mismatch"
  | "host_capability_unavailable"
  | "scope_denied"
  | "pairing_required"
  | "pairing_closed"
  | "pairing_code_mismatch"
  | "authentication_failed"
  | "unauthenticated"
  | "grant_revoked"
  | "rate_limited"
  | "payload_too_large"
  | "origin_mismatch"
  | "unsupported"
  | "disconnected"
  | "aborted"
  | "internal_error"
  | string;

export interface ViviViewerApiClientErrorOptions {
  code: ViviViewerApiClientErrorCode;
  message?: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
  cause?: unknown;
}

export class ViviViewerApiClientError extends Error {
  readonly code: ViviViewerApiClientErrorCode;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;

  constructor(options: ViviViewerApiClientErrorOptions) {
    super(options.message ?? options.code, { cause: options.cause });
    this.name = "ViviViewerApiClientError";
    this.code = options.code;
    this.details = options.details;
    this.retryable = options.retryable ?? isRetryableClientCode(options.code);
  }

  static fromProtocol(error: ViviViewerApiErrorPayload | undefined, fallback: string) {
    if (!error) {
      return new ViviViewerApiClientError({
        code: "internal_error",
        message: fallback,
      });
    }
    return new ViviViewerApiClientError({
      code: error.code || "internal_error",
      message: error.message || fallback,
      details: error.details,
      retryable: error.retryable,
    });
  }
}

export function isViviViewerApiClientError(
  value: unknown,
): value is ViviViewerApiClientError {
  return value instanceof ViviViewerApiClientError;
}

function isRetryableClientCode(code: string) {
  return (
    code === "transport_timeout" ||
    code === "transport_unavailable" ||
    code === "disconnected" ||
    code === "pairing_required" ||
    code === "pairing_closed" ||
    code === "rate_limited"
  );
}
