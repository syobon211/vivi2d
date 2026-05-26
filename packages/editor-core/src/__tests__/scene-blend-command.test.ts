import { describe, expect, it } from "vitest";
import {
  createSceneBlend,
  removeSceneBlend,
  updateSceneBlend,
} from "../scene-blend-command";
import { createProject } from "./fixtures";

describe("scene blend commands", () => {
  it("creates scene blends with defaults and normalized transition frames", () => {
    const project = createProject({ sceneBlends: undefined });

    const id = createSceneBlend(
      project,
      {
        sourceSceneId: "scene-a",
        targetSceneId: "scene-b",
        transitionFrames: 12.6,
      },
      () => "blend-1",
    );

    expect(id).toBe("blend-1");
    expect(project.sceneBlends).toEqual([
      {
        id,
        sourceSceneId: "scene-a",
        targetSceneId: "scene-b",
        mode: "crossfade",
        transitionFrames: 13,
        easing: "linear",
      },
    ]);
  });

  it("removes scene blends", () => {
    const project = createProject();
    createSceneBlend(
      project,
      { sourceSceneId: "scene-a", targetSceneId: "scene-b" },
      () => "blend-1",
    );

    expect(removeSceneBlend(project, "missing")).toBe(false);
    expect(removeSceneBlend(project, "blend-1")).toBe(true);
    expect(project.sceneBlends).toEqual([]);
  });

  it("updates scene blend fields", () => {
    const project = createProject();
    createSceneBlend(
      project,
      { sourceSceneId: "scene-a", targetSceneId: "scene-b" },
      () => "blend-1",
    );

    expect(
      updateSceneBlend(project, "blend-1", {
        mode: "override",
        transitionFrames: Number.NaN,
        easing: "sns",
      }),
    ).toBe(true);
    expect(project.sceneBlends?.[0]).toMatchObject({
      mode: "override",
      transitionFrames: 30,
      easing: "sns",
    });
    expect(updateSceneBlend(project, "missing", { mode: "additive" })).toBe(false);
  });
});
