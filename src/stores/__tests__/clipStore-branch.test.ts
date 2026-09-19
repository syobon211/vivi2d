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
  it("bake は新規 bone track を生成し、既存 track の範囲内だけを置換する", () => {
    useEditorStore.setState({ project: createProject({
      physicsGroups: [{
        id: "pg1", name: "zero-force", enabled: true,
        pendulums: [{ length: 1, mass: 1, damping: 0 }],
        inputs: [],
        outputs: [
          { type: "boneAngle", boneId: "bone-new", pendulumIndex: 0, weight: 1 },
          { type: "boneAngle", boneId: "bone-existing", pendulumIndex: 0, weight: 1 },
        ],
        gravityDirection: 0, gravityStrength: 0, wind: 0,
      }],
    }) });
    const clipId = useClipStore.getState().createClip("physics merge");
    for (const [frame, value] of [[0, 0.25], [5, 1], [15, 2], [50, 0.75]] as const) {
      useClipStore.getState().addBoneKeyframe(clipId, "bone-existing", "angle", frame, value);
    }
    useClipStore.getState().addBoneKeyframe(clipId, "bone-existing", "scaleX", 7, 3);
    useClipStore.getState().bakePhysicsToClip(clipId, {
      startFrame: 5, endFrame: 15, fps: 30, sampleInterval: 5,
    });

    // Zero initial angle/velocity and zero force produce zero at every sampled frame.
    const samples = [5, 10, 15].map((frame) => ({
      frame, value: 0, interpolation: "linear",
    }));
    const tracks = getClips().find((clip) => clip.id === clipId)!.boneTracks!;
    expect(tracks).toHaveLength(3);
    expect(tracks.find((track) => track.boneId === "bone-new")).toEqual({
      boneId: "bone-new", property: "angle", keyframes: samples,
    });
    expect(tracks.find((track) => track.boneId === "bone-existing" && track.property === "angle")!.keyframes).toEqual([
      { frame: 0, value: 0.25, interpolation: "linear" },
      ...samples,
      { frame: 50, value: 0.75, interpolation: "linear" },
    ]);
    expect(tracks.find((track) => track.property === "scaleX")!.keyframes).toEqual([
      { frame: 7, value: 3, interpolation: "linear" },
    ]);
  });

});
