import { describe, expect, it } from "vitest";
import {
  addOffscreenSourceLayer,
  addOffscreenTarget,
  removeOffscreenSourceLayer,
  removeOffscreenTarget,
  setOffscreenBufferSize,
} from "../offscreen-command";
import { createProject } from "./fixtures";

describe("offscreen commands", () => {
  it("adds targets and normalizes invalid dimensions", () => {
    const project = createProject({ offscreenTargets: undefined });

    const id = addOffscreenTarget(
      project,
      { width: Number.NaN, height: 128.4 },
      () => "target-1",
    );

    expect(id).toBe("target-1");
    expect(project.offscreenTargets).toEqual([
      { id, width: 1, height: 128, sourceLayerIds: [] },
    ]);
  });

  it("removes targets and ignores missing ids", () => {
    const project = createProject();
    addOffscreenTarget(project, { width: 256, height: 256 }, () => "target-1");

    expect(removeOffscreenTarget(project, "missing")).toBe(false);
    expect(removeOffscreenTarget(project, "target-1")).toBe(true);
    expect(project.offscreenTargets).toEqual([]);
  });

  it("adds each source layer once", () => {
    const project = createProject();
    addOffscreenTarget(project, { width: 256, height: 256 }, () => "target-1");

    expect(addOffscreenSourceLayer(project, "target-1", "layer-1")).toBe(true);
    expect(addOffscreenSourceLayer(project, "target-1", "layer-1")).toBe(false);
    expect(project.offscreenTargets?.[0]?.sourceLayerIds).toEqual(["layer-1"]);
  });

  it("removes source layers", () => {
    const project = createProject({
      offscreenTargets: [
        {
          id: "target-1",
          width: 256,
          height: 256,
          sourceLayerIds: ["layer-1", "layer-2"],
        },
      ],
    });

    expect(removeOffscreenSourceLayer(project, "target-1", "layer-3")).toBe(false);
    expect(removeOffscreenSourceLayer(project, "target-1", "layer-1")).toBe(true);
    expect(project.offscreenTargets?.[0]?.sourceLayerIds).toEqual(["layer-2"]);
  });

  it("sets normalized buffer size", () => {
    const project = createProject();
    addOffscreenTarget(project, { width: 256, height: 256 }, () => "target-1");

    expect(setOffscreenBufferSize(project, "target-1", 512.7, -5)).toBe(true);
    expect(project.offscreenTargets?.[0]).toMatchObject({ width: 513, height: 1 });
    expect(setOffscreenBufferSize(project, "missing", 256, 256)).toBe(false);
  });
});
