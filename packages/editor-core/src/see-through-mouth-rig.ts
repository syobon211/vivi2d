import { flattenLayers } from "@vivi2d/core/layer-utils";
import type {
  BoneNode,
  ParameterDefinition,
  ProjectData,
  ViviMeshNode,
} from "@vivi2d/core/types";
import { getSeeThroughImportMetadata, isBone, isViviMesh } from "@vivi2d/core/types";

const MOUTH_LABEL = "mouth";
const MOUTH_CONTROL_MANAGED_PREFIX = "seeThroughMouthControl:v1";
const MOUTH_PARAMETER_NAME = "Mouth Open";
const MOUTH_PARAMETER_GROUP = "Mouth";
const MOUTH_CONTROL_BONE_NAME = "Mouth Control";

type MouthControlManagedKind = "parameter" | "controlBone";

export interface SeeThroughMouthRigApplyOptions {
  createId?: () => string;
}

export interface SeeThroughMouthRigPlan {
  applied: boolean;
  createdParameterIds: string[];
  createdControlBoneIds: string[];
  adoptedAssetIds: string[];
  lipsyncTargetUpdated: boolean;
  warnings: string[];
}

const defaultCreateId = () => crypto.randomUUID();

function buildManagedTag(kind: MouthControlManagedKind) {
  return `${MOUTH_CONTROL_MANAGED_PREFIX}:${kind}`;
}

function normalizeLabel(label: string | undefined) {
  return (label ?? "").normalize("NFKC").trim().toLowerCase();
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

function findManagedParameter(project: ProjectData) {
  return project.parameters.filter(
    (parameter) => parameter.managedTag === buildManagedTag("parameter"),
  );
}

function findManagedControlBone(project: ProjectData) {
  return listBones(project).filter(
    (bone) => bone.managedTag === buildManagedTag("controlBone"),
  );
}

function findLegacyCompatibleParameter(project: ProjectData) {
  return project.parameters.find(
    (parameter) =>
      parameter.managedTag == null &&
      parameter.name === MOUTH_PARAMETER_NAME &&
      parameter.minValue === 0 &&
      parameter.maxValue === 1 &&
      parameter.defaultValue === 0 &&
      parameter.group === MOUTH_PARAMETER_GROUP,
  );
}

function findLegacyCompatibleBone(project: ProjectData) {
  return listBones(project).find(
    (bone) => bone.managedTag == null && bone.name === MOUTH_CONTROL_BONE_NAME,
  );
}

function hasParameterNameConflict(project: ProjectData) {
  return project.parameters.some(
    (parameter) =>
      parameter.name === MOUTH_PARAMETER_NAME &&
      parameter.managedTag !== buildManagedTag("parameter"),
  );
}

function findParameterById(project: ProjectData, parameterId: string | null | undefined) {
  return parameterId
    ? project.parameters.find((parameter) => parameter.id === parameterId)
    : undefined;
}

function createParameter(createId: () => string): ParameterDefinition {
  return {
    id: createId(),
    name: MOUTH_PARAMETER_NAME,
    minValue: 0,
    maxValue: 1,
    defaultValue: 0,
    group: MOUTH_PARAMETER_GROUP,
    managedTag: buildManagedTag("parameter"),
  };
}

function createControlBone(layer: ViviMeshNode, createId: () => string): BoneNode {
  const size = Math.max(12, Math.min(layer.width, layer.height) * 0.5);
  return {
    id: createId(),
    name: MOUTH_CONTROL_BONE_NAME,
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
    managedTag: buildManagedTag("controlBone"),
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

export function applySeeThroughMouthRig(
  project: ProjectData,
  options: SeeThroughMouthRigApplyOptions = {},
): SeeThroughMouthRigPlan {
  const createId = options.createId ?? defaultCreateId;
  const warnings: string[] = [];
  const createdParameterIds: string[] = [];
  const createdControlBoneIds: string[] = [];
  const adoptedAssetIds: string[] = [];
  let lipsyncTargetUpdated = false;

  const mouthCandidates = listSeeThroughImportedViviMeshes(project).filter(
    (layer) =>
      normalizeLabel(getSeeThroughImportMetadata(layer.importMetadata)?.label) ===
      MOUTH_LABEL,
  );

  if (mouthCandidates.length === 0) {
    return {
      applied: false,
      createdParameterIds,
      createdControlBoneIds,
      adoptedAssetIds,
      lipsyncTargetUpdated,
      warnings,
    };
  }

  if (mouthCandidates.length !== 1) {
    warnings.push(
      `Skipped mouth controls because ${mouthCandidates.length} imported mouth layers were found.`,
    );
    return {
      applied: false,
      createdParameterIds,
      createdControlBoneIds,
      adoptedAssetIds,
      lipsyncTargetUpdated,
      warnings,
    };
  }

  const mouthLayer = mouthCandidates[0]!;
  const managedParameters = findManagedParameter(project);
  if (managedParameters.length > 1) {
    warnings.push(
      "Skipped mouth controls because multiple managed mouth parameters were found.",
    );
    return {
      applied: false,
      createdParameterIds,
      createdControlBoneIds,
      adoptedAssetIds,
      lipsyncTargetUpdated,
      warnings,
    };
  }

  const managedControlBones = findManagedControlBone(project);
  if (managedControlBones.length > 1) {
    warnings.push(
      "Skipped mouth controls because multiple managed mouth control bones were found.",
    );
    return {
      applied: false,
      createdParameterIds,
      createdControlBoneIds,
      adoptedAssetIds,
      lipsyncTargetUpdated,
      warnings,
    };
  }

  let parameter = managedParameters[0] ?? findLegacyCompatibleParameter(project);
  parameter = adoptManagedTag(
    parameter,
    buildManagedTag("parameter"),
    adoptedAssetIds,
  );

  let controlBone = managedControlBones[0] ?? findLegacyCompatibleBone(project);
  controlBone = adoptManagedTag(
    controlBone,
    buildManagedTag("controlBone"),
    adoptedAssetIds,
  );

  if (!parameter && hasParameterNameConflict(project)) {
    warnings.push(
      `Skipped mouth controls because ${MOUTH_PARAMETER_NAME} already exists as a user-owned parameter.`,
    );
    return {
      applied: false,
      createdParameterIds,
      createdControlBoneIds,
      adoptedAssetIds,
      lipsyncTargetUpdated,
      warnings,
    };
  }

  if (!parameter) {
    parameter = createParameter(createId);
    project.parameters.push(parameter);
    createdParameterIds.push(parameter.id);
  }

  if (!controlBone) {
    controlBone = createControlBone(mouthLayer, createId);
    project.layers.push(controlBone);
    createdControlBoneIds.push(controlBone.id);
  }

  const config = project.lipsyncConfig;
  const currentTargetParameter = findParameterById(project, config.targetParameterId);
  if (config.targetParameterId == null) {
    config.targetParameterId = parameter.id;
    lipsyncTargetUpdated = true;
  } else if (currentTargetParameter?.id === parameter.id) {
    // Already wired.
  } else if (!currentTargetParameter) {
    config.targetParameterId = parameter.id;
    lipsyncTargetUpdated = true;
  } else {
    warnings.push(
      "Preserved existing lip-sync parameter target and did not rewire Mouth Open automatically.",
    );
  }

  return {
    applied:
      createdParameterIds.length > 0 ||
      createdControlBoneIds.length > 0 ||
      adoptedAssetIds.length > 0 ||
      lipsyncTargetUpdated,
    createdParameterIds,
    createdControlBoneIds,
    adoptedAssetIds,
    lipsyncTargetUpdated,
    warnings,
  };
}
