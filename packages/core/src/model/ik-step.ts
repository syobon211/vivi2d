import { computeBoneWorldTransforms } from "../bone-utils";
import { clampIKAngle, normalizeIKAngle, solveIKController } from "../ik-solver";
import type {
  IKBoneConstraint,
  IKController,
  LayerNode,
  ProjectData,
} from "../types";

export interface IKStepContext {
  project: ProjectData;
  boneLengths: Map<string, number>;
  boneAngles: Record<string, number>;
  boneX?: Record<string, number>;
  boneY?: Record<string, number>;
  boneScaleX?: Record<string, number>;
  boneScaleY?: Record<string, number>;
  ikTargetX?: Record<string, number>;
  ikTargetY?: Record<string, number>;
  ikPoleTargetX?: Record<string, number>;
  ikPoleTargetY?: Record<string, number>;
  ikInfluence?: Record<string, number>;
}

export function runIKStep(ctx: IKStepContext): void {
  const controllers = ctx.project.ikControllers;
  if (!controllers || controllers.length === 0) return;

  const boneParents = collectBoneParents(ctx.project.layers);
  const poseLayers = createIKPoseLayers(ctx);
  const worldTransforms = computeBoneWorldTransforms(poseLayers);
  const boneLocalAngles = collectBoneLocalAngles(poseLayers);

  for (const controller of controllers) {
    const effectiveController = applyControllerBindingOverrides(controller, ctx);
    if (effectiveController.influence <= 0) continue;
    const constraints = collectIKConstraints(effectiveController);
    const result = solveIKController(
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
        ? clampIKAngle(
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

function collectIKConstraints(
  controller: IKController,
): Map<string, IKBoneConstraint> {
  return new Map(
    controller.boneChain.map((constraint) => [constraint.boneId, constraint]),
  );
}

function collectBoneParents(layers: readonly LayerNode[]): Map<string, string | null> {
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

function collectBoneLocalAngles(layers: readonly LayerNode[]): Map<string, number> {
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

function hasBonePoseOverrides(ctx: IKStepContext): boolean {
  return (
    Object.keys(ctx.boneAngles).length > 0 ||
    Object.keys(ctx.boneX ?? {}).length > 0 ||
    Object.keys(ctx.boneY ?? {}).length > 0 ||
    Object.keys(ctx.boneScaleX ?? {}).length > 0 ||
    Object.keys(ctx.boneScaleY ?? {}).length > 0
  );
}

function createIKPoseLayers(ctx: IKStepContext): LayerNode[] {
  if (!hasBonePoseOverrides(ctx)) return ctx.project.layers;
  return ctx.project.layers.map((layer) => cloneLayerWithBoneOverrides(layer, ctx));
}

function cloneLayerWithBoneOverrides(
  node: LayerNode,
  ctx: IKStepContext,
): LayerNode {
  const children = node.children.map((child) =>
    cloneLayerWithBoneOverrides(child, ctx),
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
  if (!parentId) return normalizeIKAngle(solvedWorldAngle);

  const parentWorldAngle =
    solvedWorldAngles.get(parentId) ?? worldAngleOf(worldTransforms.get(parentId));
  return normalizeIKAngle(solvedWorldAngle - parentWorldAngle);
}

function applyControllerBindingOverrides(
  controller: IKController,
  ctx: IKStepContext,
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
      influence === undefined
        ? controller.influence
        : Math.max(0, Math.min(1, influence)),
  };
}
