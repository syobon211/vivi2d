export const VIVI_RUNTIME_SPEC_V1_VERSION = Object.freeze({
  major: 1,
  minor: 0,
  patch: 0,
});

export const VIVI_RUNTIME_SPEC_VERSION = Object.freeze({
  major: 1,
  minor: 0,
  patch: 0,
});

export const VIVI_RUNTIME_ABI_VERSION = (0 << 16) | 1;

export const VIVI_RUNTIME_PROJECT_FILE_VERSION = 10;

export const VIVI_RUNTIME_LIMITS = Object.freeze({
  maxPayloadBytes: 64 * 1024 * 1024,
  maxTextureBytes: 256 * 1024 * 1024,
  maxTextures: 32,
  maxLayers: 4096,
  maxMeshes: 1024,
  maxVerticesPerMesh: 65536,
  maxIndicesPerMesh: 196608,
  maxBones: 1024,
  maxIkControllers: 256,
  maxPhysicsGroups: 256,
  maxPendulumsPerPhysicsGroup: 64,
  maxParameters: 2048,
  maxBindingPoints: 8192,
  maxColliders: 1024,
  maxAnimationClips: 512,
  maxStateMachines: 128,
  maxStatesPerStateMachine: 256,
  maxTransitionsPerStateMachine: 512,
});

export const VIVI_RUNTIME_TIMING = Object.freeze({
  maxDeltaSeconds: 0.25,
  physicsTimestepSeconds: 1 / 120,
  maxPhysicsSubsteps: 4,
});

export const VIVI_RUNTIME_TOLERANCES = Object.freeze({
  vertexPosition: 1e-4,
  boneAngle: 1e-5,
  physicsState: 1e-5,
  opacityOrColorChannel: 1e-5,
});

export const VIVI_BLEND_MODE = Object.freeze({
  normal: 0,
  multiply: 1,
  screen: 2,
  add: 3,
});

export type ViviRuntimeBlendMode = (typeof VIVI_BLEND_MODE)[keyof typeof VIVI_BLEND_MODE];

export type ViviRuntimeErrorCode =
  | "VIVI_ERR_INVALID_ARGUMENT"
  | "VIVI_ERR_UNSUPPORTED_OPERATION"
  | "VIVI_ERR_PARSE"
  | "VIVI_ERR_UNSUPPORTED_SPEC_VERSION"
  | "VIVI_ERR_PRIVATE_PROFILE"
  | "VIVI_ERR_LIMIT_EXCEEDED"
  | "VIVI_ERR_VALIDATION"
  | "VIVI_ERR_TEXTURE"
  | "VIVI_ERR_EVALUATION"
  | "VIVI_ERR_INTERNAL";

export const VIVI_RUNTIME_ERROR_CODES = Object.freeze({
  ok: "VIVI_OK",
  invalidArgument: "VIVI_ERR_INVALID_ARGUMENT",
  unsupportedOperation: "VIVI_ERR_UNSUPPORTED_OPERATION",
  parse: "VIVI_ERR_PARSE",
  unsupportedSpecVersion: "VIVI_ERR_UNSUPPORTED_SPEC_VERSION",
  privateProfile: "VIVI_ERR_PRIVATE_PROFILE",
  limitExceeded: "VIVI_ERR_LIMIT_EXCEEDED",
  validation: "VIVI_ERR_VALIDATION",
  texture: "VIVI_ERR_TEXTURE",
  evaluation: "VIVI_ERR_EVALUATION",
  internal: "VIVI_ERR_INTERNAL",
} as const);

export const VIVI_RUNTIME_IGNORED_METADATA_KEYS = Object.freeze([
  "managedTag",
  "managedSignature",
  "managedSourceFingerprint",
]);

const runtimeForbiddenMarker = (...parts: string[]) => parts.join("");

export const VIVI_RUNTIME_FORBIDDEN_RAW_KEYS = Object.freeze([
  "blendShapes",
  "correctiveDeformations",
  "meshLinks",
  "blendShapeWeights",
  "blendShapeTracks",
  "meshPoseTracks",
  "targetBlendShapeId",
  "solver",
  runtimeForbiddenMarker("Local", "Motion", "Draft"),
  runtimeForbiddenMarker("local", "Motion", "Draft"),
  runtimeForbiddenMarker("motion", "Handle", "Draft"),
  runtimeForbiddenMarker("Local", "Preview", "Solver"),
  runtimeForbiddenMarker("local", "Preview", "Solver"),
  runtimeForbiddenMarker("preview", "Solver"),
  runtimeForbiddenMarker("preview", "Only"),
  runtimeForbiddenMarker("Local", "Motion", "Region"),
  runtimeForbiddenMarker("Local", "Motion", "Handle"),
  runtimeForbiddenMarker("Local", "Motion", "Apply", "Plan"),
  runtimeForbiddenMarker("Local", "Preview", "Frame"),
  runtimeForbiddenMarker("Branded", "Local", "Preview", "Frame"),
  runtimeForbiddenMarker("Editor", "Only", "Preview"),
  runtimeForbiddenMarker("editor", "Preview", "Frame"),
  runtimeForbiddenMarker("local", "Bone"),
  runtimeForbiddenMarker("local", "Motion", "Constraint"),
  runtimeForbiddenMarker("motion", "Region", "Weights"),
  runtimeForbiddenMarker("affine", "Region", "Fit"),
  runtimeForbiddenMarker("preview", "Deformed", "Vertices"),
  runtimeForbiddenMarker("deformed", "Vertices"),
  runtimeForbiddenMarker("guided", "Preview", "Fit"),
  runtimeForbiddenMarker("motion", "Stress", "Preview"),
  runtimeForbiddenMarker("moving", "Least", "Squares"),
  runtimeForbiddenMarker("as", "Rigid", "As", "Possible"),
  runtimeForbiddenMarker("b", "b", "w"),
]);

export const VIVI_RUNTIME_FORBIDDEN_KIND_OR_TYPE = Object.freeze([
  "blendShape",
  "latticeDeformer",
  "morphTarget",
  "correctiveDeformation",
  "meshPose",
  "meshLink",
  runtimeForbiddenMarker("Local", "Motion", "Draft"),
  runtimeForbiddenMarker("Local", "Preview", "Solver"),
  runtimeForbiddenMarker("Local", "Motion", "Region"),
  runtimeForbiddenMarker("Local", "Motion", "Handle"),
  runtimeForbiddenMarker("Local", "Motion", "Apply", "Plan"),
  runtimeForbiddenMarker("Local", "Preview", "Frame"),
  runtimeForbiddenMarker("editor", "Preview", "Frame"),
  runtimeForbiddenMarker("constrained", "Affine"),
  runtimeForbiddenMarker("m", "l", "s"),
  runtimeForbiddenMarker("m", "l", "s", "Rigid"),
  runtimeForbiddenMarker("m", "l", "s", "Similarity"),
  runtimeForbiddenMarker("a", "r", "a", "p"),
  runtimeForbiddenMarker("a", "r", "a", "p", "Local"),
  runtimeForbiddenMarker("guided", "Preview", "Fit"),
  runtimeForbiddenMarker("motion", "Stress", "Preview"),
  runtimeForbiddenMarker("moving", "Least", "Squares"),
  runtimeForbiddenMarker("as", "Rigid", "As", "Possible"),
  runtimeForbiddenMarker("b", "b", "w"),
]);

export const VIVI_RUNTIME_ALLOWED_BINDING_TARGET_TYPES = Object.freeze([
  "bone",
  "ikController",
]);

export const VIVI_RUNTIME_ALLOWED_EXPRESSION_PRESET_KEYS = Object.freeze([
  "id",
  "name",
  "values",
  "color",
  "hotkey",
]);

export class ViviRuntimeError extends Error {
  readonly code: ViviRuntimeErrorCode;

  constructor(code: ViviRuntimeErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "ViviRuntimeError";
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}
