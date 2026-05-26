import { AUTO_MESH } from "@vivi2d/core/constants";
import type {
  BoneBindingPropertyType,
  IKControllerBindingPropertyType,
  MeshData,
  ProjectData,
  SkinWeight,
} from "@vivi2d/core/types";
import {
  AUTO_SETUP_ROLE_DICTIONARY_VERSION,
  type PartCategory,
} from "./auto-setup-role";

export const SAFE_AUTO_SETUP_PLAN_VERSION = 1;
export const SAFE_AUTO_SETUP_PLAN_PROFILE = "safeAutoSetupV1";
export const SAFE_AUTO_SETUP_MANAGED_TAG_PREFIX = "safeAutoSetup:v1";

export type SafeAutoSetupDiagnosticSeverity = "info" | "warning" | "error";

export interface SafeAutoSetupDiagnostic {
  severity: SafeAutoSetupDiagnosticSeverity;
  code:
    | "unsupportedPlanVersion"
    | "invalidPlanShape"
    | "unsupportedOperation"
    | "bbwReviewGatePending"
    | "forbiddenOperationMarker"
    | "forbiddenOperationKeyMarker"
    | "invalidBindingTarget"
    | "invalidOperationShape"
    | "sourceFingerprintMismatch"
    | "userModified";
  message: string;
  path?: string;
  operationKind?: string;
}

export interface SafeAutoSetupParameterSpec {
  id?: string;
  name: string;
  minValue: number;
  maxValue: number;
  defaultValue: number;
  group?: string;
  managedTag?: string;
  managedSignature?: string;
}

export interface SafeAutoSetupPhysicsGroupSpec {
  name: string;
  partCategory: PartCategory;
  layerIds: string[];
  stiffness: number;
  gravity: number;
  damping: number;
  managedTag?: string;
  managedSignature?: string;
}

export type SafeAutoSetupBindingTarget =
  | {
      type: "bone";
      boneId?: string;
      tempBoneId?: string;
      property: BoneBindingPropertyType;
    }
  | {
      type: "ikController";
      controllerId: string;
      property: IKControllerBindingPropertyType;
    };

export type SafeAutoSetupOperation =
  | {
      kind: "addBone";
      tempId: string;
      name: string;
      x: number;
      y: number;
      partCategory?: PartCategory;
      managedTag?: string;
      managedSignature?: string;
    }
  | {
      kind: "parentBone";
      childTempId: string;
      parentTempId: string;
    }
  | {
      kind: "createParameter";
      parameter: SafeAutoSetupParameterSpec;
    }
  | {
      kind: "createPhysicsGroup";
      group: SafeAutoSetupPhysicsGroupSpec;
    }
  | {
      kind: "createMesh";
      layerId: string;
      layerName: string;
      mesh: MeshData;
      algorithm: "alphaBoundary";
      managedTag?: string;
      managedSignature?: string;
    }
  | {
      kind: "createSkin";
      layerId: string;
      weights: SkinWeight[][];
      boneIds: string[];
      solver: "bbw" | "rigidLayer" | "secondaryMotion";
      managedTag?: string;
      managedSignature?: string;
    }
  | {
      kind: "createBinding";
      parameterId: string;
      target: SafeAutoSetupBindingTarget;
      bindingPoints: Array<{ paramValue: number; targetValue: number }>;
      managedTag?: string;
      managedSignature?: string;
    };

export interface SafeAutoSetupPlan {
  planVersion: typeof SAFE_AUTO_SETUP_PLAN_VERSION;
  profile: typeof SAFE_AUTO_SETUP_PLAN_PROFILE;
  sourceFingerprint: string;
  operations: SafeAutoSetupOperation[];
  diagnostics: SafeAutoSetupDiagnostic[];
}

export interface SafeAutoSetupPlanValidationResult {
  ok: boolean;
  diagnostics: SafeAutoSetupDiagnostic[];
}

export interface SafeAutoSetupPlanValidationOptions {
  allowBbwSolver?: boolean;
}

export class SafeAutoSetupPlanError extends Error {
  readonly diagnostics: SafeAutoSetupDiagnostic[];

  constructor(diagnostics: SafeAutoSetupDiagnostic[]) {
    super(
      diagnostics[0]?.message ??
        "Safe Auto Setup plan contains unsupported operations.",
    );
    this.name = "SafeAutoSetupPlanError";
    this.diagnostics = diagnostics;
  }
}

const SUPPORTED_OPERATION_KINDS = new Set<SafeAutoSetupOperation["kind"]>([
  "addBone",
  "parentBone",
  "createParameter",
  "createPhysicsGroup",
  "createMesh",
  "createSkin",
  "createBinding",
]);

const forbiddenMarker = (...parts: string[]) => parts.join("");

const FORBIDDEN_OPERATION_MARKERS = [
  forbiddenMarker("art", "Mesh"),
  forbiddenMarker("key", "form"),
  forbiddenMarker("form", "Animation"),
  forbiddenMarker("form", "Pose"),
  forbiddenMarker("blend", "Shape"),
  forbiddenMarker("morph", "Target"),
  forbiddenMarker("correct", "ive", "Deformation"),
  forbiddenMarker("mesh", "Pose"),
  forbiddenMarker("mesh", "Link"),
  forbiddenMarker("lattice", "Deformer"),
  forbiddenMarker("solver"),
  forbiddenMarker("constrained", "Affine"),
  forbiddenMarker("m", "l", "s"),
  forbiddenMarker("m", "l", "s", "Rigid"),
  forbiddenMarker("m", "l", "s", "Similarity"),
  forbiddenMarker("a", "r", "a", "p"),
  forbiddenMarker("a", "r", "a", "p", "Local"),
  forbiddenMarker("b", "b", "w"),
  forbiddenMarker("local", "Preview", "Solver"),
  forbiddenMarker("preview", "Solver"),
  forbiddenMarker("preview", "Only"),
  forbiddenMarker("local", "Motion", "Draft"),
  forbiddenMarker("Local", "Preview", "Solver"),
  forbiddenMarker("Local", "Motion", "Region"),
  forbiddenMarker("Local", "Motion", "Handle"),
  // Reserved denylist marker. The first public slice returns operations directly
  // instead of creating a serialized apply-plan type with this name.
  forbiddenMarker("Local", "Motion", "Apply", "Plan"),
  forbiddenMarker("Local", "Preview", "Frame"),
  forbiddenMarker("Branded", "Local", "Preview", "Frame"),
  forbiddenMarker("Editor", "Only", "Preview"),
  forbiddenMarker("editor", "Preview", "Frame"),
  forbiddenMarker("local", "Bone"),
  forbiddenMarker("local", "Motion", "Constraint"),
  forbiddenMarker("motion", "Region", "Weights"),
  forbiddenMarker("affine", "Region", "Fit"),
  forbiddenMarker("preview", "Deformed", "Vertices"),
  forbiddenMarker("deformed", "Vertices"),
  forbiddenMarker("guided", "Preview", "Fit"),
  forbiddenMarker("motion", "Stress", "Preview"),
  forbiddenMarker("moving", "Least", "Squares"),
  forbiddenMarker("as", "Rigid", "As", "Possible"),
] as const;

const EXACT_TOKEN_OPERATION_MARKERS = new Set([
  forbiddenMarker("m", "l", "s"),
  forbiddenMarker("a", "r", "a", "p"),
  forbiddenMarker("b", "b", "w"),
]);

const FORBIDDEN_BINDING_TARGET_TYPES = new Set([
  forbiddenMarker("blend", "Shape"),
  forbiddenMarker("lattice", "Deformer"),
  forbiddenMarker("morph", "Target"),
  forbiddenMarker("correct", "ive", "Deformation"),
  forbiddenMarker("mesh", "Pose"),
  forbiddenMarker("mesh", "Link"),
]);

const ALLOWED_BONE_BINDING_PROPERTIES = new Set(["x", "y", "angle", "scaleX", "scaleY"]);
const ALLOWED_IK_BINDING_PROPERTIES = new Set([
  "targetX",
  "targetY",
  "poleTargetX",
  "poleTargetY",
  "influence",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatDiagnosticPathKey(key: string): string {
  return `[${JSON.stringify(key)}]`;
}

function normalizePrivateMarkerText(value: string): string {
  return value.toLowerCase().replace(/[-_.:/\s]+/g, "");
}

function containsSolverToken(value: string): boolean {
  return (value.match(/[A-Za-z]+/g) ?? []).some(
    (token) => token.toLowerCase() === "solver",
  );
}

function containsExactAlphaToken(value: string, marker: string): boolean {
  return (value.match(/[A-Za-z]+/g) ?? []).some(
    (token) => token.toLowerCase() === marker,
  );
}

function isForbiddenMarkerMatch(value: string, marker: string): boolean {
  if (marker === "solver") return containsSolverToken(value);
  if (EXACT_TOKEN_OPERATION_MARKERS.has(marker)) {
    return containsExactAlphaToken(value, marker);
  }
  return normalizePrivateMarkerText(value).includes(
    normalizePrivateMarkerText(marker),
  );
}

function pushInvalidShape(
  diagnostics: SafeAutoSetupDiagnostic[],
  message: string,
  path: string,
): void {
  diagnostics.push({
    severity: "error",
    code: "invalidOperationShape",
    message,
    path,
  });
}

function scanForbiddenMarkers(
  value: unknown,
  path: string,
  diagnostics: SafeAutoSetupDiagnostic[],
): void {
  if (typeof value === "string") {
    for (const marker of FORBIDDEN_OPERATION_MARKERS) {
      if (isForbiddenMarkerMatch(value, marker)) {
        diagnostics.push({
          severity: "error",
          code: "forbiddenOperationMarker",
          message: `Safe Auto Setup plan cannot contain '${marker}'.`,
          path,
        });
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      scanForbiddenMarkers(item, `${path}[${index}]`, diagnostics),
    );
    return;
  }

  if (!isRecord(value)) return;

  for (const [key, nested] of Object.entries(value)) {
    const keyPath = `${path}${formatDiagnosticPathKey(key)}`;
    scanForbiddenKeyMarkers(key, `${keyPath}<key>`, diagnostics);
    scanForbiddenMarkers(nested, keyPath, diagnostics);
  }
}

function scanForbiddenKeyMarkers(
  key: string,
  path: string,
  diagnostics: SafeAutoSetupDiagnostic[],
): void {
  for (const marker of FORBIDDEN_OPERATION_MARKERS) {
    if (isForbiddenMarkerMatch(key, marker)) {
      diagnostics.push({
        severity: "error",
        code: "forbiddenOperationKeyMarker",
        message: `Safe Auto Setup plan cannot contain '${marker}' in a key.`,
        path,
      });
    }
  }
}

function validateOperationShape(
  operation: Record<string, unknown>,
  index: number,
  diagnostics: SafeAutoSetupDiagnostic[],
  options: SafeAutoSetupPlanValidationOptions,
): void {
  const path = `operations[${index}]`;
  const kind = operation.kind;

  if (typeof kind !== "string" || !SUPPORTED_OPERATION_KINDS.has(kind as never)) {
    diagnostics.push({
      severity: "error",
      code: "unsupportedOperation",
      message: `Unsupported Safe Auto Setup operation: ${String(kind)}`,
      path: `${path}.kind`,
      operationKind: typeof kind === "string" ? kind : undefined,
    });
    return;
  }

  switch (kind) {
    case "addBone":
      if (typeof operation.tempId !== "string") {
        pushInvalidShape(diagnostics, "addBone.tempId must be a string.", path);
      }
      if (typeof operation.name !== "string") {
        pushInvalidShape(diagnostics, "addBone.name must be a string.", path);
      }
      if (typeof operation.x !== "number" || typeof operation.y !== "number") {
        pushInvalidShape(diagnostics, "addBone coordinates must be numbers.", path);
      }
      break;
    case "parentBone":
      if (
        typeof operation.childTempId !== "string" ||
        typeof operation.parentTempId !== "string"
      ) {
        pushInvalidShape(
          diagnostics,
          "parentBone childTempId and parentTempId must be strings.",
          path,
        );
      }
      break;
    case "createParameter":
      if (!isRecord(operation.parameter)) {
        pushInvalidShape(diagnostics, "createParameter.parameter is required.", path);
      }
      break;
    case "createPhysicsGroup":
      if (!isRecord(operation.group)) {
        pushInvalidShape(diagnostics, "createPhysicsGroup.group is required.", path);
      }
      break;
    case "createMesh":
      if (typeof operation.layerId !== "string" || !isRecord(operation.mesh)) {
        pushInvalidShape(
          diagnostics,
          "createMesh requires layerId and mesh data.",
          path,
        );
      }
      if (operation.algorithm !== "alphaBoundary") {
        pushInvalidShape(
          diagnostics,
          "createMesh.algorithm must be alphaBoundary.",
          path,
        );
      }
      break;
    case "createSkin":
      if (
        typeof operation.layerId !== "string" ||
        !Array.isArray(operation.weights) ||
        !Array.isArray(operation.boneIds)
      ) {
        pushInvalidShape(
          diagnostics,
          "createSkin requires layerId, weights, and boneIds.",
          path,
        );
      }
      if (
        operation.solver !== "bbw" &&
        operation.solver !== "rigidLayer" &&
        operation.solver !== "secondaryMotion"
      ) {
        pushInvalidShape(diagnostics, "createSkin.solver is unsupported.", path);
      }
      if (operation.solver === "bbw" && !options.allowBbwSolver) {
        diagnostics.push({
          severity: "error",
          code: "bbwReviewGatePending",
          message:
            "createSkin.solver bbw is disabled until the BBW review gate is complete.",
          path: `${path}.solver`,
          operationKind: kind,
        });
      }
      break;
    case "createBinding": {
      const target = operation.target;
      if (typeof operation.parameterId !== "string") {
        pushInvalidShape(
          diagnostics,
          "createBinding.parameterId must be a string.",
          path,
        );
      }
      if (!Array.isArray(operation.bindingPoints)) {
        pushInvalidShape(
          diagnostics,
          "createBinding.bindingPoints must be an array.",
          path,
        );
      } else {
        operation.bindingPoints.forEach((point, pointIndex) => {
          if (
            !isRecord(point) ||
            typeof point.paramValue !== "number" ||
            typeof point.targetValue !== "number"
          ) {
            pushInvalidShape(
              diagnostics,
              "createBinding.bindingPoints entries must contain numeric paramValue and targetValue.",
              `${path}.bindingPoints[${pointIndex}]`,
            );
          }
        });
      }
      if (!isRecord(target) || typeof target.type !== "string") {
        pushInvalidShape(diagnostics, "createBinding.target is required.", path);
        break;
      }
      if (FORBIDDEN_BINDING_TARGET_TYPES.has(target.type)) {
        diagnostics.push({
          severity: "error",
          code: "invalidBindingTarget",
          message: `Safe Auto Setup cannot bind parameters to ${target.type}.`,
          path: `${path}.target.type`,
          operationKind: kind,
        });
      }
      if (target.type !== "bone" && target.type !== "ikController") {
        diagnostics.push({
          severity: "error",
          code: "invalidBindingTarget",
          message: `Unsupported Safe Auto Setup binding target: ${target.type}`,
          path: `${path}.target.type`,
          operationKind: kind,
        });
      }
      if (target.type === "bone") {
        if (
          typeof target.boneId !== "string" &&
          typeof target.tempBoneId !== "string"
        ) {
          pushInvalidShape(
            diagnostics,
            "createBinding bone target requires boneId or tempBoneId.",
            `${path}.target`,
          );
        }
        if (
          typeof target.property !== "string" ||
          !ALLOWED_BONE_BINDING_PROPERTIES.has(target.property)
        ) {
          pushInvalidShape(
            diagnostics,
            "createBinding bone target property is unsupported.",
            `${path}.target.property`,
          );
        }
      }
      if (target.type === "ikController") {
        if (typeof target.controllerId !== "string") {
          pushInvalidShape(
            diagnostics,
            "createBinding IK target requires controllerId.",
            `${path}.target.controllerId`,
          );
        }
        if (
          typeof target.property !== "string" ||
          !ALLOWED_IK_BINDING_PROPERTIES.has(target.property)
        ) {
          pushInvalidShape(
            diagnostics,
            "createBinding IK target property is unsupported.",
            `${path}.target.property`,
          );
        }
      }
      break;
    }
  }
}

export function validateSafeAutoSetupPlan(
  value: unknown,
  options: SafeAutoSetupPlanValidationOptions = {},
): SafeAutoSetupPlanValidationResult {
  const diagnostics: SafeAutoSetupDiagnostic[] = [];

  if (!isRecord(value)) {
    diagnostics.push({
      severity: "error",
      code: "invalidPlanShape",
      message: "Safe Auto Setup plan must be an object.",
    });
    return { ok: false, diagnostics };
  }

  if (value.planVersion !== SAFE_AUTO_SETUP_PLAN_VERSION) {
    diagnostics.push({
      severity: "error",
      code: "unsupportedPlanVersion",
      message: `Unsupported Safe Auto Setup plan version: ${String(value.planVersion)}`,
      path: "planVersion",
    });
  }

  if (value.profile !== SAFE_AUTO_SETUP_PLAN_PROFILE) {
    diagnostics.push({
      severity: "error",
      code: "invalidPlanShape",
      message: `Safe Auto Setup plan profile must be ${SAFE_AUTO_SETUP_PLAN_PROFILE}.`,
      path: "profile",
    });
  }

  if (typeof value.sourceFingerprint !== "string" || value.sourceFingerprint === "") {
    diagnostics.push({
      severity: "error",
      code: "invalidPlanShape",
      message: "Safe Auto Setup plan requires a source fingerprint.",
      path: "sourceFingerprint",
    });
  }

  if (!Array.isArray(value.operations)) {
    diagnostics.push({
      severity: "error",
      code: "invalidPlanShape",
      message: "Safe Auto Setup plan operations must be an array.",
      path: "operations",
    });
  } else {
    value.operations.forEach((operation, index) => {
      if (!isRecord(operation)) {
        diagnostics.push({
          severity: "error",
          code: "invalidOperationShape",
          message: "Safe Auto Setup operation must be an object.",
          path: `operations[${index}]`,
        });
        return;
      }
      validateOperationShape(operation, index, diagnostics, options);
      const scanOperation =
        operation.kind === "createSkin"
          ? Object.fromEntries(
              Object.entries(operation).filter(([key]) => key !== "solver"),
            )
          : operation;
      scanForbiddenMarkers(scanOperation, `operations[${index}]`, diagnostics);
    });
  }

  return {
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    diagnostics,
  };
}

export function assertSafeAutoSetupPlan(
  value: unknown,
  options: SafeAutoSetupPlanValidationOptions = {},
): SafeAutoSetupPlan {
  const validation = validateSafeAutoSetupPlan(value, options);
  if (!validation.ok) {
    throw new SafeAutoSetupPlanError(validation.diagnostics);
  }
  return value as SafeAutoSetupPlan;
}

export function migrateSafeAutoSetupPlan(input: unknown): SafeAutoSetupPlan {
  return assertSafeAutoSetupPlan(input);
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function createFnv1a32Hash(payload: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createStableAutoSetupHash(value: unknown): string {
  return createFnv1a32Hash(stableStringify(value));
}

export function createSafeAutoSetupManagedSignature(value: unknown): string {
  return `safeAutoSetupSignature:v1:${createStableAutoSetupHash(value)}`;
}

export function createSafeAutoSetupOperationSignature(
  operation: SafeAutoSetupOperation,
): string | undefined {
  if (operation.kind === "parentBone") return undefined;
  switch (operation.kind) {
    case "addBone":
      return createSafeAutoSetupManagedSignature({
        kind: operation.kind,
        name: operation.name,
        x: operation.x,
        y: operation.y,
      });
    case "createParameter":
      return createSafeAutoSetupManagedSignature({
        kind: operation.kind,
        id: operation.parameter.id,
        name: operation.parameter.name,
        minValue: operation.parameter.minValue,
        maxValue: operation.parameter.maxValue,
        defaultValue: operation.parameter.defaultValue,
        group: operation.parameter.group,
      });
    case "createPhysicsGroup":
      return createSafeAutoSetupManagedSignature({
        kind: operation.kind,
        name: operation.group.name,
        gravity: operation.group.gravity,
        damping: operation.group.damping,
      });
    case "createMesh":
      return createSafeAutoSetupManagedSignature({
        kind: operation.kind,
        layerId: operation.layerId,
        algorithm: operation.algorithm,
        mesh: operation.mesh,
      });
    case "createSkin":
      return createSafeAutoSetupManagedSignature({
        kind: operation.kind,
        layerId: operation.layerId,
        boneIds: [...operation.boneIds].sort(),
        weights: operation.weights,
      });
    case "createBinding":
      return createSafeAutoSetupManagedSignature({
        kind: operation.kind,
        parameterId: operation.parameterId,
        target: operation.target,
        bindingPoints: operation.bindingPoints,
      });
  }
}

export interface AutoSetupLayerPixelRecord {
  contentHash: string;
  alphaCoverage: {
    opaquePixels: number;
    totalPixels: number;
    threshold: number;
  };
  width: number;
  height: number;
}

export interface AutoSetupSourceFingerprintOptions {
  getTexture?: (layerId: string) => HTMLCanvasElement | undefined;
}

function canonicalizeLayer(
  layer: ProjectData["layers"][number],
  layerPixels?: ReadonlyMap<string, AutoSetupLayerPixelRecord>,
): unknown {
  return {
    id: layer.id,
    kind: layer.kind,
    name: layer.name,
    visible: layer.visible,
    opacity: layer.opacity,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    drawOrder: layer.drawOrder,
    semanticRole: layer.semanticRole,
    semanticRoleSource: layer.semanticRoleSource,
    importMetadata: layer.importMetadata,
    pixelRecord: layerPixels?.get(layer.id),
    mesh:
      layer.kind === "viviMesh"
        ? {
            divisionsX: layer.mesh.divisionsX,
            divisionsY: layer.mesh.divisionsY,
            vertices: layer.mesh.vertices,
            uvs: layer.mesh.uvs,
            indices: layer.mesh.indices,
          }
        : undefined,
    children: layer.children
      .filter(isAutoSetupSourceLayer)
      .map((child) => canonicalizeLayer(child, layerPixels)),
  };
}

function isAutoSetupSourceLayer(layer: ProjectData["layers"][number]): boolean {
  if (layer.kind === "bone") return false;
  return !layer.managedTag?.startsWith(SAFE_AUTO_SETUP_MANAGED_TAG_PREFIX);
}

export function createAutoSetupSourcePayload(
  project: ProjectData,
  layerPixels?: ReadonlyMap<string, AutoSetupLayerPixelRecord>,
): string {
  return stableStringify({
    roleDictionaryVersion: AUTO_SETUP_ROLE_DICTIONARY_VERSION,
    autoMeshPresetVersion: AUTO_MESH.PRESET_SCHEMA_VERSION,
    autoMeshPresetConstants: AUTO_MESH.PRESETS,
    autoMeshAlphaThreshold: AUTO_MESH.ALPHA_THRESHOLD,
    width: project.width,
    height: project.height,
    sourceKind: project.sourceKind,
    layers: project.layers
      .filter(isAutoSetupSourceLayer)
      .map((layer) => canonicalizeLayer(layer, layerPixels)),
  });
}

export function createFallbackAutoSetupSourceFingerprint(project: ProjectData): string {
  const payload = createAutoSetupSourcePayload(project);
  return createFnv1a32Hash(payload);
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
      hash ^= bytes[i]!;
      hash = Math.imul(hash, 0x01000193);
    }
    return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }
  const copy = new Uint8Array(bytes);
  const digest = await subtle.digest("SHA-256", copy.buffer);
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}

async function createLayerPixelRecord(
  canvas: HTMLCanvasElement,
): Promise<AutoSetupLayerPixelRecord | null> {
  if (canvas.width <= 0 || canvas.height <= 0) return null;
  const context = canvas.getContext("2d");
  if (!context) return null;

  let imageData: ImageData;
  try {
    imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }

  let opaquePixels = 0;
  for (let index = 3; index < imageData.data.length; index += 4) {
    if (imageData.data[index]! >= AUTO_MESH.ALPHA_THRESHOLD) opaquePixels += 1;
  }

  const bytes = new Uint8Array(
    imageData.data.buffer,
    imageData.data.byteOffset,
    imageData.data.byteLength,
  );
  return {
    contentHash: await digestBytes(bytes),
    alphaCoverage: {
      opaquePixels,
      totalPixels: canvas.width * canvas.height,
      threshold: AUTO_MESH.ALPHA_THRESHOLD,
    },
    width: canvas.width,
    height: canvas.height,
  };
}

async function collectLayerPixelRecords(
  project: ProjectData,
  options?: AutoSetupSourceFingerprintOptions,
): Promise<Map<string, AutoSetupLayerPixelRecord> | undefined> {
  const getTextureForLayer = options?.getTexture;
  if (!getTextureForLayer) return undefined;
  const records = new Map<string, AutoSetupLayerPixelRecord>();

  async function walk(
    layers: ProjectData["layers"],
    getTexture: (layerId: string) => HTMLCanvasElement | undefined,
  ): Promise<void> {
    for (const layer of layers) {
      const canvas = getTexture(layer.id);
      if (canvas) {
        const record = await createLayerPixelRecord(canvas);
        if (record) records.set(layer.id, record);
      }
      if (layer.children.length > 0) await walk(layer.children, getTexture);
    }
  }

  await walk(project.layers, getTextureForLayer);
  return records;
}

export async function createAutoSetupSourceFingerprint(
  project: ProjectData,
  options?: AutoSetupSourceFingerprintOptions,
): Promise<string> {
  const layerPixels = await collectLayerPixelRecords(project, options);
  const payload = createAutoSetupSourcePayload(project, layerPixels);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return createFnv1a32Hash(payload);
  }
  const bytes = new TextEncoder().encode(payload);
  const digest = await subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}
