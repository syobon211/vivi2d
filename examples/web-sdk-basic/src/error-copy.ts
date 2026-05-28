import { isViviWebError, type ViviWebErrorCode } from "@vivi2d/web";

export type DisplayErrorCode = ViviWebErrorCode | "VIVI_WEB_UNKNOWN";

export interface ErrorCopy {
  code: DisplayErrorCode;
  message: string;
  retry: boolean;
}

const VIVI_WEB_ERROR_COPY: Record<ViviWebErrorCode, Omit<ErrorCopy, "code">> = {
  VIVI_WEB_ABORTED: {
    message: "The model load was cancelled before it finished.",
    retry: true,
  },
  VIVI_WEB_DISPOSED: {
    message: "The player was already disposed. Reload the model before using it again.",
    retry: true,
  },
  VIVI_WEB_FETCH_FAILED: {
    message: "The model could not be fetched. Check that the file is served by this app.",
    retry: true,
  },
  VIVI_WEB_INTERNAL: {
    message: "The Web SDK hit an internal error while handling the model.",
    retry: true,
  },
  VIVI_WEB_INVALID_INPUT: {
    message: "One of the values passed to the player was outside the supported range.",
    retry: false,
  },
  VIVI_WEB_INVALID_SOURCE: {
    message: "The model source was not a supported .vivi source.",
    retry: true,
  },
  VIVI_WEB_LIMIT_EXCEEDED: {
    message: "The model or generated output exceeded the Web SDK safety limits.",
    retry: false,
  },
  VIVI_WEB_PARSE_FAILED: {
    message: "The file could not be parsed as a public Vivi2D model.",
    retry: true,
  },
  VIVI_WEB_RENDERER_UNAVAILABLE: {
    message: "The browser could not create the renderer needed for this sample.",
    retry: false,
  },
  VIVI_WEB_TEXTURE_FAILED: {
    message: "The model texture data could not be prepared by the renderer.",
    retry: true,
  },
  VIVI_WEB_UNKNOWN_INPUT: {
    message: "Strict input mode rejected an input ID that is not in this model.",
    retry: false,
  },
  VIVI_WEB_VALIDATION_FAILED: {
    message: "The file is not a valid public-profile Vivi2D model.",
    retry: true,
  },
};

export function formatViviWebError(error: unknown): ErrorCopy {
  if (isViviWebError(error) && isKnownViviWebErrorCode(error.code)) {
    return {
      code: error.code,
      ...copyForKnownCode(error.code),
    };
  }
  return {
    code: "VIVI_WEB_UNKNOWN",
    message: "Something went wrong while using the Vivi2D Web SDK.",
    retry: true,
  };
}

export function copyForKnownCode(code: ViviWebErrorCode): Omit<ErrorCopy, "code"> {
  switch (code) {
    case "VIVI_WEB_ABORTED":
    case "VIVI_WEB_DISPOSED":
    case "VIVI_WEB_FETCH_FAILED":
    case "VIVI_WEB_INTERNAL":
    case "VIVI_WEB_INVALID_INPUT":
    case "VIVI_WEB_INVALID_SOURCE":
    case "VIVI_WEB_LIMIT_EXCEEDED":
    case "VIVI_WEB_PARSE_FAILED":
    case "VIVI_WEB_RENDERER_UNAVAILABLE":
    case "VIVI_WEB_TEXTURE_FAILED":
    case "VIVI_WEB_UNKNOWN_INPUT":
    case "VIVI_WEB_VALIDATION_FAILED":
      return VIVI_WEB_ERROR_COPY[code];
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

function isKnownViviWebErrorCode(value: unknown): value is ViviWebErrorCode {
  return typeof value === "string" && value in VIVI_WEB_ERROR_COPY;
}
