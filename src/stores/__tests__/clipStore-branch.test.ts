import { beforeEach, describe, expect, it } from "vitest";
import { createProject } from "@/test/fixtures";
import {
  resetEditorStore,
  resetHistoryStore,
  resetTimelineStore,
} from "@/test/store-reset";
import { useClipStore } from "../clipStore";
import { useEditorStore } from "../editorStore";
import { _resetMergeTimer } from "../historyStore";

beforeEach(() => {
  resetEditorStore();
  resetHistoryStore();
  resetTimelineStore();
  _resetMergeTimer();
  useEditorStore.setState({ project: createProject() });
});

function getClips() {
  return useEditorStore.getState().project!.clips;
}

describe("bakePhysicsToClip branch coverage", () => {
  it("writes bone physics output into bone tracks", () => {
    const project = createProject({
      parameters: [
        { id: "p1", name: "Angle X", minValue: -30, maxValue: 30, defaultValue: 0 },
      ],
      physicsGroups: [
        {
          id: "pg1",
          name: "Hair sway",
          enabled: true,
          pendulums: [{ length: 1, mass: 1, damping: 0.05 }],
          inputs: [{ type: "x", parameterId: "p1", weight: 1 }],
          outputs: [
            { type: "boneAngle", boneId: "bone-phys", pendulumIndex: 0, weight: 1 },
          ],
          gravityDirection: 0,
          gravityStrength: 9.8,
          wind: 0,
        },
      ],
    });
    useEditorStore.setState({ project });

    const clipId = useClipStore.getState().createClip("physics bake");
    useClipStore.getState().addKeyframe(clipId, "p1", 0, 0, "linear");
    useClipStore.getState().addKeyframe(clipId, "p1", 29, 10, "linear");

    useClipStore.getState().bakePhysicsToClip(clipId, {
      startFrame: 0,
      endFrame: 29,
      fps: 30,
      sampleInterval: 2,
    });

    const clip = getClips().find((entry) => entry.id === clipId)!;
    const track = clip.boneTracks?.find(
      (entry) => entry.boneId === "bone-phys" && entry.property === "angle",
    );
    expect(track?.keyframes.length).toBeGreaterThan(0);
  });

  it("preserves bone keyframes outside the baked frame range", () => {
    const project = createProject({
      parameters: [
        { id: "p1", name: "Angle X", minValue: -30, maxValue: 30, defaultValue: 0 },
      ],
      physicsGroups: [
        {
          id: "pg1",
          name: "Hair sway",
          enabled: true,
          pendulums: [{ length: 1, mass: 1, damping: 0.05 }],
          inputs: [{ type: "x", parameterId: "p1", weight: 1 }],
          outputs: [
            { type: "boneAngle", boneId: "bone-exist", pendulumIndex: 0, weight: 1 },
          ],
          gravityDirection: 0,
          gravityStrength: 9.8,
          wind: 0,
        },
      ],
    });
    useEditorStore.setState({ project });

    const clipId = useClipStore.getState().createClip("physics merge");
    useClipStore.getState().addKeyframe(clipId, "p1", 0, 0, "linear");
    useClipStore.getState().addKeyframe(clipId, "p1", 29, 10, "linear");
    useClipStore.getState().addBoneKeyframe(clipId, "bone-exist", "angle", 0, 0);
    useClipStore.getState().addBoneKeyframe(clipId, "bone-exist", "angle", 5, 1);
    useClipStore.getState().addBoneKeyframe(clipId, "bone-exist", "angle", 15, 2);
    useClipStore.getState().addBoneKeyframe(clipId, "bone-exist", "angle", 50, 3);

    useClipStore.getState().bakePhysicsToClip(clipId, {
      startFrame: 5,
      endFrame: 15,
      fps: 30,
      sampleInterval: 2,
    });

    const clip = getClips().find((entry) => entry.id === clipId)!;
    const track = clip.boneTracks!.find(
      (entry) => entry.boneId === "bone-exist" && entry.property === "angle",
    )!;
    expect(track.keyframes.some((keyframe) => keyframe.frame === 0)).toBe(true);
    expect(track.keyframes.some((keyframe) => keyframe.frame === 50)).toBe(true);
  });
});
