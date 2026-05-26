import type { SkinData } from "@vivi2d/core";
import {
  multiplyRuntimeAffine,
  type RuntimeAffine2D,
} from "./bone";

export function computeRuntimeSkinnedVertices(
  restVertices: readonly number[],
  skin: SkinData,
  worldTransforms: Map<string, RuntimeAffine2D>,
): number[] {
  const vertexCount = restVertices.length / 2;
  const result = new Array<number>(restVertices.length).fill(0);

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    const restX = restVertices[vertexIndex * 2]!;
    const restY = restVertices[vertexIndex * 2 + 1]!;
    const vertexWeights = skin.weights[vertexIndex];

    if (!vertexWeights || vertexWeights.length === 0) {
      result[vertexIndex * 2] = restX;
      result[vertexIndex * 2 + 1] = restY;
      continue;
    }

    let sumX = 0;
    let sumY = 0;
    let appliedWeight = 0;

    for (const skinWeight of vertexWeights) {
      const world = worldTransforms.get(skinWeight.boneId);
      const bindInverse = skin.bindPoseInverse[skinWeight.boneId];
      if (!world || !bindInverse) continue;

      const skinMatrix = multiplyRuntimeAffine(world, bindInverse);
      const transformedX =
        skinMatrix[0] * restX + skinMatrix[2] * restY + skinMatrix[4];
      const transformedY =
        skinMatrix[1] * restX + skinMatrix[3] * restY + skinMatrix[5];

      sumX += transformedX * skinWeight.weight;
      sumY += transformedY * skinWeight.weight;
      appliedWeight += skinWeight.weight;
    }

    if (appliedWeight <= 1e-12) {
      result[vertexIndex * 2] = restX;
      result[vertexIndex * 2 + 1] = restY;
      continue;
    }

    if (appliedWeight < 1) {
      const restWeight = 1 - appliedWeight;
      sumX += restX * restWeight;
      sumY += restY * restWeight;
    }

    result[vertexIndex * 2] = sumX;
    result[vertexIndex * 2 + 1] = sumY;
  }

  return result;
}
