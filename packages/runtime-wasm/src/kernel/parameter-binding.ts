import type { ParameterBinding, ParameterBindingPoint } from "@vivi2d/core";

export function interpolateRuntimeBindingPoints(
  bindingPoints: readonly ParameterBindingPoint[],
  parameterValue: number,
  defaultValue: number,
): number {
  if (bindingPoints.length === 0) return defaultValue;
  if (bindingPoints.length === 1) return bindingPoints[0]!.targetValue;

  const first = bindingPoints[0]!;
  const last = bindingPoints[bindingPoints.length - 1]!;
  if (parameterValue <= first.paramValue) return first.targetValue;
  if (parameterValue >= last.paramValue) return last.targetValue;

  for (let index = 0; index < bindingPoints.length - 1; index += 1) {
    const current = bindingPoints[index]!;
    const next = bindingPoints[index + 1]!;
    if (parameterValue >= current.paramValue && parameterValue <= next.paramValue) {
      const t =
        (parameterValue - current.paramValue) /
        (next.paramValue - current.paramValue);
      return current.targetValue + (next.targetValue - current.targetValue) * t;
    }
  }

  return defaultValue;
}

export function evaluateRuntimeBindingsAdditive(
  bindings: readonly ParameterBinding[],
  parameterValues: Record<string, number>,
  defaultValue: number,
): number {
  let sum = 0;
  for (const binding of bindings) {
    const parameterValue = parameterValues[binding.parameterId] ?? 0;
    const evaluated = interpolateRuntimeBindingPoints(
      binding.bindingPoints,
      parameterValue,
      defaultValue,
    );
    sum += evaluated - defaultValue;
  }
  return defaultValue + sum;
}
