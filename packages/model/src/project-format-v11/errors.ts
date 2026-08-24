export type ProjectFormatV11ValidationStage = "semantic";

export type ProjectFormatV11SemanticErrorCode =
  | "unknownPublicField"
  | "forbiddenPublicFeature"
  | "invalidSemanticValue"
  | "VIVI_FMT_DUPLICATE_MAP_KEY"
  | "VIVI_FMT_EXTENSION_CANONICAL_SIZE_EXCEEDED"
  | "VIVI_FMT_EXTENSION_WITHOUT_CAPABILITY"
  | "VIVI_FMT_UNREGISTERED_EXTENSION"
  | "VIVI_FMT_REQUIRES_MISMATCH"
  | "VIVI_FMT_DANGLING_BLOB_REF"
  | "VIVI_FMT_ORPHAN_EMBEDDED_ASSET"
  | "VIVI_FMT_MIXED_ASSET_MODE"
  | "VIVI_FMT_ASSET_HASH_MISMATCH"
  | "VIVI_ASSET_TOO_LARGE_FOR_EMBED"
  | "VIVI_FMT_ATLAS_ID_INVALID"
  | "VIVI_FMT_DUPLICATE_ATLAS_ID"
  | "VIVI_FMT_DUPLICATE_REQUIRES_ID"
  | "VIVI_FMT_ASSET_REF_INVALID";

export class ProjectFormatV11SemanticError extends Error {
  readonly stage: ProjectFormatV11ValidationStage = "semantic";
  readonly code: ProjectFormatV11SemanticErrorCode;
  readonly path: string;

  constructor(code: ProjectFormatV11SemanticErrorCode, path: string, message: string) {
    super(`${message} (${path})`);
    this.name = "ProjectFormatV11SemanticError";
    this.code = code;
    this.path = path;
  }
}

export function semanticError(
  code: ProjectFormatV11SemanticErrorCode,
  path: string,
  message: string,
): never {
  throw new ProjectFormatV11SemanticError(code, path, message);
}
