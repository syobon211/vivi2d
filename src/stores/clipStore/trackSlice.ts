import type { AudioTrack, BonePropertyType, LipSyncTrack } from "@vivi2d/core/types";
import {
  addAudioTrack as addAudioTrackCommand,
  addBoneTrack as addBoneTrackCommand,
  addImageSequenceTrack as addImageSequenceTrackCommand,
  addLipSyncTrack as addLipSyncTrackCommand,
  addTrack as addTrackCommand,
  removeAudioTrack as removeAudioTrackCommand,
  removeBoneTrack as removeBoneTrackCommand,
  removeImageSequenceTrack as removeImageSequenceTrackCommand,
  removeLipSyncTrack as removeLipSyncTrackCommand,
  removeTrack as removeTrackCommand,
  updateAudioTrack as updateAudioTrackCommand,
  updateLipSyncTrack as updateLipSyncTrackCommand,
} from "@vivi2d/editor-core/clip-command";
import { mutateProject } from "../projectMutator";

export interface TrackSliceActions {
  addTrack: (clipId: string, parameterId: string) => void;
  removeTrack: (clipId: string, parameterId: string) => void;

  addBoneTrack: (clipId: string, boneId: string, property: BonePropertyType) => void;
  removeBoneTrack: (clipId: string, boneId: string, property: BonePropertyType) => void;

  addImageSequenceTrack: (clipId: string, targetMeshId: string) => void;
  removeImageSequenceTrack: (clipId: string, targetMeshId: string) => void;

  addAudioTrack: (clipId: string, track: AudioTrack) => void;
  removeAudioTrack: (clipId: string, trackId: string) => void;
  updateAudioTrack: (
    clipId: string,
    trackId: string,
    patch: Partial<Omit<AudioTrack, "id">>,
  ) => void;

  addLipSyncTrack: (clipId: string, track: LipSyncTrack) => void;
  removeLipSyncTrack: (clipId: string, trackId: string) => void;
  updateLipSyncTrack: (
    clipId: string,
    trackId: string,
    patch: Partial<
      Omit<
        LipSyncTrack,
        "id" | "sourceAudioTrackId" | "analysisType" | "analysisFps" | "samples"
      >
    >,
  ) => void;
}

export const createTrackSlice = (): TrackSliceActions => ({
  addTrack: (clipId, parameterId) =>
    mutateProject((project) => {
      addTrackCommand(project, clipId, parameterId);
    }),

  removeTrack: (clipId, parameterId) =>
    mutateProject((project) => {
      removeTrackCommand(project, clipId, parameterId);
    }),

  addBoneTrack: (clipId, boneId, property) =>
    mutateProject((project) => {
      addBoneTrackCommand(project, clipId, boneId, property);
    }),

  removeBoneTrack: (clipId, boneId, property) =>
    mutateProject((project) => {
      removeBoneTrackCommand(project, clipId, boneId, property);
    }),

  addImageSequenceTrack: (clipId, targetMeshId) =>
    mutateProject((project) => {
      addImageSequenceTrackCommand(project, clipId, targetMeshId);
    }),

  removeImageSequenceTrack: (clipId, targetMeshId) =>
    mutateProject((project) => {
      removeImageSequenceTrackCommand(project, clipId, targetMeshId);
    }),

  addAudioTrack: (clipId, track) =>
    mutateProject((project) => {
      addAudioTrackCommand(project, clipId, track);
    }),

  removeAudioTrack: (clipId, trackId) =>
    mutateProject((project) => {
      removeAudioTrackCommand(project, clipId, trackId);
    }),

  updateAudioTrack: (clipId, trackId, patch) =>
    mutateProject((project) => {
      updateAudioTrackCommand(project, clipId, trackId, patch);
    }),

  addLipSyncTrack: (clipId, track) =>
    mutateProject((project) => {
      addLipSyncTrackCommand(project, clipId, track);
    }),

  removeLipSyncTrack: (clipId, trackId) =>
    mutateProject((project) => {
      removeLipSyncTrackCommand(project, clipId, trackId);
    }),

  updateLipSyncTrack: (clipId, trackId, patch) =>
    mutateProject((project) => {
      updateLipSyncTrackCommand(project, clipId, trackId, patch);
    }),
});
