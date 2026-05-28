import { describe, expect, it } from "vitest";
import type { ProjectData } from "@vivi2d/core/types";
import { createProjectMutation } from "../project-transaction";

function createProject(): ProjectData {
  return {
    version: "5.0.0",
    name: "Test",
    width: 100,
    height: 100,
    layers: [],
    parameters: [],
    physics: [],
    scenes: [],
    clips: [],
    stateMachines: [],
    expressionPresets: [],
  };
}

describe("editor-core project transaction helpers", () => {
  it("returns patches and inverse patches for project mutations", () => {
    const previous = createProject();
    const result = createProjectMutation(previous, (project) => {
      project.name = "Renamed";
    });

    expect(result.changed).toBe(true);
    expect(result.next.name).toBe("Renamed");
    expect(previous.name).toBe("Test");
    expect(result.patches).toEqual([
      { op: "replace", path: ["name"], value: "Renamed" },
    ]);
    expect(result.inversePatches).toEqual([
      { op: "replace", path: ["name"], value: "Test" },
    ]);
  });

  it("marks no-op mutations as unchanged", () => {
    const previous = createProject();
    const result = createProjectMutation(previous, () => {});

    expect(result.changed).toBe(false);
    expect(result.next).toBe(previous);
    expect(result.patches).toEqual([]);
    expect(result.inversePatches).toEqual([]);
  });
});
