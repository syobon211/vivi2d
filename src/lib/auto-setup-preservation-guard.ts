import { flattenLayers } from "@vivi2d/core/layer-utils";
import {
  getManualPngImportMetadata,
  isViviMesh,
  type ProjectData,
  type SkinWeight,
  type ViviMeshNode,
} from "@vivi2d/core/types";
import type { GeneratedBone } from "@/lib/ai-bone-generator";
import type { AutoSetupResult, WeightGenerationResult } from "@/lib/auto-setup";

const HEAD_FAMILY_CATEGORIES = new Set<GeneratedBone["partCategory"]>([
  "head",
  "face",
  "eyeLeft",
  "eyeRight",
  "eyebrowLeft",
  "eyebrowRight",
  "mouth",
  "nose",
  "hair",
  "hairFront",
  "hairBack",
  "hairSide",
  "ear",
]);

const LOWER_REGION_START_RATIO = 0.35;
const LOWER_REGION_AVERAGE_HEAD_INFLUENCE_LIMIT = 0.03;
const LOWER_REGION_MAX_HEAD_INFLUENCE_LIMIT = 0.12;

export interface AutoSetupPreservationRisk {
  layerId: string;
  risky: boolean;
  lowerRegionVertexCount: number;
  lowerRegionAverageHeadInfluence: number;
  lowerRegionMaxHeadInfluence: number;
  reason: "flatManualPngHeadInfluenceLeakage" | "notFlatManualPng" | "notAssessable";
}

export interface AutoSetupPreservationGuardResult {
  weightResults: WeightGenerationResult[];
  skippedWeightLayerIds: string[];
  risks: AutoSetupPreservationRisk[];
}

function findSingleFlatManualPngMesh(project: ProjectData): ViviMeshNode | null {
  const meshes = flattenLayers(project.layers).filter(isViviMesh);
  if (meshes.length !== 1) return null;

  const mesh = meshes[0]!;
  const isManualPng =
    project.sourceKind === "manualPng" ||
    Boolean(getManualPngImportMetadata(mesh.importMetadata));
  return isManualPng ? mesh : null;
}

function sumInfluence(weights: readonly SkinWeight[], boneIds: ReadonlySet<string>) {
  return weights.reduce(
    (total, weight) => total + (boneIds.has(weight.boneId) ? weight.weight : 0),
    0,
  );
}

export function assessAutoSetupWeightPreservationRisk(
  project: ProjectData,
  result: AutoSetupResult,
  weightResult: WeightGenerationResult,
): AutoSetupPreservationRisk {
  const flatManualPngMesh = findSingleFlatManualPngMesh(project);
  if (!flatManualPngMesh || flatManualPngMesh.id !== weightResult.layerId) {
    return {
      layerId: weightResult.layerId,
      risky: false,
      lowerRegionVertexCount: 0,
      lowerRegionAverageHeadInfluence: 0,
      lowerRegionMaxHeadInfluence: 0,
      reason: "notFlatManualPng",
    };
  }

  const bones = result.boneResult?.bones ?? [];
  const headFamilyBoneIds = new Set(
    bones
      .filter((bone) => HEAD_FAMILY_CATEGORIES.has(bone.partCategory))
      .map((bone) => bone.tempId),
  );
  const headBone = bones.find((bone) => bone.partCategory === "head");
  const bodyBone = bones.find((bone) => bone.partCategory === "body");
  const meshResult = result.meshResults.find((mesh) => mesh.layerId === weightResult.layerId);
  const vertices = meshResult?.mesh.vertices ?? flatManualPngMesh.mesh.vertices;

  if (headFamilyBoneIds.size === 0 || vertices.length < 2) {
    return {
      layerId: weightResult.layerId,
      risky: false,
      lowerRegionVertexCount: 0,
      lowerRegionAverageHeadInfluence: 0,
      lowerRegionMaxHeadInfluence: 0,
      reason: "notAssessable",
    };
  }

  const lowerRegionStartFromImage =
    flatManualPngMesh.y + flatManualPngMesh.height * LOWER_REGION_START_RATIO;
  const lowerRegionStartFromBones =
    headBone && bodyBone && bodyBone.y > headBone.y
      ? headBone.y + (bodyBone.y - headBone.y) * 0.55
      : lowerRegionStartFromImage;
  const lowerRegionStart = Math.max(lowerRegionStartFromImage, lowerRegionStartFromBones);

  let lowerRegionVertexCount = 0;
  let totalHeadInfluence = 0;
  let maxHeadInfluence = 0;
  const vertexCount = Math.min(
    Math.floor(vertices.length / 2),
    weightResult.weights.length,
  );

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    const localY = vertices[vertexIndex * 2 + 1] ?? 0;
    const worldY = flatManualPngMesh.y + localY;
    if (worldY < lowerRegionStart) continue;

    const headInfluence = sumInfluence(
      weightResult.weights[vertexIndex] ?? [],
      headFamilyBoneIds,
    );
    lowerRegionVertexCount += 1;
    totalHeadInfluence += headInfluence;
    maxHeadInfluence = Math.max(maxHeadInfluence, headInfluence);
  }

  const averageHeadInfluence =
    lowerRegionVertexCount > 0 ? totalHeadInfluence / lowerRegionVertexCount : 0;
  const risky =
    lowerRegionVertexCount > 0 &&
    (averageHeadInfluence > LOWER_REGION_AVERAGE_HEAD_INFLUENCE_LIMIT ||
      maxHeadInfluence > LOWER_REGION_MAX_HEAD_INFLUENCE_LIMIT);

  return {
    layerId: weightResult.layerId,
    risky,
    lowerRegionVertexCount,
    lowerRegionAverageHeadInfluence: averageHeadInfluence,
    lowerRegionMaxHeadInfluence: maxHeadInfluence,
    reason: "flatManualPngHeadInfluenceLeakage",
  };
}

export function guardAutoSetupWeightResults(
  project: ProjectData,
  result: AutoSetupResult,
  excludedIds: ReadonlySet<string> = new Set(),
): AutoSetupPreservationGuardResult {
  const risks = result.weightResults.map((weightResult) =>
    assessAutoSetupWeightPreservationRisk(project, result, weightResult),
  );
  const riskByLayerId = new Map(risks.map((risk) => [risk.layerId, risk]));
  const skippedWeightLayerIds: string[] = [];
  const weightResults = result.weightResults.filter((weightResult) => {
    if (excludedIds.has(weightResult.layerId)) return true;
    const risk = riskByLayerId.get(weightResult.layerId);
    if (!risk?.risky) return true;
    skippedWeightLayerIds.push(weightResult.layerId);
    return false;
  });

  return { weightResults, skippedWeightLayerIds, risks };
}
