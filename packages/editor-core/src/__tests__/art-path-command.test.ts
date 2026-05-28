import type { ArtPathControlPoint, ArtPathNode, GroupNode } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import {
  addArtPath,
  addControlPoint,
  removeArtPath,
  removeControlPoint,
  setArtPathClosed,
  setArtPathStyle,
  updateControlPoint,
} from "../art-path-command";
import { createProject, createViviMesh } from "./fixtures";

function point(overrides: Partial<ArtPathControlPoint> = {}): ArtPathControlPoint {
  return {
    x: 0,
    y: 0,
    handleInX: 0,
    handleInY: 0,
    handleOutX: 0,
    handleOutY: 0,
    width: 1,
    opacity: 1,
    ...overrides,
  };
}

function artPath(overrides: Partial<ArtPathNode> = {}): ArtPathNode {
  return {
    id: "art-path",
    name: "Art path",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    children: [],
    blendMode: "normal",
    expanded: false,
    kind: "artPath",
    controlPoints: [],
    closed: false,
    style: { color: 0, baseWidth: 3, lineCap: "round", lineJoin: "round" },
    ...overrides,
  };
}

function group(children: GroupNode["children"]): GroupNode {
  return {
    id: "group",
    name: "Group",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    children,
    blendMode: "normal",
    expanded: true,
    kind: "group",
  };
}

describe("art path commands", () => {
  it("adds and removes art paths", () => {
    const project = createProject({ layers: [] });

    const id = addArtPath(project, "Stroke", Number.NaN, 20, () => "path-1");

    expect(id).toBe("path-1");
    expect(project.layers[0]).toMatchObject({
      id,
      name: "Stroke",
      kind: "artPath",
      x: 0,
      y: 20,
      closed: false,
    });
    expect(removeArtPath(project, "missing")).toBe(false);
    expect(removeArtPath(project, id)).toBe(true);
    expect(project.layers).toEqual([]);
  });

  it("removes nested art paths from the layer tree", () => {
    const nested = artPath({ id: "nested" });
    const project = createProject({ layers: [group([nested])] });

    expect(removeArtPath(project, "nested")).toBe(true);
    expect((project.layers[0] as GroupNode).children).toEqual([]);
  });

  it("adds, updates, inserts, and removes control points", () => {
    const project = createProject({ layers: [artPath({ id: "path" })] });

    expect(addControlPoint(project, "path", point({ x: 0 }))).toBe(true);
    expect(addControlPoint(project, "path", point({ x: 20 }))).toBe(true);
    expect(addControlPoint(project, "path", point({ x: 10 }), 1)).toBe(true);
    expect(updateControlPoint(project, "path", 1, { y: 5, width: Number.NaN })).toBe(
      true,
    );

    const path = project.layers[0] as ArtPathNode;
    expect(path.controlPoints.map((entry) => entry.x)).toEqual([0, 10, 20]);
    expect(path.controlPoints[1]).toMatchObject({ y: 5, width: 1 });
    expect(removeControlPoint(project, "path", -1)).toBe(false);
    expect(removeControlPoint(project, "path", 1)).toBe(true);
    expect(path.controlPoints.map((entry) => entry.x)).toEqual([0, 20]);
  });

  it("rejects explicit out-of-range insertion indexes", () => {
    const project = createProject({ layers: [artPath({ id: "path" })] });

    expect(addControlPoint(project, "path", point({ x: 1 }), -1)).toBe(false);
    expect(addControlPoint(project, "path", point({ x: 2 }), 1)).toBe(false);
    expect((project.layers[0] as ArtPathNode).controlPoints).toEqual([]);
  });

  it("clones control points supplied by callers", () => {
    const project = createProject({ layers: [artPath({ id: "path" })] });
    const original = point({ x: 1 });

    addControlPoint(project, "path", original);
    original.x = 999;

    expect((project.layers[0] as ArtPathNode).controlPoints[0]?.x).toBe(1);
  });

  it("updates style and closed state safely", () => {
    const project = createProject({ layers: [artPath({ id: "path" })] });

    expect(setArtPathStyle(project, "path", { color: Number.NaN, baseWidth: 8 }))
      .toBe(true);
    expect(setArtPathClosed(project, "path", true)).toBe(true);

    const path = project.layers[0] as ArtPathNode;
    expect(path.style).toMatchObject({ color: 0, baseWidth: 8 });
    expect(path.closed).toBe(true);
    expect(setArtPathStyle(project, "missing", { baseWidth: 1 })).toBe(false);
    expect(setArtPathClosed(project, "missing", false)).toBe(false);
  });

  it("ignores non-art-path targets", () => {
    const mesh = createViviMesh({ id: "mesh" });
    const project = createProject({ layers: [mesh] });

    expect(addControlPoint(project, "mesh", point())).toBe(false);
    expect(removeArtPath(project, "mesh")).toBe(false);
  });
});
