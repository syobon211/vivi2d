import { describe, expect, it } from "vitest";
import {
  addPinToState,
  applySoftRegionHelperToState,
  beginDragState,
  cancelDragState,
  createGroupInState,
  INITIAL_PUPPET_WARP_STATE,
  linkMirrorPinsInState,
  normalizeSymmetryTolerance,
  removePinsFromState,
  setSelectedPinsInState,
} from "../puppet-warp-model";

describe("puppet warp model", () => {
  it("adds pins, groups them, and filters stale selections", () => {
    const first = addPinToState(INITIAL_PUPPET_WARP_STATE, "mesh", 0, "handle");
    expect(first.pinId).toBeTypeOf("string");

    const duplicate = addPinToState(first.state, "mesh", 0, "anchor");
    expect(duplicate.pinId).toBeNull();

    const second = addPinToState(first.state, "mesh", 1, "anchor");
    const grouped = createGroupInState(
      second.state,
      "mesh",
      [first.pinId!, second.pinId!, "missing"],
      "Group",
    );
    const selected = setSelectedPinsInState(grouped.state, [first.pinId!, "missing"]);

    expect(grouped.groupId).toBeTypeOf("string");
    expect(selected.selectedPinIds).toEqual([first.pinId]);
    expect(selected.groupsByMeshId.mesh?.[0]?.pinIds).toEqual([
      first.pinId,
      second.pinId,
    ]);
  });

  it("clears mirror links and cancels active drags when pins are removed", () => {
    const left = addPinToState(INITIAL_PUPPET_WARP_STATE, "mesh", 0, "handle");
    const right = addPinToState(left.state, "mesh", 1, "handle");
    const linked = linkMirrorPinsInState(right.state, left.pinId!, right.pinId!);
    const dragging = beginDragState(
      linked,
      "mesh",
      [0, 0, 1, 0],
      [left.pinId!],
      10,
      20,
    );
    const { state, cancelledDrag } = removePinsFromState(dragging, [left.pinId!]);

    expect(cancelledDrag?.meshId).toBe("mesh");
    expect(state.dragState).toBeNull();
    expect(state.pinsByMeshId.mesh?.[0]?.mirrorPinId).toBeNull();
  });

  it("clones drag state when cancelling", () => {
    const dragging = beginDragState(
      INITIAL_PUPPET_WARP_STATE,
      "mesh",
      [0, 0, 1, 0],
      ["pin"],
      0,
      0,
    );
    const { dragState } = cancelDragState(dragging);
    dragging.dragState!.baseVertices[0] = 99;

    expect(dragState?.baseVertices[0]).toBe(0);
  });

  it("applies soft region helper plans and rejects occupied vertices", () => {
    const vertices = [0, 0, 10, 0, 20, 0, 0, 10, 10, 10, 20, 10];
    const planned = applySoftRegionHelperToState(INITIAL_PUPPET_WARP_STATE, {
      meshId: "mesh",
      meshVertices: vertices,
      selectedVertexIndices: [0, 1, 2, 3, 4, 5],
      presetId: "generic",
    });
    expect(planned.result.status).toBe("created");

    const occupied = applySoftRegionHelperToState(
      addPinToState(INITIAL_PUPPET_WARP_STATE, "mesh", 0, "handle").state,
      {
        meshId: "mesh",
        meshVertices: vertices,
        selectedVertexIndices: [0, 1, 2, 3, 4, 5],
        presetId: "generic",
      },
    );
    expect(occupied.result).toEqual({
      status: "rejected",
      reason: "occupiedByOtherPin",
    });
  });

  it("normalizes symmetry tolerance", () => {
    expect(normalizeSymmetryTolerance(-2.2)).toBe(0);
    expect(normalizeSymmetryTolerance(Number.NaN)).toBe(4);
    expect(normalizeSymmetryTolerance(3.8)).toBe(4);
  });
});
