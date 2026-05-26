import type {
  BindingTarget,
  ParameterBinding,
  ParameterBindingPoint,
  ProjectData,
} from "@vivi2d/core/types";

const defaultCreateId = () => crypto.randomUUID();

function ensureBindings(project: {
  parameterBindings?: ParameterBinding[];
}): ParameterBinding[] {
  if (!project.parameterBindings) {
    project.parameterBindings = [];
  }
  return project.parameterBindings;
}

export function canCreateParameterBindingTarget(target: BindingTarget): boolean {
  return target.type === "bone" || target.type === "ikController";
}

export function addParameterBinding(
  project: ProjectData,
  parameterId: string,
  target: BindingTarget,
  createId: () => string = defaultCreateId,
): string {
  if (!canCreateParameterBindingTarget(target)) return "";
  const id = createId();
  ensureBindings(project).push({
    id,
    parameterId,
    target,
    bindingPoints: [],
  });
  return id;
}

export function removeParameterBinding(
  project: ProjectData,
  bindingId: string,
): boolean {
  const bindings = ensureBindings(project);
  const index = bindings.findIndex((binding) => binding.id === bindingId);
  if (index === -1) return false;
  bindings.splice(index, 1);
  return true;
}

export function removeParameterBindingsByParameter(
  project: ProjectData,
  parameterId: string,
): number {
  const bindings = ensureBindings(project);
  const beforeCount = bindings.length;
  project.parameterBindings = bindings.filter(
    (binding) => binding.parameterId !== parameterId,
  );
  return beforeCount - project.parameterBindings.length;
}

export function setParameterBindingPoint(
  project: ProjectData,
  bindingId: string,
  paramValue: number,
  targetValue: number,
): boolean {
  const binding = ensureBindings(project).find((entry) => entry.id === bindingId);
  if (!binding) return false;

  const existing = binding.bindingPoints.find(
    (point) => point.paramValue === paramValue,
  );
  if (existing) {
    existing.targetValue = targetValue;
  } else {
    binding.bindingPoints.push({ paramValue, targetValue });
  }

  binding.bindingPoints.sort((a, b) => a.paramValue - b.paramValue);
  return true;
}

export function removeParameterBindingPoint(
  project: ProjectData,
  bindingId: string,
  paramValue: number,
): boolean {
  const binding = ensureBindings(project).find((entry) => entry.id === bindingId);
  if (!binding) return false;
  const beforeCount = binding.bindingPoints.length;
  binding.bindingPoints = binding.bindingPoints.filter(
    (point) => point.paramValue !== paramValue,
  );
  return binding.bindingPoints.length !== beforeCount;
}

export function getParameterBindingPoints(
  project: ProjectData,
  bindingId: string,
): ParameterBindingPoint[] | null {
  const binding = (project.parameterBindings ?? []).find(
    (entry) => entry.id === bindingId,
  );
  if (!binding) return null;
  return binding.bindingPoints.map((point) => ({ ...point }));
}

export function replaceParameterBindingPoints(
  project: ProjectData,
  bindingId: string,
  bindingPoints: readonly ParameterBindingPoint[],
): boolean {
  const binding = ensureBindings(project).find((entry) => entry.id === bindingId);
  if (!binding) return false;
  binding.bindingPoints = bindingPoints.map((point) => ({ ...point }));
  binding.bindingPoints.sort((a, b) => a.paramValue - b.paramValue);
  return true;
}

export function replaceParameterBindingPointsMirrored(
  project: ProjectData,
  bindingId: string,
  bindingPoints: readonly ParameterBindingPoint[],
): boolean {
  return replaceParameterBindingPoints(
    project,
    bindingId,
    bindingPoints.map((point) => ({
      paramValue: -point.paramValue,
      targetValue: -point.targetValue,
    })),
  );
}

export function blendParameterBindingPoints(
  project: ProjectData,
  bindingId: string,
  bindingPoints: readonly ParameterBindingPoint[],
  factor: number,
): boolean {
  const binding = ensureBindings(project).find((entry) => entry.id === bindingId);
  if (!binding) return false;
  const existingMap = new Map(
    binding.bindingPoints.map((point) => [point.paramValue, point.targetValue]),
  );
  const clipMap = new Map(
    bindingPoints.map((point) => [point.paramValue, point.targetValue]),
  );
  const allParamValues = new Set([...existingMap.keys(), ...clipMap.keys()]);
  binding.bindingPoints = [...allParamValues].map((paramValue) => {
    const existing = existingMap.get(paramValue) ?? 0;
    const clip = clipMap.get(paramValue) ?? 0;
    return {
      paramValue,
      targetValue: existing * (1 - factor) + clip * factor,
    };
  });
  binding.bindingPoints.sort((a, b) => a.paramValue - b.paramValue);
  return true;
}
