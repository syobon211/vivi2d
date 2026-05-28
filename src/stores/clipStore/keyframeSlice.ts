import type { EasingPreset } from "@vivi2d/core/constants";
import type { BonePropertyType, InterpolationType } from "@vivi2d/core/types";
import {
  addBoneKeyframe as addBoneKeyframeCommand,
  addImageSequenceEntry as addImageSequenceEntryCommand,
  addKeyframe as addKeyframeCommand,
  applyAnimationRetargetPlan as applyAnimationRetargetPlanCommand,
  applyEasingPreset as applyEasingPresetCommand,
  applyIdleSynthPlan as applyIdleSynthPlanCommand,
  applyMotionAssistImportPlan as applyMotionAssistImportPlanCommand,
  applyMotionPreset as applyMotionPresetCommand,
  removeBoneKeyframe as removeBoneKeyframeCommand,
  removeImageSequenceEntry as removeImageSequenceEntryCommand,
  removeKeyframe as removeKeyframeCommand,
  updateKeyframe as updateKeyframeCommand,
  type KeyframeUpdates,
} from "@vivi2d/editor-core/clip-command";
import type { AnimationRetargetPlan } from "@/lib/timeline-animation-retarget";
import type { IdleSynthPlan } from "@vivi2d/editor-core/timeline-idle-synth";
import type { MotionAssistImportPlan } from "@/lib/timeline-motion-assist";
import type { MotionPresetPlan } from "@vivi2d/editor-core/timeline-motion-presets";
import { mutateProject } from "../projectMutator";

export type { KeyframeUpdates };

export interface KeyframeSliceActions {
  addKeyframe: (
    clipId: string,
    parameterId: string,
    frame: number,
    value: number,
    interpolation?: InterpolationType,
  ) => void;
  removeKeyframe: (clipId: string, parameterId: string, frame: number) => void;
  updateKeyframe: (
    clipId: string,
    parameterId: string,
    frame: number,
    updates: KeyframeUpdates,
    mergeKey?: string,
  ) => void;

  applyEasingPreset: (
    clipId: string,
    parameterId: string,
    frame: number,
    preset: EasingPreset,
  ) => void;

  addBoneKeyframe: (
    clipId: string,
    boneId: string,
    property: BonePropertyType,
    frame: number,
    value: number,
    interpolation?: InterpolationType,
  ) => void;
  removeBoneKeyframe: (
    clipId: string,
    boneId: string,
    property: BonePropertyType,
    frame: number,
  ) => void;

  addImageSequenceEntry: (
    clipId: string,
    targetMeshId: string,
    startFrame: number,
    imageId: string,
  ) => void;
  removeImageSequenceEntry: (
    clipId: string,
    targetMeshId: string,
    startFrame: number,
  ) => void;
  applyMotionPreset: (clipId: string, plan: MotionPresetPlan, mergeKey?: string) => void;
  applyMotionAssistImportPlan: (
    clipId: string,
    plan: MotionAssistImportPlan,
    mergeKey?: string,
  ) => void;
  applyIdleSynthPlan: (clipId: string, plan: IdleSynthPlan, mergeKey?: string) => void;
  applyAnimationRetargetPlan: (
    clipId: string,
    plan: AnimationRetargetPlan,
    mergeKey?: string,
  ) => void;
}

export const createKeyframeSlice = (): KeyframeSliceActions => ({
  addKeyframe: (clipId, parameterId, frame, value, interpolation = "linear") =>
    mutateProject((project) => {
      addKeyframeCommand(project, clipId, parameterId, frame, value, interpolation);
    }),

  removeKeyframe: (clipId, parameterId, frame) =>
    mutateProject((project) => {
      removeKeyframeCommand(project, clipId, parameterId, frame);
    }),

  updateKeyframe: (clipId, parameterId, frame, updates, mergeKey) =>
    mutateProject(
      (project) => {
        updateKeyframeCommand(project, clipId, parameterId, frame, updates);
      },
      mergeKey,
    ),

  applyEasingPreset: (clipId, parameterId, frame, preset) =>
    mutateProject((project) => {
      applyEasingPresetCommand(project, clipId, parameterId, frame, preset);
    }),

  addBoneKeyframe: (clipId, boneId, property, frame, value, interpolation = "linear") =>
    mutateProject((project) => {
      addBoneKeyframeCommand(
        project,
        clipId,
        boneId,
        property,
        frame,
        value,
        interpolation,
      );
    }),

  removeBoneKeyframe: (clipId, boneId, property, frame) =>
    mutateProject((project) => {
      removeBoneKeyframeCommand(project, clipId, boneId, property, frame);
    }),

  addImageSequenceEntry: (clipId, targetMeshId, startFrame, imageId) =>
    mutateProject((project) => {
      addImageSequenceEntryCommand(project, clipId, targetMeshId, startFrame, imageId);
    }),

  removeImageSequenceEntry: (clipId, targetMeshId, startFrame) =>
    mutateProject((project) => {
      removeImageSequenceEntryCommand(project, clipId, targetMeshId, startFrame);
    }),

  applyMotionPreset: (clipId, plan, mergeKey) =>
    mutateProject(
      (project) => {
        applyMotionPresetCommand(project, clipId, plan);
      },
      mergeKey,
    ),

  applyAnimationRetargetPlan: (clipId, plan, mergeKey) =>
    mutateProject(
      (project) => {
        applyAnimationRetargetPlanCommand(project, clipId, plan);
      },
      mergeKey,
    ),

  applyMotionAssistImportPlan: (clipId, plan, mergeKey) =>
    mutateProject(
      (project) => {
        applyMotionAssistImportPlanCommand(project, clipId, plan);
      },
      mergeKey,
    ),

  applyIdleSynthPlan: (clipId, plan, mergeKey) =>
    mutateProject(
      (project) => {
        applyIdleSynthPlanCommand(project, clipId, plan);
      },
      mergeKey,
    ),
});
