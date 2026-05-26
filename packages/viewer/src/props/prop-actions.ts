import type { ViviAction } from "../actions/action-types";

export function createPropVisibilityAction(
  propId: string,
  visible: boolean,
): ViviAction {
  return {
    id: `prop-visible-${propId}-${visible ? "on" : "off"}`,
    name: visible ? "Show prop" : "Hide prop",
    kind: "propVisibility",
    enabled: true,
    payload: { propId, visible },
    queuePolicy: "drop",
    source: "builtIn",
  };
}

export function createPropTransformAction(
  propId: string,
  transform: Record<string, number>,
): ViviAction {
  return {
    id: `prop-transform-${propId}`,
    name: "Transform prop",
    kind: "propTransform",
    enabled: true,
    payload: { propId, transform },
    queuePolicy: "replace",
    source: "builtIn",
  };
}
