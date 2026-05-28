import type {
  AnimationState,
  StateTransition,
  TransitionCondition,
} from "@vivi2d/core/types";
import {
  addCondition as addConditionCommand,
  addState as addStateCommand,
  addStateMachine as addStateMachineCommand,
  addTransition as addTransitionCommand,
  removeCondition as removeConditionCommand,
  removeState as removeStateCommand,
  removeStateMachine as removeStateMachineCommand,
  removeTransition as removeTransitionCommand,
  renameStateMachine as renameStateMachineCommand,
  setInitialState as setInitialStateCommand,
  toggleStateMachine as toggleStateMachineCommand,
  updateCondition as updateConditionCommand,
  updateState as updateStateCommand,
  updateTransition as updateTransitionCommand,
} from "@vivi2d/editor-core/state-machine-command";
import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";
import { mutateProject } from "./projectMutator";

interface StateMachineActions {
  addStateMachine: (name: string) => string;

  removeStateMachine: (id: string) => void;

  toggleStateMachine: (id: string) => void;

  renameStateMachine: (id: string, name: string) => void;

  setInitialState: (machineId: string, stateId: string) => void;

  addState: (machineId: string, name: string, clipId?: string, loop?: boolean) => string;

  removeState: (machineId: string, stateId: string) => void;

  updateState: (
    machineId: string,
    stateId: string,
    updates: Partial<Omit<AnimationState, "id">>,
  ) => void;

  addTransition: (machineId: string, fromStateId: string, toStateId: string) => string;

  removeTransition: (machineId: string, transitionId: string) => void;

  updateTransition: (
    machineId: string,
    transitionId: string,
    updates: Partial<Omit<StateTransition, "id" | "conditions">>,
  ) => void;

  addCondition: (
    machineId: string,
    transitionId: string,
    condition: TransitionCondition,
  ) => void;

  removeCondition: (machineId: string, transitionId: string, index: number) => void;

  updateCondition: (
    machineId: string,
    transitionId: string,
    index: number,
    updates: Partial<TransitionCondition>,
  ) => void;
}

export const useStateMachineStore = create<StateMachineActions>()(
  withStandardMiddleware<StateMachineActions>(
    () => ({
      addStateMachine: (name) => {
        const machineId = crypto.randomUUID();
        const initialStateId = crypto.randomUUID();
        mutateProject((project) => {
          const ids = [machineId, initialStateId];
          addStateMachineCommand(project, name, () => ids.shift() ?? crypto.randomUUID());
        });
        return machineId;
      },

      removeStateMachine: (id) =>
        mutateProject((project) => {
          removeStateMachineCommand(project, id);
        }),

      toggleStateMachine: (id) =>
        mutateProject((project) => {
          toggleStateMachineCommand(project, id);
        }),

      renameStateMachine: (id, name) =>
        mutateProject((project) => {
          renameStateMachineCommand(project, id, name);
        }),

      setInitialState: (machineId, stateId) =>
        mutateProject((project) => {
          setInitialStateCommand(project, machineId, stateId);
        }),

      addState: (machineId, name, clipId, loop = false) => {
        const stateId = crypto.randomUUID();
        let createdId = "";
        mutateProject((project) => {
          createdId = addStateCommand(project, machineId, name, clipId, loop, () => stateId);
        });
        return createdId;
      },

      removeState: (machineId, stateId) =>
        mutateProject((project) => {
          removeStateCommand(project, machineId, stateId);
        }),

      updateState: (machineId, stateId, updates) =>
        mutateProject((project) => {
          updateStateCommand(project, machineId, stateId, updates);
        }),

      addTransition: (machineId, fromStateId, toStateId) => {
        const transitionId = crypto.randomUUID();
        let createdId = "";
        mutateProject((project) => {
          createdId = addTransitionCommand(
            project,
            machineId,
            fromStateId,
            toStateId,
            () => transitionId,
          );
        });
        return createdId;
      },

      removeTransition: (machineId, transitionId) =>
        mutateProject((project) => {
          removeTransitionCommand(project, machineId, transitionId);
        }),

      updateTransition: (machineId, transitionId, updates) =>
        mutateProject((project) => {
          updateTransitionCommand(project, machineId, transitionId, updates);
        }),

      addCondition: (machineId, transitionId, condition) =>
        mutateProject((project) => {
          addConditionCommand(project, machineId, transitionId, condition);
        }),

      removeCondition: (machineId, transitionId, index) =>
        mutateProject((project) => {
          removeConditionCommand(project, machineId, transitionId, index);
        }),

      updateCondition: (machineId, transitionId, index, updates) =>
        mutateProject((project) => {
          updateConditionCommand(project, machineId, transitionId, index, updates);
        }),
    }),
    { name: "StateMachineStore", persistEnabled: false },
  ),
);
