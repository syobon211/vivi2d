import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";
import { type BakeSliceActions, createBakeSlice } from "./clipStore/bakeSlice";
import { type ClipSliceActions, createClipSlice } from "./clipStore/clipSlice";
import {
  createKeyframeSlice,
  type KeyframeSliceActions,
} from "./clipStore/keyframeSlice";
import { createTrackSlice, type TrackSliceActions } from "./clipStore/trackSlice";

type ClipActions = ClipSliceActions &
  TrackSliceActions &
  KeyframeSliceActions &
  BakeSliceActions;

export const useClipStore = create<ClipActions>()(
  withStandardMiddleware<ClipActions>(
    () => ({
      ...createClipSlice(),
      ...createTrackSlice(),
      ...createKeyframeSlice(),
      ...createBakeSlice(),
    }),
    { name: "ClipStore", persistEnabled: false },
  ),
);
