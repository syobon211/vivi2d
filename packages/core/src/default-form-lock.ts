import { FLOAT_EPSILON } from "./constants";
import type { ParameterDefinition } from "./types";

export function isDefaultFormActive(
  parameters: ParameterDefinition[],
  parameterValues: Record<string, number>,
): boolean {
  for (const param of parameters) {
    const current = parameterValues[param.id];
    if (current === undefined) continue;
    if (Math.abs(current - param.defaultValue) > FLOAT_EPSILON) {
      return false;
    }
  }
  return true;
}
