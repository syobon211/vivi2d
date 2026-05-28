import { flattenLayers } from "@vivi2d/core/layer-utils";
import {
  type ViviMeshNode,
  getSeeThroughImportMetadata,
  isViviMesh,
  type LayerSemanticRole,
  type ProjectData,
} from "@vivi2d/core/types";
import { mapSeeThroughLabelToRole } from "@vivi2d/editor-core/see-through-role-map";
import type { GeneratedBone, GeneratedLabelLocale } from "./ai-bone-generator";
import type { AutoSetupOptions, SecondaryMotionWeightBinding } from "./auto-setup";
import { buildSeeThroughQualityReport } from "./see-through-quality-report";

export interface SeeThroughAutoSetupSummary {
  isSeeThroughProject: boolean;
  importedViviMeshCount: number;
  classifiedViviMeshCount: number;
  unknownRoleCount: number;
  accessoryCount: number;
  missingCriticalRoles: LayerSemanticRole[];
  warnings: string[];
  recommendedExcludedLayerIds: string[];
}

export interface SeeThroughMotionRiskLayerReport {
  layerId: string;
  layerName: string;
  semanticRole: LayerSemanticRole;
  riskScore: number;
  motionScale: number;
  overlapRatio: number;
  sweptOverlapRatio: number;
  reasons: string[];
}

export interface SeeThroughMotionRiskReport {
  isSeeThroughProject: boolean;
  layerReports: SeeThroughMotionRiskLayerReport[];
  maxRiskScore: number;
  averageMotionScale: number;
}

export const SEE_THROUGH_RECOMMENDED_AUTO_SETUP_OPTIONS: AutoSetupOptions = {
  generateBones: true,
  generatePhysics: true,
  generateMeshes: true,
  generateWeights: true,
  meshPreset: "standard",
  minConfidence: 0.5,
};

function hasKnownRole(role: LayerSemanticRole | undefined): role is LayerSemanticRole {
  return role != null && role !== "unknown";
}

const RIGID_SEETHROUGH_BONE_CATEGORY_BY_ROLE: Partial<
  Record<LayerSemanticRole, LayerSemanticRole>
> = {
  head: "head",
  face: "head",
  nose: "head",
  eyeLeft: "eyeLeft",
  eyeRight: "eyeRight",
  eyebrowLeft: "eyebrowLeft",
  eyebrowRight: "eyebrowRight",
  mouth: "mouth",
  body: "body",
  armLeft: "body",
  armRight: "body",
  handLeft: "body",
  handRight: "body",
  legLeft: "body",
  legRight: "body",
};

const SECONDARY_MOTION_ROLES = new Set<LayerSemanticRole>([
  "hair",
  "hairFront",
  "hairBack",
  "hairSide",
  "tail",
  "ear",
]);

const SECONDARY_MOTION_STAGE_IDS = ["root", "mid", "tip"] as const;

const MOTION_RISK_TARGET_WEIGHTS: Partial<Record<LayerSemanticRole, number>> = {
  face: 1,
  head: 0.92,
  body: 0.68,
  armLeft: 0.38,
  armRight: 0.38,
  handLeft: 0.3,
  handRight: 0.3,
  legLeft: 0.22,
  legRight: 0.22,
};

function resolveSeeThroughRole(layer: ViviMeshNode): LayerSemanticRole | null {
  if (hasKnownRole(layer.semanticRole)) return layer.semanticRole;

  const metadata = getSeeThroughImportMetadata(layer.importMetadata);
  if (!metadata) return null;

  const mappedRole = mapSeeThroughLabelToRole(metadata.label);
  return hasKnownRole(mappedRole) ? mappedRole : null;
}

function findBoneIdByCategory(
  bones: readonly GeneratedBone[],
  category: LayerSemanticRole,
): string | null {
  return bones.find((bone) => bone.partCategory === category)?.tempId ?? null;
}

function makeSecondaryMotionTempId(
  layerId: string,
  stage: (typeof SECONDARY_MOTION_STAGE_IDS)[number],
): string {
  const safeLayerId = layerId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `bone_secondary_${safeLayerId}_${stage}`;
}

function getSecondaryMotionLabel(
  role: LayerSemanticRole,
  locale: GeneratedLabelLocale = "en",
): string {
  const labels: Record<GeneratedLabelLocale, Partial<Record<LayerSemanticRole, string>>> = {
    en: {
      hairFront: "Front Hair",
      hairBack: "Back Hair",
      hairSide: "Side Hair",
      tail: "Tail",
      ear: "Ear",
      hair: "Hair",
    },
    ja: {
      hairFront: "前髪",
      hairBack: "後ろ髪",
      hairSide: "横髪",
      tail: "尻尾",
      ear: "耳",
      hair: "髪",
    },
  };
  return labels[locale][role] ?? labels[locale].hair ?? "Hair";
}

function getSecondaryMotionStageLabel(
  stage: (typeof SECONDARY_MOTION_STAGE_IDS)[number],
  locale: GeneratedLabelLocale = "en",
): string {
  if (locale !== "ja") return stage;
  switch (stage) {
    case "root":
      return "根元";
    case "mid":
      return "中間";
    case "tip":
      return "先端";
  }
}

function getSecondaryMotionAxis(
  layer: ViviMeshNode,
  role: LayerSemanticRole,
): SecondaryMotionWeightBinding["axis"] {
  if (role === "tail" && layer.width >= layer.height * 0.75) return "horizontal";
  return "vertical";
}

function shouldReverseSecondaryMotionAxis(
  project: ProjectData,
  layer: ViviMeshNode,
  role: LayerSemanticRole,
): boolean {
  if (getSecondaryMotionAxis(layer, role) !== "horizontal") return false;
  return layer.x + layer.width / 2 < project.width / 2;
}

function getSecondaryMotionPoint(
  project: ProjectData,
  layer: ViviMeshNode,
  role: LayerSemanticRole,
  ratio: number,
): { x: number; y: number } {
  const axis = getSecondaryMotionAxis(layer, role);
  const reverse = shouldReverseSecondaryMotionAxis(project, layer, role);
  if (axis === "horizontal") {
    const t = reverse ? 1 - ratio : ratio;
    return {
      x: layer.x + layer.width * t,
      y: layer.y + layer.height * 0.5,
    };
  }

  return {
    x: layer.x + layer.width * 0.5,
    y: layer.y + layer.height * ratio,
  };
}

function layerBounds(layer: ViviMeshNode): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
  };
}

function expandBoundsForMotion(
  layer: ViviMeshNode,
  role: LayerSemanticRole,
): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const axis = getSecondaryMotionAxis(layer, role);
  const horizontalSweep =
    axis === "vertical"
      ? Math.min(Math.max(layer.width * 0.1, 8), 72)
      : Math.min(Math.max(layer.width * 0.028, 4), 28);
  const verticalSweep =
    axis === "horizontal"
      ? Math.min(Math.max(layer.height * 0.16, 8), 52)
      : Math.min(Math.max(layer.height * 0.028, 4), 24);

  return {
    x: layer.x - horizontalSweep,
    y: layer.y - verticalSweep,
    width: layer.width + horizontalSweep * 2,
    height: layer.height + verticalSweep * 2,
  };
}

function intersectionArea(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function calculateMotionScale(riskScore: number): number {
  return Math.max(0.56, Math.min(1, 1 - riskScore * 0.44));
}

export function buildSeeThroughMotionRiskReport(
  project: ProjectData,
): SeeThroughMotionRiskReport {
  const importedViviMeshes = flattenLayers(project.layers).filter(
    (layer): layer is ViviMeshNode =>
      isViviMesh(layer) && layer.importMetadata?.source === "seeThrough",
  );
  if (importedViviMeshes.length === 0) {
    return {
      isSeeThroughProject: false,
      layerReports: [],
      maxRiskScore: 0,
      averageMotionScale: 1,
    };
  }

  const lowerTargets = importedViviMeshes
    .map((layer) => ({ layer, role: resolveSeeThroughRole(layer) }))
    .filter(
      (entry): entry is { layer: ViviMeshNode; role: LayerSemanticRole } =>
        entry.role != null && MOTION_RISK_TARGET_WEIGHTS[entry.role] != null,
    );

  const layerReports: SeeThroughMotionRiskLayerReport[] = [];
  for (const movingLayer of importedViviMeshes) {
    const movingRole = resolveSeeThroughRole(movingLayer);
    if (!movingRole || !SECONDARY_MOTION_ROLES.has(movingRole)) continue;

    const originalBounds = layerBounds(movingLayer);
    const sweptBounds = expandBoundsForMotion(movingLayer, movingRole);
    const layerArea = Math.max(1, movingLayer.width * movingLayer.height);
    let weightedOverlap = 0;
    let weightedSweptOverlap = 0;
    const reasons = new Set<string>();

    for (const { layer: targetLayer, role: targetRole } of lowerTargets) {
      if (targetLayer.id === movingLayer.id) continue;
      const weight = MOTION_RISK_TARGET_WEIGHTS[targetRole] ?? 0;
      if (weight <= 0) continue;

      const targetBounds = layerBounds(targetLayer);
      const overlapRatio =
        intersectionArea(originalBounds, targetBounds) / layerArea;
      const sweptOverlapRatio =
        intersectionArea(sweptBounds, targetBounds) / layerArea;
      if (sweptOverlapRatio <= 0) continue;

      weightedOverlap += overlapRatio * weight;
      weightedSweptOverlap += Math.max(0, sweptOverlapRatio - overlapRatio) * weight;
      if (targetRole === "face" || targetRole === "head") {
        reasons.add("face/head overlap");
      } else if (targetRole === "body") {
        reasons.add("body overlap");
      } else {
        reasons.add("limb overlap");
      }
    }

    const roleBias =
      movingRole === "hairFront" || movingRole === "hair" ? 0.08 : movingRole === "tail" ? 0.04 : 0;
    const riskScore = Math.min(
      1,
      weightedOverlap * 1.16 + weightedSweptOverlap * 0.9 + roleBias,
    );
    const motionScale = calculateMotionScale(riskScore);
    if (motionScale < 0.92) reasons.add("motion auto-clamped");

    layerReports.push({
      layerId: movingLayer.id,
      layerName: movingLayer.name,
      semanticRole: movingRole,
      riskScore,
      motionScale,
      overlapRatio: weightedOverlap,
      sweptOverlapRatio: weightedSweptOverlap,
      reasons: [...reasons],
    });
  }

  const maxRiskScore =
    layerReports.length > 0
      ? Math.max(...layerReports.map((report) => report.riskScore))
      : 0;
  const averageMotionScale =
    layerReports.length > 0
      ? layerReports.reduce((sum, report) => sum + report.motionScale, 0) /
        layerReports.length
      : 1;

  return {
    isSeeThroughProject: true,
    layerReports,
    maxRiskScore,
    averageMotionScale,
  };
}

export function buildSeeThroughSecondaryMotionBones(
  project: ProjectData,
  bones: readonly GeneratedBone[],
  locale: GeneratedLabelLocale = "en",
): GeneratedBone[] {
  const importedViviMeshes = flattenLayers(project.layers).filter(
    (layer): layer is ViviMeshNode =>
      isViviMesh(layer) && layer.importMetadata?.source === "seeThrough",
  );
  if (importedViviMeshes.length === 0) return [];

  const existingIds = new Set(bones.map((bone) => bone.tempId));
  const generated: GeneratedBone[] = [];

  for (const layer of importedViviMeshes) {
    const role = resolveSeeThroughRole(layer);
    if (!role || !SECONDARY_MOTION_ROLES.has(role)) continue;

    const label = getSecondaryMotionLabel(role, locale);
    const points = [
      getSecondaryMotionPoint(project, layer, role, 0.05),
      getSecondaryMotionPoint(project, layer, role, 0.52),
      getSecondaryMotionPoint(project, layer, role, 0.94),
    ];

    for (let index = 0; index < SECONDARY_MOTION_STAGE_IDS.length; index += 1) {
      const stage = SECONDARY_MOTION_STAGE_IDS[index]!;
      const tempId = makeSecondaryMotionTempId(layer.id, stage);
      if (existingIds.has(tempId)) continue;
      existingIds.add(tempId);
      const point = points[index]!;
      generated.push({
        tempId,
        name: `${label} ${getSecondaryMotionStageLabel(stage, locale)}`,
        parentTempId: null,
        x: point.x,
        y: point.y,
        partCategory: role,
      });
    }
  }

  return generated;
}

export function buildSeeThroughSecondaryMotionWeightBindings(
  project: ProjectData,
  bones: readonly GeneratedBone[],
  riskReport = buildSeeThroughMotionRiskReport(project),
): Record<string, SecondaryMotionWeightBinding> {
  const importedViviMeshes = flattenLayers(project.layers).filter(
    (layer): layer is ViviMeshNode =>
      isViviMesh(layer) && layer.importMetadata?.source === "seeThrough",
  );
  if (importedViviMeshes.length === 0 || bones.length === 0) return {};

  const boneIds = new Set(bones.map((bone) => bone.tempId));
  const bindings: Record<string, SecondaryMotionWeightBinding> = {};

  for (const layer of importedViviMeshes) {
    const role = resolveSeeThroughRole(layer);
    if (!role || !SECONDARY_MOTION_ROLES.has(role)) continue;

    const chainBoneIds = SECONDARY_MOTION_STAGE_IDS.map((stage) =>
      makeSecondaryMotionTempId(layer.id, stage),
    ) as [string, string, string];
    if (!chainBoneIds.every((boneId) => boneIds.has(boneId))) continue;

    bindings[layer.id] = {
      boneIds: chainBoneIds,
      axis: getSecondaryMotionAxis(layer, role),
      reverse: shouldReverseSecondaryMotionAxis(project, layer, role),
      motionScale:
        riskReport.layerReports.find((report) => report.layerId === layer.id)
          ?.motionScale ?? 1,
      riskScore:
        riskReport.layerReports.find((report) => report.layerId === layer.id)
          ?.riskScore ?? 0,
    };
  }

  return bindings;
}

/**
 * See-through facial layers are imported as already separated source artwork.
 * Keep them shape-stable by binding each layer rigidly to the nearest facial
 * control instead of letting BBW blend the face surface across eyes/mouth/body.
 */
export function buildSeeThroughRigidWeightBindings(
  project: ProjectData,
  bones: readonly GeneratedBone[],
): Record<string, string> {
  const importedViviMeshes = flattenLayers(project.layers).filter(
    (layer): layer is ViviMeshNode =>
      isViviMesh(layer) && layer.importMetadata?.source === "seeThrough",
  );
  if (importedViviMeshes.length === 0 || bones.length === 0) return {};

  const headBoneId = findBoneIdByCategory(bones, "head");
  const bindings: Record<string, string> = {};

  for (const layer of importedViviMeshes) {
    const role = resolveSeeThroughRole(layer);
    if (!role) continue;

    const preferredCategory = RIGID_SEETHROUGH_BONE_CATEGORY_BY_ROLE[role];
    if (!preferredCategory) continue;

    const preferredBoneId = findBoneIdByCategory(bones, preferredCategory);
    const fallbackBoneId = preferredCategory === "head" ? null : headBoneId;
    const boneId = preferredBoneId ?? fallbackBoneId;
    if (!boneId) continue;

    bindings[layer.id] = boneId;
  }

  return bindings;
}

export function summarizeSeeThroughAutoSetup(
  project: ProjectData,
): SeeThroughAutoSetupSummary {
  const importedViviMeshes = flattenLayers(project.layers).filter(
    (layer) => isViviMesh(layer) && layer.importMetadata?.source === "seeThrough",
  );

  if (importedViviMeshes.length === 0) {
    return {
      isSeeThroughProject: false,
      importedViviMeshCount: 0,
      classifiedViviMeshCount: 0,
      unknownRoleCount: 0,
      accessoryCount: 0,
      missingCriticalRoles: [],
      warnings: [],
      recommendedExcludedLayerIds: [],
    };
  }

  const report = buildSeeThroughQualityReport(project);
  const roleSet = new Set(
    importedViviMeshes.map((layer) => layer.semanticRole).filter(hasKnownRole),
  );

  const missingCriticalRoles: LayerSemanticRole[] = [];
  const warnings = report.projectIssues.flatMap((issue) => {
    switch (issue.code) {
      case "missingHeadOrFace":
        missingCriticalRoles.push("head", "face");
        return ["Face/head layers are missing."];
      case "missingEyeLeft":
      case "missingEyeRight":
        return [];
      case "missingMouth":
        missingCriticalRoles.push("mouth");
        return ["Mouth layers are missing."];
      case "missingBody":
        missingCriticalRoles.push("body");
        return ["Body layers are missing."];
      default:
        return [];
    }
  });

  if (!roleSet.has("eyeLeft")) {
    missingCriticalRoles.push("eyeLeft");
  }
  if (!roleSet.has("eyeRight")) {
    missingCriticalRoles.push("eyeRight");
  }
  if (!roleSet.has("eyeLeft") || !roleSet.has("eyeRight")) {
    warnings.push("One or both eye layers are missing.");
  }

  return {
    isSeeThroughProject: true,
    importedViviMeshCount: importedViviMeshes.length,
    classifiedViviMeshCount: importedViviMeshes.filter((layer) =>
      hasKnownRole(layer.semanticRole),
    ).length,
    unknownRoleCount: importedViviMeshes.filter(
      (layer) => layer.semanticRole == null || layer.semanticRole === "unknown",
    ).length,
    accessoryCount: importedViviMeshes.filter(
      (layer) => layer.semanticRole === "accessory",
    ).length,
    missingCriticalRoles,
    warnings,
    recommendedExcludedLayerIds: importedViviMeshes
      .filter(
        (layer) =>
          layer.semanticRole === "accessory" ||
          layer.semanticRole == null ||
          layer.semanticRole === "unknown",
      )
      .map((layer) => layer.id),
  };
}
