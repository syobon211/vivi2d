import type { ViviProp, ViviPropAnchor, ViviPropTransform } from "./prop-types";

export interface PropAnchorContext {
  modelRoot?: Partial<ViviPropTransform>;
  bones?: Record<string, Partial<ViviPropTransform>>;
  layers?: Record<string, Partial<ViviPropTransform>>;
}

const IDENTITY: ViviPropTransform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
};

function mergeTransform(
  base: Partial<ViviPropTransform> | undefined,
  anchor: ViviPropAnchor,
): ViviPropTransform {
  return {
    x: (base?.x ?? 0) + anchor.offsetX,
    y: (base?.y ?? 0) + anchor.offsetY,
    scaleX: 1 + ((base?.scaleX ?? 1) - 1) * anchor.scaleWeight,
    scaleY: 1 + ((base?.scaleY ?? 1) - 1) * anchor.scaleWeight,
    rotation: (base?.rotation ?? 0) * anchor.rotationWeight,
  };
}

export function resolvePropAnchorTransform(
  prop: ViviProp,
  context: PropAnchorContext,
): ViviPropTransform {
  const anchor = prop.anchor;
  if (!anchor || anchor.target.kind === "screen") return prop.transform;

  let anchored = IDENTITY;
  if (anchor.target.kind === "modelRoot") {
    anchored = mergeTransform(context.modelRoot, anchor);
  } else if (anchor.target.kind === "bone") {
    anchored = mergeTransform(context.bones?.[anchor.target.boneId], anchor);
  } else if (anchor.target.kind === "layer") {
    anchored = mergeTransform(context.layers?.[anchor.target.layerId], anchor);
  }

  return {
    ...prop.transform,
    x: prop.transform.x + anchored.x,
    y: prop.transform.y + anchored.y,
    scaleX: prop.transform.scaleX * anchored.scaleX,
    scaleY: prop.transform.scaleY * anchored.scaleY,
    rotation: prop.transform.rotation + anchored.rotation,
  };
}
