import {
  assertNever,
  hasChildren,
  isBone,
  isGroup,
  isViviMesh,
} from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import { createViviMesh, createBoneNode, createGroup } from "@/test/fixtures";

describe("isViviMesh", () => {
  it("returns true for a ViviMesh node", () => {
    expect(isViviMesh(createViviMesh())).toBe(true);
  });

  it("returns false for non-mesh nodes", () => {
    expect(isViviMesh(createGroup())).toBe(false);
    expect(isViviMesh(createBoneNode())).toBe(false);
  });
});

describe("isGroup", () => {
  it("returns true for a group node", () => {
    expect(isGroup(createGroup())).toBe(true);
  });

  it("returns false for non-group nodes", () => {
    expect(isGroup(createViviMesh())).toBe(false);
    expect(isGroup(createBoneNode())).toBe(false);
  });
});

describe("isBone", () => {
  it("returns true for a bone node", () => {
    expect(isBone(createBoneNode())).toBe(true);
  });

  it("returns false for non-bone nodes", () => {
    expect(isBone(createViviMesh())).toBe(false);
    expect(isBone(createGroup())).toBe(false);
  });
});

describe("hasChildren", () => {
  it("returns true for nodes that can own children", () => {
    expect(hasChildren(createGroup())).toBe(true);
    expect(hasChildren(createBoneNode())).toBe(true);
  });

  it("returns false for mesh nodes", () => {
    expect(hasChildren(createViviMesh())).toBe(false);
  });
});

describe("assertNever", () => {
  it("throws for an unreachable value", () => {
    expect(() => assertNever("unexpected" as never)).toThrow();
  });
});
