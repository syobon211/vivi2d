import type { NodeKind, ParameterDefinition } from "@vivi2d/core/types";
import { t } from "./i18n";

export function formatParamValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function nodeKindLabel(kind: NodeKind): string {
  switch (kind) {
    case "viviMesh":
      return t("nodeKind.viviMesh");
    case "group":
      return t("nodeKind.group");
    case "bone":
      return t("nodeKind.bone");
    case "artPath":
      return t("nodeKind.artPath");
    default:
      return kind;
  }
}

export function getParameterStep(param: ParameterDefinition): number {
  const range = param.maxValue - param.minValue;
  if (range <= 2) return 0.01;
  if (range <= 10) return 0.1;
  return 1;
}
