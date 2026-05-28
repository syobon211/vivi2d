import type { Affine2D } from "@vivi2d/core/bone-utils";
import { computeBoneWorldTransforms, invertAffine } from "@vivi2d/core/bone-utils";
import { findLayerById } from "@vivi2d/core/layer-utils";
import {
  type BonePosition,
  computeDistanceWeights,
  findVerticesInRadius,
  normalizeWeights,
  smoothWeights,
} from "@vivi2d/core/skin-utils";
import type { ProjectData, SkinWeight } from "@vivi2d/core/types";
import { isBone } from "@vivi2d/core/types";

export type SkinWeightBrushMode = "add" | "subtract" | "smooth";

export function bindSkinToBones(
  project: ProjectData,
  meshId: string,
  boneIds: string[],
): boolean {
  if (!project.skins) project.skins = {};

  const mesh = findLayerById(project.layers, meshId);
  if (!mesh || mesh.kind !== "viviMesh") return false;
  const vertexCount = mesh.mesh.vertices.length / 2;

  const worldTransforms = computeBoneWorldTransforms(project.layers);
  const bindPoseInverse: Record<string, Affine2D> = {};
  for (const boneId of boneIds) {
    const world = worldTransforms.get(boneId);
    if (world) {
      bindPoseInverse[boneId] = invertAffine(world);
    }
  }

  const equalWeight = boneIds.length > 0 ? 1 / boneIds.length : 0;
  const weights: SkinWeight[][] = Array.from({ length: vertexCount }, () =>
    boneIds.map((boneId) => ({ boneId, weight: equalWeight })),
  );

  project.skins[meshId] = { weights, bindPoseInverse };
  return true;
}

export function unbindSkin(project: ProjectData, meshId: string): boolean {
  if (!project.skins || !(meshId in project.skins)) return false;
  delete project.skins[meshId];
  return true;
}

export function setSkinVertexWeights(
  project: ProjectData,
  meshId: string,
  vertexIndex: number,
  weights: SkinWeight[],
): boolean {
  const skin = project.skins?.[meshId];
  if (!skin || vertexIndex < 0 || vertexIndex >= skin.weights.length) return false;
  skin.weights[vertexIndex] = weights;
  return true;
}

export function paintSkinWeight(
  project: ProjectData,
  meshId: string,
  vertexIndex: number,
  boneId: string,
  weight: number,
): boolean {
  const skin = project.skins?.[meshId];
  if (!skin || vertexIndex < 0 || vertexIndex >= skin.weights.length) return false;
  const vertexWeights = skin.weights[vertexIndex]!;
  const existing = vertexWeights.find((entry) => entry.boneId === boneId);
  if (existing) {
    existing.weight = weight;
  } else {
    vertexWeights.push({ boneId, weight });
  }
  const total = vertexWeights.reduce((sum, entry) => sum + entry.weight, 0);
  if (total > 1e-12) {
    for (const entry of vertexWeights) {
      entry.weight /= total;
    }
  }
  return true;
}

export function normalizeSkinWeights(project: ProjectData, meshId: string): boolean {
  const skin = project.skins?.[meshId];
  if (!skin) return false;
  for (let i = 0; i < skin.weights.length; i += 1) {
    skin.weights[i] = normalizeWeights(skin.weights[i]!);
  }
  return true;
}

export function autoComputeSkinWeights(
  project: ProjectData,
  meshId: string,
): boolean {
  const skin = project.skins?.[meshId];
  if (!skin) return false;
  const mesh = findLayerById(project.layers, meshId);
  if (!mesh || mesh.kind !== "viviMesh") return false;

  const boneIds = Object.keys(skin.bindPoseInverse);
  const bones: BonePosition[] = [];
  for (const boneId of boneIds) {
    const bone = findLayerById(project.layers, boneId);
    if (bone && isBone(bone)) {
      bones.push({ id: bone.id, x: bone.x, y: bone.y });
    }
  }

  const worldVerts = mesh.mesh.vertices.map((value, index) =>
    index % 2 === 0 ? value + mesh.x : value + mesh.y,
  );

  skin.weights = computeDistanceWeights(worldVerts, bones);
  return true;
}

export function paintSkinWeightBrush(
  project: ProjectData,
  meshId: string,
  centerX: number,
  centerY: number,
  radius: number,
  boneId: string,
  strength: number,
  mode: SkinWeightBrushMode,
): boolean {
  const skin = project.skins?.[meshId];
  if (!skin) return false;
  const mesh = findLayerById(project.layers, meshId);
  if (!mesh || mesh.kind !== "viviMesh") return false;

  const worldVerts = mesh.mesh.vertices.map((value, index) =>
    index % 2 === 0 ? value + mesh.x : value + mesh.y,
  );

  if (mode === "smooth") {
    const affected = findVerticesInRadius(worldVerts, centerX, centerY, radius);
    if (affected.length === 0) return false;
    const smoothed = smoothWeights(skin.weights, mesh.mesh.indices, 1);
    for (const { index, distance } of affected) {
      const falloff = 1 - distance / radius;
      const blend = falloff * strength;
      const original = skin.weights[index]!;
      const target = smoothed[index]!;
      const boneWeightMap = new Map<string, number>();
      for (const weight of original) {
        boneWeightMap.set(weight.boneId, weight.weight * (1 - blend));
      }
      for (const weight of target) {
        boneWeightMap.set(
          weight.boneId,
          (boneWeightMap.get(weight.boneId) ?? 0) + weight.weight * blend,
        );
      }
      const merged: SkinWeight[] = [];
      for (const [id, value] of boneWeightMap) {
        if (value > 0.001) merged.push({ boneId: id, weight: value });
      }
      skin.weights[index] = normalizeWeights(merged);
    }
    return true;
  }

  const affected = findVerticesInRadius(worldVerts, centerX, centerY, radius);
  if (affected.length === 0) return false;
  for (const { index, distance } of affected) {
    const falloff = 1 - distance / radius;
    const delta = falloff * strength * (mode === "subtract" ? -1 : 1);
    const vertexWeights = skin.weights[index]!;
    const existing = vertexWeights.find((weight) => weight.boneId === boneId);
    if (existing) {
      existing.weight = Math.max(0, existing.weight + delta);
    } else if (delta > 0) {
      vertexWeights.push({ boneId, weight: delta });
    }
    skin.weights[index] = normalizeWeights(
      vertexWeights.filter((weight) => weight.weight > 0.001),
    );
  }
  return true;
}
