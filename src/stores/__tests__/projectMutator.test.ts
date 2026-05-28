import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { _resetMergeTimer, useHistoryStore } from "@/stores/historyStore";
import {
  mutateClip,
  mutateNode,
  mutateProject,
  replaceProject,
  runInHistoryTransaction,
} from "@/stores/projectMutator";
import { createAnimationClip, createProject, createViviMesh } from "@/test/fixtures";
import { resetEditorStore, resetHistoryStore } from "@/test/store-reset";

describe("projectMutator", () => {
  beforeEach(() => {
    resetEditorStore();
    resetHistoryStore();
    _resetMergeTimer();
  });

  it("mutates a project through an immer patch entry", () => {
    useEditorStore.setState({ project: createProject({ name: "before" }) });

    mutateProject((project) => {
      project.name = "after";
    });

    expect(useEditorStore.getState().project!.name).toBe("after");
    const entry = useHistoryStore.getState().undoStack[0]!;
    expect(entry.kind).toBe("patch");
    if (entry.kind === "patch") {
      expect(entry.patches.length).toBeGreaterThan(0);
      expect(entry.inversePatches.length).toBeGreaterThan(0);
    }
  });

  it("does nothing when there is no project", () => {
    mutateProject((project) => {
      project.name = "unreachable";
    });

    expect(useEditorStore.getState().project).toBeNull();
    expect(useHistoryStore.getState().undoStack).toEqual([]);
  });

  it("mutates nested layer nodes by id", () => {
    const child = createViviMesh({ id: "child", name: "Child" });
    const group = createViviMesh({
      id: "parent",
      name: "Parent",
      children: [child],
    });
    useEditorStore.setState({ project: createProject({ layers: [group] }) });

    mutateNode("child", (node) => {
      node.opacity = 0.5;
    });

    expect(useEditorStore.getState().project!.layers[0]!.children[0]!.opacity).toBe(
      0.5,
    );
  });

  it("mutates the requested clip without changing sibling clips", () => {
    const clipA = createAnimationClip({ id: "clip-a", name: "Idle" });
    const clipB = createAnimationClip({ id: "clip-b", name: "Walk" });
    useEditorStore.setState({ project: createProject({ clips: [clipA, clipB] }) });

    mutateClip("clip-b", (clip) => {
      clip.duration = 120;
    });

    expect(useEditorStore.getState().project!.clips.map((clip) => clip.duration)).toEqual([
      clipA.duration,
      120,
    ]);
  });

  it("groups multiple project mutations into one history snapshot", () => {
    useEditorStore.setState({ project: createProject({ name: "initial" }) });

    runInHistoryTransaction(() => {
      mutateProject((project) => {
        project.name = "step-1";
      });
      mutateProject((project) => {
        project.name = "step-2";
      });
    });

    const entry = useHistoryStore.getState().undoStack[0]!;
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(entry.kind).toBe("snapshot");
    if (entry.kind === "snapshot") expect(entry.snapshot.name).toBe("initial");
    expect(useEditorStore.getState().project!.name).toBe("step-2");
  });

  it("keeps nested history transactions as one outer entry", () => {
    useEditorStore.setState({ project: createProject({ name: "initial" }) });

    runInHistoryTransaction(() => {
      mutateProject((project) => {
        project.name = "outer";
      });
      runInHistoryTransaction(() => {
        mutateProject((project) => {
          project.name = "inner";
        });
      });
    });

    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(useEditorStore.getState().project!.name).toBe("inner");
  });

  it("rolls back project and history when a top-level transaction throws", () => {
    useEditorStore.setState({ project: createProject({ name: "initial" }) });

    expect(() => {
      runInHistoryTransaction(() => {
        mutateProject((project) => {
          project.name = "partial";
        });
        throw new Error("boom");
      });
    }).toThrow("boom");

    expect(useEditorStore.getState().project!.name).toBe("initial");
    expect(useHistoryStore.getState().undoStack).toEqual([]);

    mutateProject((project) => {
      project.name = "after";
    });
    expect(useEditorStore.getState().project!.name).toBe("after");
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
  });

  it("rolls back replaceProject and project structure version when a transaction throws", () => {
    useEditorStore.setState({
      project: createProject({ name: "initial" }),
      projectStructureVersion: 7,
    });

    expect(() => {
      runInHistoryTransaction(() => {
        replaceProject(createProject({ name: "replacement" }));
        throw new Error("replace boom");
      });
    }).toThrow("replace boom");

    expect(useEditorStore.getState().project!.name).toBe("initial");
    expect(useEditorStore.getState().projectStructureVersion).toBe(7);
    expect(useHistoryStore.getState().undoStack).toEqual([]);
  });

  it("returns the callback result", () => {
    useEditorStore.setState({ project: createProject() });

    expect(runInHistoryTransaction(() => 42)).toBe(42);
  });
});
