import { createPhysicsRuntimeState } from "@vivi2d/core/physics-engine";
import type {
  LipSyncConfig,
  PendulumConfig,
  PendulumState,
  PhysicsGroup,
  PhysicsInput,
  PhysicsOutput,
} from "@vivi2d/core/types";
import {
  addPendulum as addPendulumCommand,
  addPhysicsGroup as addPhysicsGroupCommand,
  addPhysicsInput as addPhysicsInputCommand,
  addPhysicsOutput as addPhysicsOutputCommand,
  removePendulum as removePendulumCommand,
  removePhysicsGroup as removePhysicsGroupCommand,
  removePhysicsInput as removePhysicsInputCommand,
  removePhysicsOutput as removePhysicsOutputCommand,
  setLipSyncConfig as setLipSyncConfigCommand,
  updatePendulum as updatePendulumCommand,
  updatePhysicsGroup as updatePhysicsGroupCommand,
} from "@vivi2d/editor-core/physics-command";
import { create } from "zustand";
import {
  applyHairStrandHelper,
  type HairStrandHelperApplyResult,
  type HairStrandHelperPresetId,
} from "@/lib/hair-strand-helper";
import { withStandardMiddleware } from "./_middleware";
import { useEditorStore } from "./editorStore";
import { mutateProject } from "./projectMutator";

interface PhysicsState {
  runtimeStates: Record<string, PendulumState[]>;

  previousParamValues: Record<string, number>;

  accumulators: Record<string, number>;

  isActive: boolean;
}

interface PhysicsActions {
  initialize: (groups: PhysicsGroup[]) => void;
  reset: () => void;
  setActive: (active: boolean) => void;
  snapshotParamValues: (values: Record<string, number>) => void;
  setAccumulator: (groupId: string, value: number) => void;

  addPhysicsGroup: (
    name: string,
    metadata?: Pick<
      PhysicsGroup,
      "managedTag" | "managedSignature" | "managedSourceFingerprint"
    >,
  ) => string;
  removePhysicsGroup: (groupId: string) => void;
  updatePhysicsGroup: (
    groupId: string,
    updates: Partial<
      Pick<
        PhysicsGroup,
        "name" | "enabled" | "gravityDirection" | "gravityStrength" | "wind"
      >
    >,
  ) => void;
  addPendulum: (groupId: string) => void;
  removePendulum: (groupId: string, index: number) => void;
  updatePendulum: (
    groupId: string,
    index: number,
    updates: Partial<PendulumConfig>,
  ) => void;
  addPhysicsInput: (groupId: string, input: PhysicsInput) => void;
  removePhysicsInput: (groupId: string, index: number) => void;
  addPhysicsOutput: (groupId: string, output: PhysicsOutput) => void;
  removePhysicsOutput: (groupId: string, index: number) => void;
  applyHairStrandHelper: (
    tipBoneId: string,
    presetId: HairStrandHelperPresetId,
  ) => HairStrandHelperApplyResult | { status: "rejected"; reason: "noProject" };

  setLipSyncConfig: (updates: Partial<LipSyncConfig>) => void;
}

export type PhysicsStore = PhysicsState & PhysicsActions;

function createZeroPendulumState(): PendulumState {
  return { angle: 0, angularVelocity: 0 };
}

export const usePhysicsStore = create<PhysicsStore>()(
  withStandardMiddleware<PhysicsStore>(
    (set) => ({
      runtimeStates: {},
      previousParamValues: {},
      accumulators: {},
      isActive: true,

      initialize: (groups) =>
        set(() => {
          const runtimeStates: Record<string, PendulumState[]> = {};
          const accumulators: Record<string, number> = {};
          for (const group of groups) {
            runtimeStates[group.id] = createPhysicsRuntimeState(group);
            accumulators[group.id] = 0;
          }
          return { runtimeStates, accumulators, previousParamValues: {} };
        }),

      reset: () =>
        set((s) => {
          const runtimeStates = { ...s.runtimeStates };
          for (const states of Object.values(runtimeStates)) {
            for (const state of states) {
              state.angle = 0;
              state.angularVelocity = 0;
            }
          }
          const accumulators: Record<string, number> = {};
          for (const key of Object.keys(s.accumulators)) {
            accumulators[key] = 0;
          }
          return { runtimeStates, accumulators, previousParamValues: {} };
        }),

      setActive: (active) => set({ isActive: active }),

      snapshotParamValues: (values) => set({ previousParamValues: { ...values } }),

      setAccumulator: (groupId, value) =>
        set((s) => ({
          accumulators: { ...s.accumulators, [groupId]: value },
        })),

      addPhysicsGroup: (name, metadata) => {
        const id = crypto.randomUUID();
        mutateProject((project) => {
          addPhysicsGroupCommand(project, name, metadata, () => id);
        });
        const group = useEditorStore
          .getState()
          .project?.physicsGroups.find((entry) => entry.id === id);
        if (group) {
          set((state) => ({
            runtimeStates: {
              ...state.runtimeStates,
              [id]: createPhysicsRuntimeState(group),
            },
            accumulators: { ...state.accumulators, [id]: 0 },
          }));
        }
        return id;
      },

      removePhysicsGroup: (groupId) => {
        let removed = false;
        mutateProject((project) => {
          removed = removePhysicsGroupCommand(project, groupId);
        });
        if (removed) {
          set((state) => {
            const runtimeStates = { ...state.runtimeStates };
            const accumulators = { ...state.accumulators };
            delete runtimeStates[groupId];
            delete accumulators[groupId];
            return { runtimeStates, accumulators };
          });
        }
      },

      updatePhysicsGroup: (groupId, updates) =>
        mutateProject((project) => {
          updatePhysicsGroupCommand(project, groupId, updates);
        }),

      addPendulum: (groupId) => {
        let added = false;
        mutateProject((project) => {
          added = addPendulumCommand(project, groupId);
        });
        if (added) {
          set((state) => ({
            runtimeStates: {
              ...state.runtimeStates,
              [groupId]: [
                ...(state.runtimeStates[groupId] ?? []),
                createZeroPendulumState(),
              ],
            },
          }));
        }
      },

      removePendulum: (groupId, index) => {
        let removed = false;
        mutateProject((project) => {
          removed = removePendulumCommand(project, groupId, index);
        });
        if (removed) {
          set((state) => {
            const current = state.runtimeStates[groupId] ?? [];
            return {
              runtimeStates: {
                ...state.runtimeStates,
                [groupId]: current.filter((_, entryIndex) => entryIndex !== index),
              },
            };
          });
        }
      },

      updatePendulum: (groupId, index, updates) =>
        mutateProject((project) => {
          updatePendulumCommand(project, groupId, index, updates);
        }),

      addPhysicsInput: (groupId, input) =>
        mutateProject((project) => {
          addPhysicsInputCommand(project, groupId, input);
        }),

      removePhysicsInput: (groupId, index) =>
        mutateProject((project) => {
          removePhysicsInputCommand(project, groupId, index);
        }),

      addPhysicsOutput: (groupId, output) =>
        mutateProject((project) => {
          addPhysicsOutputCommand(project, groupId, output);
        }),

      removePhysicsOutput: (groupId, index) =>
        mutateProject((project) => {
          removePhysicsOutputCommand(project, groupId, index);
        }),

      applyHairStrandHelper: (tipBoneId, presetId) => {
        const project = useEditorStore.getState().project;
        if (!project) {
          return { status: "rejected" as const, reason: "noProject" as const };
        }

        let result: HairStrandHelperApplyResult = {
          status: "rejected",
          reason: "boneNotFound",
        };

        mutateProject((draft) => {
          result = applyHairStrandHelper(draft, tipBoneId, presetId);
        }, `physics:hair-strand-helper:${tipBoneId}`);

        return result;
      },

      setLipSyncConfig: (updates) =>
        mutateProject((project) => {
          setLipSyncConfigCommand(project, updates);
        }),
    }),
    { name: "PhysicsStore", persistEnabled: false, immerEnabled: false },
  ),
);
