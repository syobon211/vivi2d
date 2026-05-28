import { beforeEach, describe, expect, it } from "vitest";
import { usePuppetWarpStore } from "@/stores/puppetWarpStore";
import { resetPuppetWarpStore } from "@/test/store-reset";

describe("puppetWarpStore", () => {
  beforeEach(resetPuppetWarpStore);

  it("defaults to mesh editing and can switch to clip recording", () => {
    const store = usePuppetWarpStore.getState();

    expect(store.editTarget).toBe("mesh");

    store.setEditTarget("clip");
    expect(usePuppetWarpStore.getState().editTarget).toBe("clip");

    store.setEditTarget("mesh");
    expect(usePuppetWarpStore.getState().editTarget).toBe("mesh");
  });

  it("adds a pin and rejects a second pin on the same vertex", () => {
    const first = usePuppetWarpStore.getState().addPin("mesh-1", 2, "handle");
    const second = usePuppetWarpStore.getState().addPin("mesh-1", 2, "anchor");

    expect(first).toBeTypeOf("string");
    expect(second).toBeNull();
    expect(usePuppetWarpStore.getState().pinsByMeshId["mesh-1"]).toHaveLength(1);
  });

  it("can explicitly replace the pin on an occupied vertex", () => {
    const store = usePuppetWarpStore.getState();
    const first = store.addPin("mesh-1", 2, "handle")!;
    const next = store.replacePinAtVertex("mesh-1", 2, "anchor");

    expect(next).not.toBe(first);
    const pins = usePuppetWarpStore.getState().pinsByMeshId["mesh-1"]!;
    expect(pins).toHaveLength(1);
    expect(pins[0]!.kind).toBe("anchor");
  });

  it("creates a group and removes grouped pins from prior groups", () => {
    const store = usePuppetWarpStore.getState();
    const pinA = store.addPin("mesh-1", 0, "handle")!;
    const pinB = store.addPin("mesh-1", 1, "anchor")!;
    const firstGroup = store.createGroup("mesh-1", [pinA], "First")!;

    const secondGroup = store.createGroup("mesh-1", [pinA, pinB], "Second")!;

    expect(secondGroup).not.toBe(firstGroup);
    const groups = usePuppetWarpStore.getState().groupsByMeshId["mesh-1"]!;
    expect(groups).toHaveLength(1);
    expect(groups[0]!.id).toBe(secondGroup);
    expect(groups[0]!.pinIds).toEqual([pinA, pinB]);
  });

  it("removes a group without deleting pins", () => {
    const store = usePuppetWarpStore.getState();
    const pinA = store.addPin("mesh-1", 0, "handle")!;
    const groupId = store.createGroup("mesh-1", [pinA], "Brows")!;

    store.removeGroup(groupId);

    expect(usePuppetWarpStore.getState().pinsByMeshId["mesh-1"]).toHaveLength(1);
    expect(usePuppetWarpStore.getState().pinsByMeshId["mesh-1"]![0]!.groupId).toBeNull();
    expect(usePuppetWarpStore.getState().groupsByMeshId["mesh-1"]).toEqual([]);
  });

  it("relinks mirror pairs without leaving stale partners behind", () => {
    const store = usePuppetWarpStore.getState();
    const left = store.addPin("mesh-1", 0, "handle")!;
    const oldRight = store.addPin("mesh-1", 5, "handle")!;
    const newRight = store.addPin("mesh-1", 6, "handle")!;

    store.linkMirrorPins(left, oldRight);
    store.linkMirrorPins(left, newRight);

    const pins = usePuppetWarpStore.getState().pinsByMeshId["mesh-1"]!;
    expect(pins.find((pin) => pin.id === left)!.mirrorPinId).toBe(newRight);
    expect(pins.find((pin) => pin.id === newRight)!.mirrorPinId).toBe(left);
    expect(pins.find((pin) => pin.id === oldRight)!.mirrorPinId).toBeNull();
  });

  it("clears mirror links when one side of a pair is removed", () => {
    const store = usePuppetWarpStore.getState();
    const left = store.addPin("mesh-1", 0, "handle")!;
    const right = store.addPin("mesh-1", 5, "handle")!;

    store.linkMirrorPins(left, right);
    store.removePins([left]);

    const remaining = usePuppetWarpStore.getState().pinsByMeshId["mesh-1"]!;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(right);
    expect(remaining[0]!.mirrorPinId).toBeNull();
  });

  it("updates falloff values for selected pins only", () => {
    const store = usePuppetWarpStore.getState();
    const first = store.addPin("mesh-1", 0, "handle")!;
    const second = store.addPin("mesh-1", 1, "anchor")!;

    store.setPinFalloff([first], {
      radius: 64,
      strength: 0.5,
      curve: "gaussian",
    });

    const pins = usePuppetWarpStore.getState().pinsByMeshId["mesh-1"]!;
    expect(pins.find((pin) => pin.id === first)).toMatchObject({
      radius: 64,
      strength: 0.5,
      curve: "gaussian",
    });
    expect(pins.find((pin) => pin.id === second)).toMatchObject({
      radius: 48,
      strength: 1,
      curve: "smoothstep",
    });
  });

  it("tracks drag state and returns it on cancel", () => {
    const store = usePuppetWarpStore.getState();
    const pinId = store.addPin("mesh-1", 0, "handle")!;

    store.beginDrag("mesh-1", [0, 0, 1, 0], [pinId], 10, 20);
    store.updateDrag([5, 0, 6, 0]);

    const cancelled = store.cancelDrag();

    expect(cancelled).toMatchObject({
      meshId: "mesh-1",
      baseVertices: [0, 0, 1, 0],
      draggedPinIds: [pinId],
      startWorldX: 10,
      startWorldY: 20,
      lastAppliedVertices: [5, 0, 6, 0],
    });
    expect(cancelled?.mergeKey).toMatch(/^puppet-warp:mesh-1:/);
    expect(usePuppetWarpStore.getState().dragState).toBeNull();
  });

  it("returns the active drag state when dragged pins are removed", () => {
    const store = usePuppetWarpStore.getState();
    const pinId = store.addPin("mesh-1", 0, "handle")!;
    store.beginDrag("mesh-1", [0, 0, 1, 0], [pinId], 0, 0);

    const cancelled = store.removePins([pinId]);

    expect(cancelled?.meshId).toBe("mesh-1");
    expect(usePuppetWarpStore.getState().dragState).toBeNull();
  });

  it("filters stale ids when setting the selected pin list", () => {
    const store = usePuppetWarpStore.getState();
    const pinId = store.addPin("mesh-1", 0, "handle")!;

    store.setSelectedPins([pinId, "missing"]);

    expect(usePuppetWarpStore.getState().selectedPinIds).toEqual([pinId]);
  });

  it("invalidates all mesh-local state when topology is replaced", () => {
    const store = usePuppetWarpStore.getState();
    const pinA = store.addPin("mesh-1", 0, "handle")!;
    const pinB = store.addPin("mesh-1", 1, "anchor")!;
    store.createGroup("mesh-1", [pinA, pinB], "Mouth");
    store.setSelectedPins([pinA, pinB]);
    store.beginDrag("mesh-1", [0, 0, 1, 0], [pinA], 0, 0);

    store.invalidateMesh("mesh-1");

    const state = usePuppetWarpStore.getState();
    expect(state.pinsByMeshId["mesh-1"]).toBeUndefined();
    expect(state.groupsByMeshId["mesh-1"]).toBeUndefined();
    expect(state.selectedPinIds).toEqual([]);
    expect(state.dragState).toBeNull();
  });

  it("clamps symmetry tolerance to a finite non-negative integer", () => {
    const store = usePuppetWarpStore.getState();
    store.setSymmetryTolerance(-3.2);
    expect(usePuppetWarpStore.getState().symmetryTolerance).toBe(0);

    store.setSymmetryTolerance(Number.NaN);
    expect(usePuppetWarpStore.getState().symmetryTolerance).toBe(4);

    store.setSymmetryTolerance(6.9);
    expect(usePuppetWarpStore.getState().symmetryTolerance).toBe(7);
  });
});
