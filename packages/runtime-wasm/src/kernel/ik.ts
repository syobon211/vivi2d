import type {
  IKBoneConstraint,
  IKController,
  LayerNode,
  ProjectData,
} from "@vivi2d/core";
import { computeRuntimeBoneWorldTransforms } from "./bone";
import {
  clampRuntimeIKAngle,
  normalizeRuntimeIKAngle,
  solveRuntimeIKController,
} from "./ik-solver";

export interface RuntimeIKStepContext {
  readonly project: ProjectData;
  readonly boneLengths: Map<string, number>;
  readonly boneAngles: Record<string, number>;
  readonly boneX?: Record<string, number>;
  readonly boneY?: Record<string, number>;
  readonly boneScaleX?: Record<string, number>;
  readonly boneScaleY?: Record<string, number>;
  readonly ikTargetX?: Record<string, number>;
  readonly ikTargetY?: Record<string, number>;
  readonly ikPoleTargetX?: Record<string, number>;
  readonly ikPoleTargetY?: Record<string, number>;
  readonly ikInfluence?: Record<string, number>;
}

export function runRuntimeIKStep(ctx: RuntimeIKStepContext): void {
  const controllers = ctx.project.ikControllers;
  if (!controllers || controllers.length === 0) return;

  const boneParents = collectRuntimeBoneParents(ctx.project.layers);
  const poseLayers = createRuntimeIKPoseLayers(ctx);
  const worldTransforms = computeRuntimeBoneWorldTransforms(poseLayers);
  const boneLocalAngles = collectRuntimeBoneLocalAngles(poseLayers);

  for (const controller of controllers) {
    const effectiveController = applyControllerBindingOverrides(controller, ctx);
    if (effectiveController.influence <= 0) continue;
    const constraints = collectRuntimeIKConstraints(effectiveController);
    const result = solveRuntimeIKController(
      effectiveController,
      worldTransforms,
      ctx.boneLengths,
    );

    for (const [boneId, angle] of result.solvedAngles) {
      const currentAngle = ctx.boneAngles[boneId] ?? boneLocalAngles.get(boneId) ?? 0;
      const unconstrainedLocalAngle = solvedWorldAngleToLocal(
        boneId,
        angle,
        result.solvedAngles,
        worldTransforms,
        boneParents,
      );
      const constraint = constraints.get(boneId);
      const localSolvedAngle = constraint
        ? clampRuntimeIKAngle(
            unconstrainedLocalAngle,
            constraint.minAngle,
            constraint.maxAngle,
          )
        : unconstrainedLocalAngle;
      ctx.boneAngles[boneId] =
        currentAngle * (1 - effectiveController.influence) +
        localSolvedAngle * effectiveController.influence;
    }
  }
}

function collectRuntimeIKConstraints(
  controller: IKController,
): Map<string, IKBoneConstraint> {
  return new Map(
    controller.boneChain.map((constraint) => [constraint.boneId, constraint]),
  );
}

function collectRuntimeBoneParents(
  layers: readonly LayerNode[],
): Map<string, string | null> {
  const parents = new Map<string, string | null>();
  const visit = (nodes: readonly LayerNode[]): void => {
    for (const node of nodes) {
      if (node.kind === "bone") {
        parents.set(node.id, node.parentBoneId ?? null);
      }
      if (node.children.length > 0) visit(node.children);
    }
  };
  visit(layers);
  return parents;
}

function collectRuntimeBoneLocalAngles(layers: readonly LayerNode[]): Map<string, number> {
  const angles = new Map<string, number>();
  const visit = (nodes: readonly LayerNode[]): void => {
    for (const node of nodes) {
      if (node.kind === "bone") {
        angles.set(node.id, node.bone.angle);
      }
      if (node.children.length > 0) visit(node.children);
    }
  };
  visit(layers);
  return angles;
}

function hasRuntimeBonePoseOverrides(ctx: RuntimeIKStepContext): boolean {
  return (
    Object.keys(ctx.boneAngles).length > 0 ||
    Object.keys(ctx.boneX ?? {}).length > 0 ||
    Object.keys(ctx.boneY ?? {}).length > 0 ||
    Object.keys(ctx.boneScaleX ?? {}).length > 0 ||
    Object.keys(ctx.boneScaleY ?? {}).length > 0
  );
}

function createRuntimeIKPoseLayers(
  ctx: RuntimeIKStepContext,
): readonly LayerNode[] {
  if (!hasRuntimeBonePoseOverrides(ctx)) return ctx.project.layers;
  return ctx.project.layers.map((layer) =>
    cloneRuntimeLayerWithBoneOverrides(layer, ctx),
  );
}

function cloneRuntimeLayerWithBoneOverrides(
  node: LayerNode,
  ctx: RuntimeIKStepContext,
): LayerNode {
  const children = node.children.map((child) =>
    cloneRuntimeLayerWithBoneOverrides(child, ctx),
  );
  if (node.kind !== "bone") {
    return { ...node, children } as LayerNode;
  }

  const next = { ...node, children, bone: { ...node.bone } };
  const x = ctx.boneX?.[node.id];
  if (x !== undefined) next.x = x;
  const y = ctx.boneY?.[node.id];
  if (y !== undefined) next.y = y;
  const angle = ctx.boneAngles[node.id];
  if (angle !== undefined) next.bone.angle = angle;
  const scaleX = ctx.boneScaleX?.[node.id];
  if (scaleX !== undefined) next.bone.scaleX = scaleX;
  const scaleY = ctx.boneScaleY?.[node.id];
  if (scaleY !== undefined) next.bone.scaleY = scaleY;
  return next;
}

function worldAngleOf(transform: readonly number[] | undefined): number {
  return transform ? Math.atan2(transform[1]!, transform[0]!) : 0;
}

function solvedWorldAngleToLocal(
  boneId: string,
  solvedWorldAngle: number,
  solvedWorldAngles: ReadonlyMap<string, number>,
  worldTransforms: ReadonlyMap<string, readonly number[]>,
  boneParents: ReadonlyMap<string, string | null>,
): number {
  const parentId = boneParents.get(boneId);
  if (!parentId) return normalizeRuntimeIKAngle(solvedWorldAngle);

  const parentWorldAngle =
    solvedWorldAngles.get(parentId) ?? worldAngleOf(worldTransforms.get(parentId));
  return normalizeRuntimeIKAngle(solvedWorldAngle - parentWorldAngle);
}

function applyControllerBindingOverrides(
  controller: IKController,
  ctx: RuntimeIKStepContext,
): IKController {
  const targetX = ctx.ikTargetX?.[controller.id];
  const targetY = ctx.ikTargetY?.[controller.id];
  const poleTargetX = ctx.ikPoleTargetX?.[controller.id];
  const poleTargetY = ctx.ikPoleTargetY?.[controller.id];
  const influence = ctx.ikInfluence?.[controller.id];

  if (
    targetX === undefined &&
    targetY === undefined &&
    poleTargetX === undefined &&
    poleTargetY === undefined &&
    influence === undefined
  ) {
    return controller;
  }

  return {
    ...controller,
    targetX: targetX ?? controller.targetX,
    targetY: targetY ?? controller.targetY,
    poleTargetX: poleTargetX ?? controller.poleTargetX,
    poleTargetY: poleTargetY ?? controller.poleTargetY,
    influence:
      influence === undefined ? controller.influence : Math.max(0, Math.min(1, influence)),
  };
}
