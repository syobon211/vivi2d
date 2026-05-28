import { describe, expect, it } from "vitest";
import {
  addCircleCollider,
  addMeshCollider,
  addMeshCollidersFromSelection,
  addRectCollider,
  removeCollider,
  renameCollider,
  setColliderTag,
  toggleCollider,
  updateColliderShape,
} from "../collider-command";
import { createProject, createViviMesh } from "./fixtures";

describe("collider commands", () => {
  it("adds rectangle, circle, and mesh colliders", () => {
    const project = createProject();

    expect(
      addRectCollider(
        project,
        { name: "Rect", x: 10, y: 20, width: 100, height: 50 },
        () => "rect",
      ),
    ).toBe("rect");
    expect(
      addCircleCollider(
        project,
        { name: "Circle", x: Number.NaN, y: 60, radius: Number.POSITIVE_INFINITY },
        () => "circle",
      ),
    ).toBe("circle");
    expect(addMeshCollider(project, { name: "Mesh", meshId: "mesh-1" }, () => "mesh"))
      .toBe("mesh");

    expect(project.colliders).toEqual([
      {
        id: "rect",
        name: "Rect",
        shape: { type: "rectangle", x: 10, y: 20, width: 100, height: 50 },
        enabled: true,
      },
      {
        id: "circle",
        name: "Circle",
        shape: { type: "circle", x: 0, y: 60, radius: 1 },
        enabled: true,
      },
      {
        id: "mesh",
        name: "Mesh",
        shape: { type: "mesh", meshId: "mesh-1" },
        enabled: true,
      },
    ]);
  });

  it("removes, toggles, renames, and tags colliders", () => {
    const project = createProject();
    addRectCollider(
      project,
      { name: "Rect", x: 0, y: 0, width: 1, height: 1 },
      () => "rect",
    );

    expect(toggleCollider(project, "rect")).toBe(true);
    expect(project.colliders[0]?.enabled).toBe(false);
    expect(renameCollider(project, "rect", "Renamed")).toBe(true);
    expect(setColliderTag(project, "rect", "head")).toBe(true);
    expect(project.colliders[0]).toMatchObject({ name: "Renamed", tag: "head" });
    expect(removeCollider(project, "missing")).toBe(false);
    expect(removeCollider(project, "rect")).toBe(true);
    expect(project.colliders).toEqual([]);
  });

  it("updates only matching shape types", () => {
    const project = createProject();
    addRectCollider(
      project,
      { name: "Rect", x: 0, y: 0, width: 100, height: 50 },
      () => "rect",
    );
    addCircleCollider(
      project,
      { name: "Circle", x: 0, y: 0, radius: 10 },
      () => "circle",
    );

    expect(updateColliderShape(project, "rect", { type: "circle" })).toBe(false);
    expect(updateColliderShape(project, "rect", { x: 10, radius: 999 } as any)).toBe(
      true,
    );
    expect(updateColliderShape(project, "circle", { radius: 25, width: 999 } as any))
      .toBe(true);

    expect(project.colliders[0]?.shape).toEqual({
      type: "rectangle",
      x: 10,
      y: 0,
      width: 100,
      height: 50,
    });
    expect(project.colliders[1]?.shape).toEqual({
      type: "circle",
      x: 0,
      y: 0,
      radius: 25,
    });
  });

  it("updates mesh collider ids even when the id is an empty string", () => {
    const project = createProject();
    addMeshCollider(project, { name: "Mesh", meshId: "mesh-1" }, () => "mesh");

    expect(updateColliderShape(project, "mesh", { meshId: "" })).toBe(true);
    expect(project.colliders[0]?.shape).toEqual({ type: "mesh", meshId: "" });
  });

  it("adds mesh colliders from valid selection only once", () => {
    const meshA = createViviMesh({ id: "mesh-a", name: "Hair" });
    const meshB = createViviMesh({ id: "mesh-b", name: "Body" });
    const project = createProject({
      layers: [meshA, meshB],
      colliders: [
        {
          id: "existing",
          name: "Hair",
          shape: { type: "mesh", meshId: "mesh-a" },
          enabled: true,
        },
      ],
    });
    let counter = 0;

    const count = addMeshCollidersFromSelection(
      project,
      ["mesh-a", "mesh-b", "missing"],
      () => `mesh-collider-${++counter}`,
    );

    expect(count).toBe(1);
    expect(project.colliders).toHaveLength(2);
    expect(project.colliders[1]).toMatchObject({
      id: "mesh-collider-1",
      name: "Body",
      shape: { type: "mesh", meshId: "mesh-b" },
      enabled: true,
    });
  });
});
