import type { ProjectData } from "@vivi2d/core/types";

export type ExpressionPresetValues = Record<string, number>;

export interface CreateExpressionPresetInput {
  name: string;
  values: ExpressionPresetValues;
}

const defaultCreateId = () => crypto.randomUUID();

function ensureExpressionPresets(project: ProjectData) {
  if (!project.expressionPresets) project.expressionPresets = [];
  return project.expressionPresets;
}

function cloneFiniteValues(values: ExpressionPresetValues): ExpressionPresetValues {
  const next: ExpressionPresetValues = {};
  for (const [parameterId, value] of Object.entries(values)) {
    if (Number.isFinite(value)) next[parameterId] = value;
  }
  return next;
}

function normalizeHotkey(hotkey: number | undefined): number | undefined {
  if (hotkey === undefined) return undefined;
  return Number.isFinite(hotkey) ? hotkey : undefined;
}

export function createExpressionPreset(
  project: ProjectData,
  input: CreateExpressionPresetInput,
  createId: () => string = defaultCreateId,
): string {
  const id = createId();
  ensureExpressionPresets(project).push({
    id,
    name: input.name,
    values: cloneFiniteValues(input.values),
  });
  return id;
}

export function getExpressionPresetValues(
  project: ProjectData,
  presetId: string,
): ExpressionPresetValues | null {
  const preset = project.expressionPresets?.find((entry) => entry.id === presetId);
  if (!preset) return null;
  return { ...preset.values };
}

export function getExpressionPresetValuesByHotkey(
  project: ProjectData,
  hotkey: number,
): ExpressionPresetValues | null {
  const preset = project.expressionPresets?.find((entry) => entry.hotkey === hotkey);
  if (!preset) return null;
  return { ...preset.values };
}

export function removeExpressionPreset(
  project: ProjectData,
  presetId: string,
): boolean {
  if (!project.expressionPresets) return false;
  const beforeCount = project.expressionPresets.length;
  project.expressionPresets = project.expressionPresets.filter(
    (preset) => preset.id !== presetId,
  );
  return project.expressionPresets.length !== beforeCount;
}

export function renameExpressionPreset(
  project: ProjectData,
  presetId: string,
  name: string,
): boolean {
  const preset = project.expressionPresets?.find((entry) => entry.id === presetId);
  if (!preset) return false;
  preset.name = name;
  return true;
}

export function updateExpressionPresetValues(
  project: ProjectData,
  presetId: string,
  values: ExpressionPresetValues,
): boolean {
  const preset = project.expressionPresets?.find((entry) => entry.id === presetId);
  if (!preset) return false;
  preset.values = cloneFiniteValues(values);
  return true;
}

export function setExpressionPresetHotkey(
  project: ProjectData,
  presetId: string,
  hotkey: number | undefined,
): boolean {
  const nextHotkey = normalizeHotkey(hotkey);
  const presets = project.expressionPresets;
  if (!presets) return false;
  const preset = presets.find((entry) => entry.id === presetId);
  if (!preset) return false;
  if (nextHotkey !== undefined) {
    for (const entry of presets) {
      if (entry.id !== presetId && entry.hotkey === nextHotkey) {
        entry.hotkey = undefined;
      }
    }
  }
  preset.hotkey = nextHotkey;
  return true;
}
