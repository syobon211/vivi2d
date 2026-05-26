import type { ProjectData } from "@vivi2d/core/types";

export interface AddParameterDefinitionInput {
  name: string;
  minValue: number;
  maxValue: number;
  defaultValue: number;
  group?: string;
}

export interface UpdateParameterDefinitionInput {
  name?: string;
  minValue?: number;
  maxValue?: number;
  defaultValue?: number;
}

const defaultCreateId = () => crypto.randomUUID();

export function addParameterDefinition(
  project: ProjectData,
  input: AddParameterDefinitionInput,
  createId: () => string = defaultCreateId,
): string {
  const id = createId();
  project.parameters.push({
    id,
    name: input.name,
    minValue: input.minValue,
    maxValue: input.maxValue,
    defaultValue: input.defaultValue,
    group: input.group || undefined,
  });
  return id;
}

export function removeParameterDefinition(
  project: ProjectData,
  parameterId: string,
): boolean {
  const target = project.parameters.find((parameter) => parameter.id === parameterId);
  if (target?.pairedParameterId) {
    const paired = project.parameters.find(
      (parameter) => parameter.id === target.pairedParameterId,
    );
    if (paired) paired.pairedParameterId = undefined;
  }
  if (project.parameterBindings) {
    project.parameterBindings = project.parameterBindings.filter(
      (binding) => binding.parameterId !== parameterId,
    );
  }
  const beforeCount = project.parameters.length;
  project.parameters = project.parameters.filter(
    (parameter) => parameter.id !== parameterId,
  );
  return project.parameters.length !== beforeCount;
}

export function updateParameterDefinition(
  project: ProjectData,
  parameterId: string,
  updates: UpdateParameterDefinitionInput,
): boolean {
  const parameter = project.parameters.find((entry) => entry.id === parameterId);
  if (!parameter) return false;
  if (updates.name !== undefined) parameter.name = updates.name;
  if (updates.minValue !== undefined) parameter.minValue = updates.minValue;
  if (updates.maxValue !== undefined) parameter.maxValue = updates.maxValue;
  if (updates.defaultValue !== undefined) {
    parameter.defaultValue = updates.defaultValue;
  }
  return true;
}

export function setParameterDefinitionGroup(
  project: ProjectData,
  parameterId: string,
  group: string | undefined,
): boolean {
  const parameter = project.parameters.find((entry) => entry.id === parameterId);
  if (!parameter) return false;
  parameter.group = group || undefined;
  return true;
}

export function pairParameterDefinitions(
  project: ProjectData,
  parameterAId: string,
  parameterBId: string,
): boolean {
  const parameterA = project.parameters.find((entry) => entry.id === parameterAId);
  const parameterB = project.parameters.find((entry) => entry.id === parameterBId);
  if (!parameterA || !parameterB || parameterAId === parameterBId) return false;
  for (const parameter of project.parameters) {
    if (
      parameter.pairedParameterId === parameterAId ||
      parameter.pairedParameterId === parameterBId
    ) {
      parameter.pairedParameterId = undefined;
    }
  }
  parameterA.pairedParameterId = parameterBId;
  parameterB.pairedParameterId = parameterAId;
  return true;
}

export function unpairParameterDefinition(
  project: ProjectData,
  parameterId: string,
): boolean {
  const parameter = project.parameters.find((entry) => entry.id === parameterId);
  if (!parameter?.pairedParameterId) return false;
  const paired = project.parameters.find(
    (entry) => entry.id === parameter.pairedParameterId,
  );
  parameter.pairedParameterId = undefined;
  if (paired) paired.pairedParameterId = undefined;
  return true;
}
