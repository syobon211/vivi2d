import { evaluateBoneTracksAtFrame } from "@vivi2d/core/timeline-utils";
import { exportSpineJson } from "@vivi2d/editor-core/spine-export-command";
import { beforeEach, describe, expect, it } from "vitest";
import { useBoneStore } from "@/stores/boneStore";
import { useClipStore } from "@/stores/clipStore";
import { useEditorStore } from "@/stores/editorStore";
import { useSceneStore } from "@/stores/sceneStore";
import { useSkinStore } from "@/stores/skinStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createViviMesh } from "@/test/fixtures";
import { setupTestProject } from "@/test/helpers";
import { resetAllStores } from "@/test/store-reset";

describe("bone, skin, animation, and export workflow", () => {
  beforeEach(() => {
    resetAllStores();
  });

  function buildBoneProject() {
    const mesh = createViviMesh({ name: "Face mesh" });
    setupTestProject({ layers: [mesh] });
    useBoneStore.getState().addRootBone("Body bone", 400, 300);
    return { meshId: mesh.id };
  }

  function findBoneInProject() {
    return useEditorStore.getState().project!.layers.find((layer) => layer.kind === "bone");
  }

  it("adds a bone layer to the project", () => {
    buildBoneProject();

    const bone = findBoneInProject();
    expect(bone).toBeDefined();
    expect(bone!.kind).toBe("bone");
    expect(bone!.name).toBe("Body bone");
  });

  it("binds a mesh to a bone with skin weights", () => {
    const { meshId } = buildBoneProject();
    const bone = findBoneInProject()!;

    useSkinStore.getState().bindSkin(meshId, [bone.id]);

    const skin = useEditorStore.getState().project!.skins[meshId];
    expect(skin).toBeDefined();
    expect(skin!.weights.length).toBeGreaterThan(0);
    expect(Object.keys(skin!.bindPoseInverse)).toContain(bone.id);
  });

  it("evaluates bone animation keyframes at exact and interpolated frames", () => {
    buildBoneProject();
    const bone = findBoneInProject()!;

    const sceneId = useSceneStore.getState().createScene("scene");
    useTimelineStore.getState().setActiveScene(sceneId);
    const clipId = useClipStore.getState().createClip("rotation");

    useClipStore.getState().addBoneTrack(clipId, bone.id, "angle");
    useClipStore.getState().addBoneKeyframe(clipId, bone.id, "angle", 0, 0);
    useClipStore.getState().addBoneKeyframe(clipId, bone.id, "angle", 30, Math.PI);
    useClipStore.getState().addBoneKeyframe(clipId, bone.id, "angle", 60, 0);

    const scene = useEditorStore
      .getState()
      .project!.scenes.find((entry) => entry.id === sceneId)!;
    const clip = scene.clips.find((entry) => entry.id === clipId)!;
    const boneTracks = clip.boneTracks ?? [];

    expect(evaluateBoneTracksAtFrame(boneTracks, 0)[bone.id]?.angle).toBe(0);
    expect(evaluateBoneTracksAtFrame(boneTracks, 30)[bone.id]?.angle).toBeCloseTo(
      Math.PI,
      5,
    );
    expect(evaluateBoneTracksAtFrame(boneTracks, 60)[bone.id]?.angle).toBe(0);
    expect(evaluateBoneTracksAtFrame(boneTracks, 15)[bone.id]?.angle).toBeCloseTo(
      Math.PI / 2,
      5,
    );
  });

  it("exports bones, skins, and bone animations to Spine JSON", () => {
    const { meshId } = buildBoneProject();
    const bone = findBoneInProject()!;
    useSkinStore.getState().bindSkin(meshId, [bone.id]);

    const sceneId = useSceneStore.getState().createScene("export scene");
    useTimelineStore.getState().setActiveScene(sceneId);
    const clipId = useClipStore.getState().createClip("test animation");

    useClipStore.getState().addBoneTrack(clipId, bone.id, "angle");
    useClipStore.getState().addBoneKeyframe(clipId, bone.id, "angle", 0, 0);
    useClipStore.getState().addBoneKeyframe(clipId, bone.id, "angle", 30, 1);

    const project = useEditorStore.getState().project!;
    const scene = project.scenes.find((entry) => entry.id === sceneId)!;
    const { json } = exportSpineJson(project, scene.clips);

    expect(json.bones.length).toBeGreaterThanOrEqual(2);
    expect(json.bones[0]!.name).toBe("root");
    expect(json.bones.some((entry) => entry.name === "Body bone")).toBe(true);
    expect(json.skins.length).toBeGreaterThan(0);
    expect(Object.keys(json.animations)).toContain("test animation");
    expect(json.animations["test animation"]!.bones).toBeDefined();
  });
});
