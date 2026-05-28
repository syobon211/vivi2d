import { computeBoneLocalTransform, transformPoint } from "@vivi2d/core/bone-utils";
import { BONE_OVERLAY, COLLIDER_OVERLAY } from "@vivi2d/core/constants";
import { worldToScreen } from "@vivi2d/core/coord-utils";
import type {
  BoneNode,
  ColliderConfig,
  IKController,
  LayerNode,
} from "@vivi2d/core/types";
import { isBone } from "@vivi2d/core/types";

const IK_TARGET_RADIUS = 8;
const IK_TARGET_COLOR = 0xff6644;
const IK_POLE_COLOR = 0x44aaff;

export interface SvgOverlayHandle {
  id: string;
  cx: number;
  cy: number;
  radius: number;
  fill: string;
}

export interface SvgRectColliderOverlay {
  kind: "rect";
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  fill: string;
  opacity: number;
  strokeWidth: number;
  handles: SvgOverlayHandle[];
}

export interface SvgCircleColliderOverlay {
  kind: "circle";
  id: string;
  cx: number;
  cy: number;
  radius: number;
  stroke: string;
  fill: string;
  opacity: number;
  strokeWidth: number;
  handles: SvgOverlayHandle[];
}

export type SvgColliderOverlay = SvgRectColliderOverlay | SvgCircleColliderOverlay;

export interface SvgIKOverlay {
  id: string;
  targetX: number;
  targetY: number;
  targetRadius: number;
  targetFill: string;
  targetStroke: string;
  poleTarget?: {
    x: number;
    y: number;
    radius: number;
    fill: string;
    stroke: string;
  };
}

export interface SvgBoneOverlay {
  id: string;
  pivotX: number;
  pivotY: number;
  tipX: number;
  tipY: number;
  color: string;
  armWidth: number;
  pivotRadius: number;
  tipRadius: number;
}

export function numberToCssHex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export function buildColliderSvgOverlays(
  colliders: readonly ColliderConfig[],
  selectedColliderId: string | null,
  zoom: number,
  panX: number,
  panY: number,
): SvgColliderOverlay[] {
  const overlays: SvgColliderOverlay[] = [];

  for (const collider of colliders) {
    if (collider.shape.type === "mesh") {
      continue;
    }

    const stroke = numberToCssHex(
      collider.id === selectedColliderId
        ? COLLIDER_OVERLAY.SELECTED_COLOR
        : COLLIDER_OVERLAY.STROKE_COLOR,
    );
    const fill = stroke;
    const opacity = collider.enabled ? 1 : COLLIDER_OVERLAY.DISABLED_ALPHA;
    const handleFill = numberToCssHex(COLLIDER_OVERLAY.HANDLE_COLOR);

    if (collider.shape.type === "rectangle") {
      const topLeft = worldToScreen(collider.shape.x, collider.shape.y, zoom, panX, panY);
      const bottomRight = worldToScreen(
        collider.shape.x + collider.shape.width,
        collider.shape.y + collider.shape.height,
        zoom,
        panX,
        panY,
      );
      const handles =
        collider.id === selectedColliderId && collider.enabled
          ? [
              {
                id: "tl",
                cx: topLeft.sx,
                cy: topLeft.sy,
                radius: COLLIDER_OVERLAY.HANDLE_RADIUS,
              },
              {
                id: "tr",
                cx: bottomRight.sx,
                cy: topLeft.sy,
                radius: COLLIDER_OVERLAY.HANDLE_RADIUS,
              },
              {
                id: "bl",
                cx: topLeft.sx,
                cy: bottomRight.sy,
                radius: COLLIDER_OVERLAY.HANDLE_RADIUS,
              },
              {
                id: "br",
                cx: bottomRight.sx,
                cy: bottomRight.sy,
                radius: COLLIDER_OVERLAY.HANDLE_RADIUS,
              },
            ].map((handle) => ({ ...handle, fill: handleFill }))
          : [];

      overlays.push({
        kind: "rect",
        id: collider.id,
        x: topLeft.sx,
        y: topLeft.sy,
        width: bottomRight.sx - topLeft.sx,
        height: bottomRight.sy - topLeft.sy,
        stroke,
        fill,
        opacity,
        strokeWidth: COLLIDER_OVERLAY.STROKE_WIDTH,
        handles,
      });
      continue;
    }

    const center = worldToScreen(collider.shape.x, collider.shape.y, zoom, panX, panY);
    const handles =
      collider.id === selectedColliderId && collider.enabled
        ? [
            {
              id: "radius",
              cx: center.sx + collider.shape.radius * zoom,
              cy: center.sy,
              radius: COLLIDER_OVERLAY.HANDLE_RADIUS,
              fill: handleFill,
            },
          ]
        : [];

    overlays.push({
      kind: "circle",
      id: collider.id,
      cx: center.sx,
      cy: center.sy,
      radius: collider.shape.radius * zoom,
      stroke,
      fill,
      opacity,
      strokeWidth: COLLIDER_OVERLAY.STROKE_WIDTH,
      handles,
    });
  }

  return overlays;
}

export function buildIkSvgOverlays(
  controllers: readonly IKController[],
  runtimeTargets: ReadonlyMap<string, { x: number; y: number }>,
  zoom: number,
  panX: number,
  panY: number,
): SvgIKOverlay[] {
  return controllers.map((controller) => {
    const runtimeTarget = runtimeTargets.get(controller.id);
    const tx = runtimeTarget ? runtimeTarget.x : controller.targetX;
    const ty = runtimeTarget ? runtimeTarget.y : controller.targetY;
    const target = worldToScreen(tx, ty, zoom, panX, panY);

    const poleTarget =
      controller.poleTargetX !== undefined && controller.poleTargetY !== undefined
        ? worldToScreen(controller.poleTargetX, controller.poleTargetY, zoom, panX, panY)
        : null;

    return {
      id: controller.id,
      targetX: target.sx,
      targetY: target.sy,
      targetRadius: IK_TARGET_RADIUS,
      targetFill: numberToCssHex(IK_TARGET_COLOR),
      targetStroke: numberToCssHex(IK_TARGET_COLOR),
      poleTarget: poleTarget
        ? {
            x: poleTarget.sx,
            y: poleTarget.sy,
            radius: 5,
            fill: numberToCssHex(IK_POLE_COLOR),
            stroke: numberToCssHex(IK_POLE_COLOR),
          }
        : undefined,
    };
  });
}

export function buildBoneSvgOverlays(
  layers: readonly LayerNode[],
  selectedLayerId: string | null,
  zoom: number,
  panX: number,
  panY: number,
): SvgBoneOverlay[] {
  const overlays: SvgBoneOverlay[] = [];
  const visit = (nodes: readonly LayerNode[]) => {
    for (const node of nodes) {
      if (isBone(node)) {
        const pivot = worldToScreen(node.x, node.y, zoom, panX, panY);
        const tipWorld = getBoneTip(node);
        const tip = worldToScreen(tipWorld[0], tipWorld[1], zoom, panX, panY);
        overlays.push({
          id: node.id,
          pivotX: pivot.sx,
          pivotY: pivot.sy,
          tipX: tip.sx,
          tipY: tip.sy,
          color: numberToCssHex(
            node.id === selectedLayerId
              ? BONE_OVERLAY.SELECTED_COLOR
              : BONE_OVERLAY.ARM_COLOR,
          ),
          armWidth: BONE_OVERLAY.ARM_WIDTH,
          pivotRadius: BONE_OVERLAY.PIVOT_RADIUS,
          tipRadius: BONE_OVERLAY.TIP_RADIUS,
        });
      }
      if (node.children.length > 0) {
        visit(node.children);
      }
    }
  };
  visit(layers);
  return overlays;
}

function getBoneTip(bone: BoneNode): [number, number] {
  const local = computeBoneLocalTransform(bone);
  return transformPoint(local, bone.bone.length, 0);
}
