import type { ParameterDefinition } from "@vivi2d/core";

export interface RuntimeParameterDefaultsOptions {
  onInvalid?: (id: string) => never;
}

export function mergeRuntimeParameterDefaults(
  parameters: readonly ParameterDefinition[],
  overrides: Readonly<Record<string, number>>,
  options: RuntimeParameterDefaultsOptions = {},
): Record<string, number> {
  const merged: Record<string, number> = {};
  const definitions = new Map<string, ParameterDefinition>();
  for (const parameter of parameters) {
    definitions.set(parameter.id, parameter);
    merged[parameter.id] = parameter.defaultValue;
  }
  for (const [id, value] of Object.entries(overrides)) {
    const definition = definitions.get(id);
    if (!definition) continue;
    if (!Number.isFinite(value)) {
      options.onInvalid?.(id);
      continue;
    }
    merged[id] = Math.max(
      definition.minValue,
      Math.min(definition.maxValue, value),
    );
  }
  return merged;
}
