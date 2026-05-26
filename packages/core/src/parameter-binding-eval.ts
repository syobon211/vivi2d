import type { ParameterBinding, ParameterBindingPoint } from "./types";

export function interpolateBindingPoints(
  bindingPoints: ParameterBindingPoint[],
  paramValue: number,
  defaultValue: number,
): number {
  if (bindingPoints.length === 0) return defaultValue;
  if (bindingPoints.length === 1) return bindingPoints[0]!.targetValue;

  const first = bindingPoints[0]!;
  const last = bindingPoints[bindingPoints.length - 1]!;

  if (paramValue <= first.paramValue) return first.targetValue;
  if (paramValue >= last.paramValue) return last.targetValue;

  for (let i = 0; i < bindingPoints.length - 1; i++) {
    const a = bindingPoints[i]!;
    const b = bindingPoints[i + 1]!;
    if (paramValue >= a.paramValue && paramValue <= b.paramValue) {
      const t = (paramValue - a.paramValue) / (b.paramValue - a.paramValue);
      return a.targetValue + (b.targetValue - a.targetValue) * t;
    }
  }

  return defaultValue;
}

export function evaluateBindingsAdditive(
  bindings: ParameterBinding[],
  parameterValues: Record<string, number>,
  defaultValue: number,
): number {
  let sum = 0;
  for (const binding of bindings) {
    const paramValue = parameterValues[binding.parameterId] ?? 0;
    const evaluated = interpolateBindingPoints(
      binding.bindingPoints,
      paramValue,
      defaultValue,
    );
    sum += evaluated - defaultValue;
  }
  return defaultValue + sum;
}
