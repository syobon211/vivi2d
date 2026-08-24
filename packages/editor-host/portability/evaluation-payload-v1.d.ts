export interface ViviAssetRefV1 {
  objectAddress: string;
  storageKind: "blob" | "chunk_manifest";
  contentSha256: string;
  mediaType: string;
  sizeBytes: number;
}

export interface ResolvedEvaluationAtlasV1 {
  id: string;
  image: ViviAssetRefV1;
  width: number;
  height: number;
  entries: unknown[];
}

export interface ResolvedAuthoringProjectV1 {
  project: unknown;
  atlases: ResolvedEvaluationAtlasV1[];
  compatibility: "full" | "readOnly";
}

export interface EvaluationPayloadBuildResultV1 {
  payload: unknown;
  texturePlan: unknown;
}

export const VIVI_EVAL_V1_MAX_TOTAL_TEXTURE_BYTES: number;
export const VIVI_EVALUATION_V1_TEXTURE_LIMITS: Readonly<{
  maxWidth: number;
  maxHeight: number;
  maxPngInputBytes: number;
}>;

export function buildEvaluationPayload(
  resolved: ResolvedAuthoringProjectV1,
): EvaluationPayloadBuildResultV1;
