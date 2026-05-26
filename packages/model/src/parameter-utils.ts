import type { ParameterDefinition } from "./types";

export interface MergeParameterDefaultsOptions {
  allowUnknown?: boolean;
  clampKnown?: boolean;
  rejectInvalid?: boolean;
}

export interface ClampFiniteNumberOptions {
  label: string;
  max: number;
  min: number;
}

export function clampFiniteNumber(
  value: number,
  options: ClampFiniteNumberOptions,
): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${options.label} must be finite`);
  }
  return Math.max(options.min, Math.min(options.max, value));
}

export function mergeParameterDefaults(
  parameters: readonly ParameterDefinition[],
  overrides: Readonly<Record<string, number>>,
  options: MergeParameterDefaultsOptions = {},
): Record<string, number> {
  const merged: Record<string, number> = {};
  const definitions = new Map<string, ParameterDefinition>();
  const allowUnknown = options.allowUnknown ?? true;
  const clampKnown = options.clampKnown ?? false;
  for (const param of parameters) {
    definitions.set(param.id, param);
    merged[param.id] = param.defaultValue;
  }
  for (const [id, value] of Object.entries(overrides)) {
    const definition = definitions.get(id);
    if (!definition) {
      if (allowUnknown) merged[id] = value;
      continue;
    }
    if (!Number.isFinite(value)) {
      if (options.rejectInvalid) {
        throw new TypeError(`initial parameter must be finite: ${id}`);
      }
      merged[id] = value;
      continue;
    }
    merged[id] = clampKnown
      ? Math.max(definition.minValue, Math.min(definition.maxValue, value))
      : value;
  }
  return merged;
}
