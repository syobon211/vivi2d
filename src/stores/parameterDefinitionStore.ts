import {
  addParameterDefinition,
  pairParameterDefinitions,
  removeParameterDefinition,
  setParameterDefinitionGroup,
  unpairParameterDefinition,
  updateParameterDefinition,
} from "@vivi2d/editor-core/parameter-definition-command";
import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";
import { mutateProject } from "./projectMutator";

interface ParameterDefinitionActions {
  addParameter: (
    name: string,
    minValue: number,
    maxValue: number,
    defaultValue: number,
    group?: string,
  ) => void;
  removeParameter: (parameterId: string) => void;
  updateParameter: (
    parameterId: string,
    updates: {
      name?: string;
      minValue?: number;
      maxValue?: number;
      defaultValue?: number;
    },
  ) => void;

  setParameterGroup: (parameterId: string, group: string | undefined) => void;

  pairParameters: (paramAId: string, paramBId: string) => void;

  unpairParameters: (parameterId: string) => void;
}

export const useParameterDefinitionStore = create<ParameterDefinitionActions>()(
  withStandardMiddleware<ParameterDefinitionActions>(
    () => ({
      addParameter: (name, minValue, maxValue, defaultValue, group) =>
        mutateProject((project) => {
          addParameterDefinition(project, {
            name,
            minValue,
            maxValue,
            defaultValue,
            group: group || undefined,
          });
        }),

      removeParameter: (parameterId) =>
        mutateProject((project) => {
          removeParameterDefinition(project, parameterId);
        }),

      updateParameter: (parameterId, updates) =>
        mutateProject((project) => {
          updateParameterDefinition(project, parameterId, updates);
        }),

      setParameterGroup: (parameterId, group) =>
        mutateProject((project) => {
          setParameterDefinitionGroup(project, parameterId, group);
        }),

      pairParameters: (paramAId, paramBId) =>
        mutateProject((project) => {
          pairParameterDefinitions(project, paramAId, paramBId);
        }),

      unpairParameters: (parameterId) =>
        mutateProject((project) => {
          unpairParameterDefinition(project, parameterId);
        }),
    }),
    { name: "ParameterDefinitionStore", persistEnabled: false },
  ),
);
