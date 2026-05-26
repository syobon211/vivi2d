import { flattenLayers } from "@vivi2d/core/layer-utils";
import type {
  BoneNode,
  ParameterDefinition,
  ProjectData,
  ViviMeshNode,
} from "@vivi2d/core/types";
import { getSeeThroughImportMetadata, isBone, isViviMesh } from "@vivi2d/core/types";

type EyeSide = "left" | "right";
type EyeControlManagedKind = "parameter" | "controlBone";

const EYE_CONTROL_MANAGED_PREFIX = "seeThroughEyeControl:v1";

const IRIS_LABEL_BY_SIDE: Record<EyeSide, string> = {
  left: "iris_left",
  right: "iris_right",
};

const EYE_WHITE_LABEL_BY_SIDE: Record<EyeSide, string> = {
  left: "eye_white_left",
  right: "eye_white_right",
};

const CONTROL_PARAMETER_NAME_BY_SIDE: Record<EyeSide, string> = {
  left: "Eye Blink Left",
  right: "Eye Blink Right",
};

const CONTROL_BONE_NAME_BY_SIDE: Record<EyeSide, string> = {
  left: "Eye Control Left",
  right: "Eye Control Right",
};

export interface SeeThroughRigApplyOptions {
  createId?: () => string;
}

export interface SeeThroughEyeRigPlan {
  applied: boolean;
  createdParameterIds: string[];
  createdControlBoneIds: string[];
  adoptedAssetIds: string[];
  warnings: string[];
}

const defaultCreateId = () => crypto.randomUUID();

function buildManagedTag(side: EyeSide, kind: EyeControlManagedKind) {
  return `${EYE_CONTROL_MANAGED_PREFIX}:${side}:${kind}`;
}

function normalizeLabel(label: string | undefined) {
  return (label ?? "").trim().toLowerCase();
}

function isSeeThroughImportedViviMesh(layer: unknown): layer is ViviMeshNode {
  return (
    isViviMesh(layer as ViviMeshNode) &&
    (layer as ViviMeshNode).importMetadata?.source === "seeThrough"
  );
}

function listSeeThroughImportedViviMeshes(project: ProjectData) {
  return flattenLayers(project.layers).filter(isSeeThroughImportedViviMesh);
}

function listBones(project: ProjectData) {
  return flattenLayers(project.layers).filter(isBone);
}

function findManagedParameter(project: ProjectData, side: EyeSide) {
  return project.parameters.filter(
    (parameter) => parameter.managedTag === buildManagedTag(side, "parameter"),
  );
}

function findManagedControlBone(project: ProjectData, side: EyeSide) {
  return listBones(project).filter(
    (bone) => bone.managedTag === buildManagedTag(side, "controlBone"),
  );
}

function findLegacyCompatibleParameter(project: ProjectData, side: EyeSide) {
  return project.parameters.find(
    (parameter) =>
      parameter.managedTag == null &&
      parameter.name === CONTROL_PARAMETER_NAME_BY_SIDE[side] &&
      parameter.minValue === 0 &&
      parameter.maxValue === 1 &&
      parameter.defaultValue === 0 &&
      parameter.group === "Eyes",
  );
}

function findLegacyCompatibleBone(project: ProjectData, side: EyeSide) {
  return listBones(project).find(
    (bone) =>
      bone.managedTag == null && bone.name === CONTROL_BONE_NAME_BY_SIDE[side],
  );
}

function hasParameterNameConflict(project: ProjectData, side: EyeSide) {
  const expectedName = CONTROL_PARAMETER_NAME_BY_SIDE[side];
  return project.parameters.some(
    (parameter) =>
      parameter.name === expectedName &&
      parameter.managedTag !== buildManagedTag(side, "parameter"),
  );
}

function createParameter(side: EyeSide, createId: () => string): ParameterDefinition {
  return {
    id: createId(),
    name: CONTROL_PARAMETER_NAME_BY_SIDE[side],
    minValue: 0,
    maxValue: 1,
    defaultValue: 0,
    group: "Eyes",
    managedTag: buildManagedTag(side, "parameter"),
  };
}

function createControlBone(
  side: EyeSide,
  layer: ViviMeshNode,
  createId: () => string,
): BoneNode {
  const size = Math.max(12, Math.min(layer.width, layer.height) * 0.5);
  return {
    id: createId(),
    name: CONTROL_BONE_NAME_BY_SIDE[side],
    visible: true,
    opacity: 1,
    x: layer.x + layer.width / 2,
    y: layer.y + layer.height / 2,
    width: 0,
    height: 0,
    children: [],
    blendMode: "normal",
    expanded: true,
    kind: "bone",
    bone: { angle: 0, length: size, scaleX: 1, scaleY: 1 },
    managedTag: buildManagedTag(side, "controlBone"),
  };
}

function adoptManagedTag<T extends { id: string; managedTag?: string }>(
  asset: T | undefined,
  managedTag: string,
  adoptedAssetIds: string[],
) {
  if (!asset || asset.managedTag === managedTag) return asset;
  asset.managedTag = managedTag;
  adoptedAssetIds.push(asset.id);
  return asset;
}

export function applySeeThroughEyeRig(
  project: ProjectData,
  options: SeeThroughRigApplyOptions = {},
): SeeThroughEyeRigPlan {
  const createId = options.createId ?? defaultCreateId;
  const importedViviMeshes = listSeeThroughImportedViviMeshes(project);
  const warnings: string[] = [];
  const createdParameterIds: string[] = [];
  const createdControlBoneIds: string[] = [];
  const adoptedAssetIds: string[] = [];

  for (const side of ["left", "right"] as const) {
    const irisCandidates = importedViviMeshes.filter(
      (layer) =>
        normalizeLabel(getSeeThroughImportMetadata(layer.importMetadata)?.label) ===
        IRIS_LABEL_BY_SIDE[side],
    );
    const eyeWhiteCandidates = importedViviMeshes.filter(
      (layer) =>
        normalizeLabel(getSeeThroughImportMetadata(layer.importMetadata)?.label) ===
        EYE_WHITE_LABEL_BY_SIDE[side],
    );

    if (irisCandidates.length === 0 && eyeWhiteCandidates.length === 0) continue;

    if (irisCandidates.length !== 1) {
      warnings.push(
        irisCandidates.length === 0
          ? `Skipped ${side} eye controls because no imported iris layer was found.`
          : `Skipped ${side} eye controls because ${irisCandidates.length} imported iris layers were found.`,
      );
      continue;
    }

    if (eyeWhiteCandidates.length !== 1) {
      warnings.push(
        eyeWhiteCandidates.length === 0
          ? `Skipped ${side} eye controls because no imported eye-white layer was found.`
          : `Skipped ${side} eye controls because ${eyeWhiteCandidates.length} imported eye-white layers were found.`,
      );
      continue;
    }

    const irisLayer = irisCandidates[0]!;
    const eyeWhiteLayer = eyeWhiteCandidates[0]!;
    if (!(irisLayer.clipMaskIds ?? []).includes(eyeWhiteLayer.id)) {
      warnings.push(
        `Skipped ${side} eye controls because ${irisLayer.name} is not clipped by ${eyeWhiteLayer.name}.`,
      );
      continue;
    }

    const managedParameters = findManagedParameter(project, side);
    if (managedParameters.length > 1) {
      warnings.push(
        `Skipped ${side} eye controls because multiple managed blink parameters were found.`,
      );
      continue;
    }
    let parameter =
      managedParameters[0] ?? findLegacyCompatibleParameter(project, side);
    parameter = adoptManagedTag(
      parameter,
      buildManagedTag(side, "parameter"),
      adoptedAssetIds,
    );

    const managedControlBones = findManagedControlBone(project, side);
    if (managedControlBones.length > 1) {
      warnings.push(
        `Skipped ${side} eye controls because multiple managed control bones were found.`,
      );
      continue;
    }
    let controlBone =
      managedControlBones[0] ?? findLegacyCompatibleBone(project, side);
    controlBone = adoptManagedTag(
      controlBone,
      buildManagedTag(side, "controlBone"),
      adoptedAssetIds,
    );

    if (!parameter && hasParameterNameConflict(project, side)) {
      warnings.push(
        `Skipped ${side} eye controls because ${CONTROL_PARAMETER_NAME_BY_SIDE[side]} already exists as a user-owned parameter.`,
      );
      continue;
    }

    if (!parameter) {
      parameter = createParameter(side, createId);
      project.parameters.push(parameter);
      createdParameterIds.push(parameter.id);
    }

    if (!controlBone) {
      controlBone = createControlBone(side, eyeWhiteLayer, createId);
      project.layers.push(controlBone);
      createdControlBoneIds.push(controlBone.id);
    }
  }

  return {
    applied:
      createdParameterIds.length > 0 ||
      createdControlBoneIds.length > 0 ||
      adoptedAssetIds.length > 0,
    createdParameterIds,
    createdControlBoneIds,
    adoptedAssetIds,
    warnings,
  };
}
