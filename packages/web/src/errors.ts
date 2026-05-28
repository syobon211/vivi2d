export type ViviWebErrorCode =
  | "VIVI_WEB_INVALID_SOURCE"
  | "VIVI_WEB_FETCH_FAILED"
  | "VIVI_WEB_PARSE_FAILED"
  | "VIVI_WEB_VALIDATION_FAILED"
  | "VIVI_WEB_LIMIT_EXCEEDED"
  | "VIVI_WEB_TEXTURE_FAILED"
  | "VIVI_WEB_RENDERER_UNAVAILABLE"
  | "VIVI_WEB_INVALID_INPUT"
  | "VIVI_WEB_UNKNOWN_INPUT"
  | "VIVI_WEB_DISPOSED"
  | "VIVI_WEB_ABORTED"
  | "VIVI_WEB_INTERNAL";

export type ViviWebErrorDetails = Readonly<Record<string, string | number | boolean>>;

export class ViviWebError extends Error {
  readonly code: ViviWebErrorCode;
  readonly details: ViviWebErrorDetails;

  constructor(
    code: ViviWebErrorCode,
    message: string,
    options: { cause?: unknown; details?: ViviWebErrorDetails } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ViviWebError";
    this.code = code;
    this.details = options.details ?? {};
  }
}

export function isViviWebError(error: unknown): error is ViviWebError {
  return error instanceof ViviWebError;
}

export function toViviWebError(
  error: unknown,
  fallbackCode: ViviWebErrorCode,
  fallbackMessage: string,
): ViviWebError {
  if (isViviWebError(error)) return error;
  if (isAbortError(error)) {
    return new ViviWebError("VIVI_WEB_ABORTED", "Model loading was aborted.", {
      cause: error,
    });
  }
  if (error instanceof Error) {
    if (/too large|size/i.test(error.message)) {
      return new ViviWebError("VIVI_WEB_LIMIT_EXCEEDED", sanitizeMessage(error), {
        cause: error,
      });
    }
    if (
      /public profile|private profile|unknown fields|forbidden|profile/i.test(
        error.message,
      )
    ) {
      return new ViviWebError("VIVI_WEB_VALIDATION_FAILED", sanitizeMessage(error), {
        cause: error,
      });
    }
    if (
      /parse|invalid JSON|schema validation|Invalid \.vivi file version/i.test(
        error.message,
      )
    ) {
      return new ViviWebError("VIVI_WEB_PARSE_FAILED", sanitizeMessage(error), {
        cause: error,
      });
    }
  }
  return new ViviWebError(fallbackCode, fallbackMessage, { cause: error });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function sanitizeMessage(error: Error): string {
  return error.message
    .replace(/[A-Za-z]:\\[^\s)]+/g, "<path>")
    .replace(/\\\\[^\s\\)]+\\[^\s)]+/g, "<path>")
    .replace(/file:\/\/\/[^\s)]+/g, "<path>")
    .replace(/(?:\/Users\/|\/home\/)[^\s/)]+[^\s)]*/g, "<path>")
    .replace(/\/(?:app|opt|var)\/[^\s)]+/g, "<path>")
    .replace(/\/tmp\/[^\s)]+/g, "<path>");
}
