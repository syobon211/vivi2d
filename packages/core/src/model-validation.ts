import { flattenLayers } from "./layer-utils";
import type { BoneNode, LayerNode, ProjectData, ViviMeshNode } from "./types";
import { isBone, isViviMesh } from "./types";

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: ValidationSeverity;
  category: string;
  message: string;
  layerId?: string;
  layerName?: string;
}

export function validateModel(project: ProjectData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const allLayers = flattenLayers(project.layers);
  const meshes = allLayers.filter(isViviMesh);
  const bones = allLayers.filter(isBone);

  validateUnusedBones(project, bones, issues);
  validateWeightNormalization(project, meshes, issues);
  validateUnboundVertices(project, meshes, issues);
  validateEmptyMeshes(meshes, issues);
  validateMeshIndexBounds(meshes, issues);
  validateOrphanSkins(project, allLayers, issues);

  return issues;
}

function validateUnusedBones(
  project: ProjectData,
  bones: BoneNode[],
  issues: ValidationIssue[],
): void {
  const usedBoneIds = new Set<string>();
  for (const skin of Object.values(project.skins)) {
    for (const vertexWeights of skin.weights) {
      for (const weight of vertexWeights ?? []) {
        usedBoneIds.add(weight.boneId);
      }
    }
  }
  for (const binding of project.parameterBindings ?? []) {
    if (binding.target.type === "bone") usedBoneIds.add(binding.target.boneId);
  }
  for (const controller of project.ikControllers ?? []) {
    for (const constraint of controller.boneChain) {
      usedBoneIds.add(constraint.boneId);
    }
  }

  for (const bone of bones) {
    if (!usedBoneIds.has(bone.id)) {
      issues.push({
        severity: "warning",
        category: "unusedBone",
        message: `Bone "${bone.name}" is not used by skins, bindings, or IK.`,
        layerId: bone.id,
        layerName: bone.name,
      });
    }
  }
}

function validateWeightNormalization(
  project: ProjectData,
  meshes: ViviMeshNode[],
  issues: ValidationIssue[],
): void {
  const tolerance = 0.01;
  for (const mesh of meshes) {
    const skin = project.skins[mesh.id];
    if (!skin) continue;

    let unnormalizedCount = 0;
    for (const vertexWeights of skin.weights) {
      if (!vertexWeights || vertexWeights.length === 0) continue;
      const total = vertexWeights.reduce((sum, weight) => sum + weight.weight, 0);
      if (Math.abs(total - 1) > tolerance) unnormalizedCount += 1;
    }

    if (unnormalizedCount > 0) {
      issues.push({
        severity: "warning",
        category: "weightNormalization",
        message: `Mesh "${mesh.name}" has ${unnormalizedCount} unnormalized vertices.`,
        layerId: mesh.id,
        layerName: mesh.name,
      });
    }
  }
}

function validateUnboundVertices(
  project: ProjectData,
  meshes: ViviMeshNode[],
  issues: ValidationIssue[],
): void {
  for (const mesh of meshes) {
    const skin = project.skins[mesh.id];
    if (!skin) continue;

    const vertexCount = mesh.mesh.vertices.length / 2;
    let unboundCount = 0;
    for (let index = 0; index < vertexCount; index += 1) {
      const vertexWeights = skin.weights[index];
      if (!vertexWeights || vertexWeights.length === 0) unboundCount += 1;
    }

    if (unboundCount > 0 && unboundCount < vertexCount) {
      issues.push({
        severity: "warning",
        category: "unboundVertices",
        message: `Mesh "${mesh.name}" has ${unboundCount}/${vertexCount} unbound vertices.`,
        layerId: mesh.id,
        layerName: mesh.name,
      });
    }
  }
}

function validateEmptyMeshes(meshes: ViviMeshNode[], issues: ValidationIssue[]): void {
  for (const mesh of meshes) {
    if (mesh.mesh.vertices.length === 0) {
      issues.push({
        severity: "error",
        category: "emptyMesh",
        message: `Mesh "${mesh.name}" has no vertices.`,
        layerId: mesh.id,
        layerName: mesh.name,
      });
    } else if (mesh.mesh.indices.length === 0) {
      issues.push({
        severity: "error",
        category: "emptyMesh",
        message: `Mesh "${mesh.name}" has no indices.`,
        layerId: mesh.id,
        layerName: mesh.name,
      });
    }
  }
}

function validateMeshIndexBounds(
  meshes: ViviMeshNode[],
  issues: ValidationIssue[],
): void {
  for (const mesh of meshes) {
    const vertexCount = mesh.mesh.vertices.length / 2;
    if (vertexCount === 0) continue;
    for (const index of mesh.mesh.indices) {
      if (index < 0 || index >= vertexCount) {
        issues.push({
          severity: "error",
          category: "meshIndexBounds",
          message: `Mesh "${mesh.name}" has out-of-range index ${index}.`,
          layerId: mesh.id,
          layerName: mesh.name,
        });
        break;
      }
    }
  }
}

function validateOrphanSkins(
  project: ProjectData,
  allLayers: LayerNode[],
  issues: ValidationIssue[],
): void {
  const layerIds = new Set(allLayers.map((layer) => layer.id));
  for (const skinLayerId of Object.keys(project.skins)) {
    if (!layerIds.has(skinLayerId)) {
      issues.push({
        severity: "info",
        category: "orphanSkin",
        message: `Skin data references missing layer "${skinLayerId}".`,
        layerId: skinLayerId,
      });
    }
  }
}
