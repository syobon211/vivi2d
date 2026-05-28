import { beforeEach, describe, expect, it } from "vitest";
import { _resetMergeTimer, useHistoryStore } from "@/stores/historyStore";
import { createViviMesh, createProject } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";
import { useEditorStore } from "../editorStore";

describe("editorStore depth inspector actions", () => {
  beforeEach(() => {
    resetAllStores();
    _resetMergeTimer();
  });

  it("records drawOrder batch apply as a single undo step", () => {
    const a = createViviMesh({ id: "a", drawOrder: 100 });
    const b = createViviMesh({ id: "b", drawOrder: 200 });
    useEditorStore.setState({ project: createProject({ layers: [a, b] }) });

    useEditorStore.getState().setDrawOrderBatch([
      { id: a.id, drawOrder: 500 },
      { id: b.id, drawOrder: 600 },
    ]);

    const project = useEditorStore.getState().project!;
    expect(project.layers[0]!.drawOrder).toBe(500);
    expect(project.layers[1]!.drawOrder).toBe(600);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);

    useHistoryStore.getState().undo();
    const undone = useEditorStore.getState().project!;
    expect(undone.layers[0]!.drawOrder).toBe(100);
    expect(undone.layers[1]!.drawOrder).toBe(200);
  });
});
