import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import {
  _resetCallbacks,
  _resetMergeTimer,
  registerHistoryCallbacks,
  useHistoryStore,
} from "@/stores/historyStore";
import { createProject } from "@/test/fixtures";
import { resetAllStores, resetEditorStore, resetHistoryStore } from "@/test/store-reset";


describe("historyStore", () => {
  beforeEach(() => {
    resetEditorStore();
    resetHistoryStore();
    _resetMergeTimer();
    vi.restoreAllMocks();
  });

  // ----------------------------------------------------------
  // pushState
  // ----------------------------------------------------------

  describe("pushState", () => {
    it("スナップショットが undoStack に追加される", () => {
      const project = createProject({ name: "プロジェクトA" });
      useHistoryStore.getState().pushState(project);

      const { undoStack } = useHistoryStore.getState();
      expect(undoStack).toHaveLength(1);
      expect(undoStack[0]!).toMatchObject({
        kind: "snapshot",
        snapshot: { name: "プロジェクトA" },
      });
    });

    it("pushState で redoStack がクリアされる", () => {
      const projectA = createProject({ name: "A" });
      const projectB = createProject({ name: "B" });

      useEditorStore.setState((s) => {
        s.project = projectA;
      });

      useHistoryStore.getState().pushState(projectA);

      const now = 1_700_000_000_000;
      vi.spyOn(Date, "now").mockReturnValue(now + 1000);

      useHistoryStore.getState().pushState(projectB);
      useHistoryStore.getState().undo();
      expect(useHistoryStore.getState().redoStack.length).toBeGreaterThan(0);

      vi.spyOn(Date, "now").mockReturnValue(now + 2000);

      const projectC = createProject({ name: "C" });
      useHistoryStore.getState().pushState(projectC);
      expect(useHistoryStore.getState().redoStack).toHaveLength(0);
    });

    it("MAX_HISTORY (50) を超えると古いエントリが削除される", () => {
      const baseTime = 1000000;
      let timeOffset = 0;
      vi.spyOn(Date, "now").mockImplementation(() => baseTime + timeOffset);

      for (let i = 0; i < 51; i++) {
        timeOffset = i * 1000;
        const project = createProject({ name: `プロジェクト${i}` });
        useHistoryStore.getState().pushState(project);
      }

      const { undoStack } = useHistoryStore.getState();
      expect(undoStack).toHaveLength(50);

      expect(undoStack[0]!).toMatchObject({
        kind: "snapshot",
        snapshot: { name: "プロジェクト1" },
      });
      expect(undoStack[49]!).toMatchObject({
        kind: "snapshot",
        snapshot: { name: "プロジェクト50" },
      });
    });
  });

  // ----------------------------------------------------------
  // undo
  // ----------------------------------------------------------

  describe("undo", () => {
    it("前の状態に戻る", () => {
      const projectBefore = createProject({ name: "変更前" });
      const projectAfter = createProject({ name: "変更後" });

      useHistoryStore.getState().pushState(projectBefore);

      useEditorStore.setState((s) => {
        s.project = projectAfter;
      });

      useHistoryStore.getState().undo();

      const restored = useEditorStore.getState().project;
      expect(restored).not.toBeNull();
      expect(restored!.name).toBe("変更前");
    });

    it("redoStack に現在の状態が積まれる", () => {
      const projectBefore = createProject({ name: "変更前" });
      const projectCurrent = createProject({ name: "現在" });

      useHistoryStore.getState().pushState(projectBefore);
      useEditorStore.setState((s) => {
        s.project = projectCurrent;
      });

      useHistoryStore.getState().undo();

      const { redoStack } = useHistoryStore.getState();
      expect(redoStack).toHaveLength(1);
      expect(redoStack[0]!).toMatchObject({
        kind: "snapshot",
        snapshot: { name: "現在" },
      });
    });

    it("空の undoStack で undo しても何も起きない", () => {
      const project = createProject({ name: "そのまま" });
      useEditorStore.setState((s) => {
        s.project = project;
      });

      expect(useHistoryStore.getState().undoStack).toHaveLength(0);

      useHistoryStore.getState().undo();

      expect(useEditorStore.getState().project!.name).toBe("そのまま");
      expect(useHistoryStore.getState().redoStack).toHaveLength(0);
    });
  });

  // ----------------------------------------------------------
  // redo
  // ----------------------------------------------------------

  describe("redo", () => {
    it("元に戻す操作を再適用する", () => {
      const projectBefore = createProject({ name: "変更前" });
      const projectAfter = createProject({ name: "変更後" });

      useHistoryStore.getState().pushState(projectBefore);
      useEditorStore.setState((s) => {
        s.project = projectAfter;
      });

      useHistoryStore.getState().undo();
      expect(useEditorStore.getState().project!.name).toBe("変更前");

      useHistoryStore.getState().redo();
      expect(useEditorStore.getState().project!.name).toBe("変更後");
    });

    it("空の redoStack で redo しても何も起きない", () => {
      const project = createProject({ name: "そのまま" });
      useEditorStore.setState((s) => {
        s.project = project;
      });

      expect(useHistoryStore.getState().redoStack).toHaveLength(0);

      useHistoryStore.getState().redo();

      expect(useEditorStore.getState().project!.name).toBe("そのまま");
      expect(useHistoryStore.getState().undoStack).toHaveLength(0);
    });
  });

  // ----------------------------------------------------------
  // clear
  // ----------------------------------------------------------

  describe("clear", () => {
    it("両スタックがクリアされる", () => {
      const projectA = createProject({ name: "A" });
      const projectB = createProject({ name: "B" });

      useHistoryStore.getState().pushState(projectA);
      useEditorStore.setState((s) => {
        s.project = projectB;
      });

      useHistoryStore.getState().undo();

      expect(useHistoryStore.getState().undoStack.length).toBeGreaterThanOrEqual(0);
      expect(useHistoryStore.getState().redoStack.length).toBeGreaterThan(0);

      useHistoryStore.getState().clear();

      expect(useHistoryStore.getState().undoStack).toHaveLength(0);
      expect(useHistoryStore.getState().redoStack).toHaveLength(0);
    });
  });


  describe("デバウンス", () => {
    it("mergeKey 無しの連続 pushState は毎回新規エントリとして積まれる（異種操作の折り畳み防止）", () => {
      const baseTime = 1000000;
      vi.spyOn(Date, "now").mockReturnValue(baseTime);

      const projectA = createProject({ name: "A" });
      useHistoryStore.getState().pushState(projectA);
      expect(useHistoryStore.getState().undoStack).toHaveLength(1);

      vi.spyOn(Date, "now").mockReturnValue(baseTime + 200);
      const projectB = createProject({ name: "B" });
      useHistoryStore.getState().pushState(projectB);
      expect(useHistoryStore.getState().undoStack).toHaveLength(2);
    });

    it("同一 mergeKey の 500ms 以内連続 push は 1 エントリにマージされる", () => {
      const baseTime = 1000000;
      vi.spyOn(Date, "now").mockReturnValue(baseTime);

      const projectA = createProject({ name: "A" });
      useHistoryStore.getState().pushState(projectA, "slider:opacity");
      expect(useHistoryStore.getState().undoStack).toHaveLength(1);

      vi.spyOn(Date, "now").mockReturnValue(baseTime + 200);
      const projectB = createProject({ name: "B" });
      useHistoryStore.getState().pushState(projectB, "slider:opacity");
      expect(useHistoryStore.getState().undoStack).toHaveLength(1);

      vi.spyOn(Date, "now").mockReturnValue(baseTime + 400);
      const projectC = createProject({ name: "C" });
      useHistoryStore.getState().pushState(projectC, "slider:opacity");
      expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    });

    it("異なる mergeKey が挟まると必ず break する（異種操作は 1 undo に折り畳まれない）", () => {
      const baseTime = 1000000;
      vi.spyOn(Date, "now").mockReturnValue(baseTime);

      const projectA = createProject({ name: "A" });
      useHistoryStore.getState().pushState(projectA, "slider:opacity");

      vi.spyOn(Date, "now").mockReturnValue(baseTime + 100);
      const projectB = createProject({ name: "B" });
      useHistoryStore.getState().pushState(projectB, "slider:drawOrder");
      expect(useHistoryStore.getState().undoStack).toHaveLength(2);

      vi.spyOn(Date, "now").mockReturnValue(baseTime + 200);
      const projectC = createProject({ name: "C" });
      useHistoryStore.getState().pushState(projectC, "slider:drawOrder");
      expect(useHistoryStore.getState().undoStack).toHaveLength(2);
    });

    it("同一 mergeKey でも 500ms 以上経過後は新規エントリとして積まれる", () => {
      const baseTime = 1000000;
      vi.spyOn(Date, "now").mockReturnValue(baseTime);

      const projectA = createProject({ name: "A" });
      useHistoryStore.getState().pushState(projectA, "slider:opacity");
      expect(useHistoryStore.getState().undoStack).toHaveLength(1);

      vi.spyOn(Date, "now").mockReturnValue(baseTime + 600);
      const projectB = createProject({ name: "B" });
      useHistoryStore.getState().pushState(projectB, "slider:opacity");

      expect(useHistoryStore.getState().undoStack).toHaveLength(2);
      expect(useHistoryStore.getState().undoStack[0]!).toMatchObject({
        kind: "snapshot",
        snapshot: { name: "A" },
      });
      expect(useHistoryStore.getState().undoStack[1]!).toMatchObject({
        kind: "snapshot",
        snapshot: { name: "B" },
      });
    });

    it("undo後のpushStateはマージされない（lastPushTime = 0にリセット済み）", () => {
      const baseTime = 1000000;
      vi.spyOn(Date, "now").mockReturnValue(baseTime);

      const projectA = createProject({ name: "A" });
      const projectB = createProject({ name: "B" });

      // pushState -> undo
      useHistoryStore.getState().pushState(projectA);
      useEditorStore.setState((s) => {
        s.project = projectB;
      });
      useHistoryStore.getState().undo();

      vi.spyOn(Date, "now").mockReturnValue(baseTime);
      const projectC = createProject({ name: "C" });
      useHistoryStore.getState().pushState(projectC);

      expect(useHistoryStore.getState().undoStack).toHaveLength(1);
      expect(useHistoryStore.getState().undoStack[0]!).toMatchObject({
        kind: "snapshot",
        snapshot: { name: "C" },
      });
    });
  });
});


describe("historyStore — エッジケース", () => {
  it("undoStack が空の時に undo しても例外にならない", () => {
    resetAllStores();
    expect(() => useHistoryStore.getState().undo()).not.toThrow();
  });

  it("redoStack が空の時に redo しても例外にならない", () => {
    resetAllStores();
    expect(() => useHistoryStore.getState().redo()).not.toThrow();
  });

  it("undo後に新しい変更を加えると redo が消える", () => {
    resetAllStores();
    const project1 = createProject({ name: "v1" });
    const project2 = createProject({ name: "v2" });
    const project3 = createProject({ name: "v3" });
    useEditorStore.setState({ project: project1 });

    useHistoryStore.getState().pushState(project1);
    useHistoryStore.getState().pushState(project2);
    useHistoryStore.getState().undo();
    expect(useHistoryStore.getState().redoStack.length).toBeGreaterThan(0);

    useHistoryStore.getState().pushState(project3);
    expect(useHistoryStore.getState().redoStack).toHaveLength(0);
  });

  it("プロジェクトが null の状態で undo しても何もしない", () => {
    resetAllStores();
    const project = createProject({ name: "test" });
    useHistoryStore.getState().pushState(project);
    useEditorStore.setState({ project: null });

    useHistoryStore.getState().undo();
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
  });

  it("プロジェクトが null の状態で redo しても何もしない", () => {
    resetAllStores();
    useHistoryStore.setState({
      redoStack: [{ kind: "snapshot", snapshot: createProject({ name: "redo" }) }],
    });
    useEditorStore.setState({ project: null });

    useHistoryStore.getState().redo();
    expect(useHistoryStore.getState().redoStack).toHaveLength(1);
  });

  it("コールバック未登録時に undo しても例外にならない", () => {
    resetAllStores();
    const project = createProject({ name: "test" });
    useHistoryStore.getState().pushState(project);
    useEditorStore.setState({ project });

    _resetCallbacks();

    useHistoryStore.getState().undo();
    expect(useEditorStore.getState().project!.name).toBe("test");

    registerHistoryCallbacks({
      getCurrentProject: () => useEditorStore.getState().project,
      restoreProject: (snapshot) => {
        useEditorStore.setState((s) => {
          s.project = structuredClone(snapshot);
        });
      },
    });
  });

  it("restoreProject が undo 中に throw した場合 undoStack/redoStack は維持される", () => {
    const project = createProject({ name: "base" });
    useEditorStore.setState({ project: structuredClone(project) });
    useHistoryStore.getState().pushState(project);

    const beforeUndoLen = useHistoryStore.getState().undoStack.length;
    const beforeRedoLen = useHistoryStore.getState().redoStack.length;

    registerHistoryCallbacks({
      getCurrentProject: () => useEditorStore.getState().project,
      restoreProject: () => {
        throw new Error("意図的な復元失敗");
      },
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    useHistoryStore.getState().undo();
    warnSpy.mockRestore();

    expect(useHistoryStore.getState().undoStack.length).toBe(beforeUndoLen);
    expect(useHistoryStore.getState().redoStack.length).toBe(beforeRedoLen);

    registerHistoryCallbacks({
      getCurrentProject: () => useEditorStore.getState().project,
      restoreProject: (snapshot) => {
        useEditorStore.setState((s) => {
          s.project = structuredClone(snapshot);
        });
      },
    });
  });

  it("restoreProject が redo 中に throw した場合 undoStack/redoStack は維持される", () => {
    const project = createProject({ name: "base" });
    useEditorStore.setState({ project: structuredClone(project) });
    useHistoryStore.setState({
      redoStack: [{ kind: "snapshot", snapshot: createProject({ name: "redo-target" }) }],
    });
    const beforeUndoLen = useHistoryStore.getState().undoStack.length;
    const beforeRedoLen = useHistoryStore.getState().redoStack.length;

    registerHistoryCallbacks({
      getCurrentProject: () => useEditorStore.getState().project,
      restoreProject: () => {
        throw new Error("意図的な復元失敗");
      },
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    useHistoryStore.getState().redo();
    warnSpy.mockRestore();

    expect(useHistoryStore.getState().undoStack.length).toBe(beforeUndoLen);
    expect(useHistoryStore.getState().redoStack.length).toBe(beforeRedoLen);

    registerHistoryCallbacks({
      getCurrentProject: () => useEditorStore.getState().project,
      restoreProject: (snapshot) => {
        useEditorStore.setState((s) => {
          s.project = structuredClone(snapshot);
        });
      },
    });
  });

  it("コールバック未登録時に redo しても例外にならない", () => {
    resetAllStores();
    const project = createProject({ name: "test" });
    useEditorStore.setState({ project });

    useHistoryStore.setState({
      redoStack: [{ kind: "snapshot", snapshot: createProject({ name: "redo" }) }],
    });

    _resetCallbacks();

    useHistoryStore.getState().redo();
    expect(useEditorStore.getState().project!.name).toBe("test");

    registerHistoryCallbacks({
      getCurrentProject: () => useEditorStore.getState().project,
      restoreProject: (snapshot) => {
        useEditorStore.setState((s) => {
          s.project = structuredClone(snapshot);
        });
      },
    });
  });

  describe("バージョン整合性", () => {
    beforeEach(() => {
      registerHistoryCallbacks({
        getCurrentProject: () => useEditorStore.getState().project,
        restoreProject: (snapshot) => {
          useEditorStore.setState((s) => {
            s.project = structuredClone(snapshot);
            s.projectStructureVersion += 1;
          });
        },
      });
    });

    it("Undo で projectStructureVersion が bump される", () => {
      const projectA = createProject({ name: "A" });
      const projectB = createProject({ name: "B" });

      useEditorStore.setState({
        project: structuredClone(projectA),
        projectStructureVersion: 0,
        projectVersion: 0,
      });

      useHistoryStore.getState().pushState(structuredClone(projectA));
      useEditorStore.setState({ project: structuredClone(projectB) });
      const beforeUndoStructure = useEditorStore.getState().projectStructureVersion;

      useHistoryStore.getState().undo();

      const afterUndo = useEditorStore.getState();
      expect(afterUndo.projectStructureVersion).toBe(beforeUndoStructure + 1);
      expect(afterUndo.project?.name).toBe("A");
    });

    it("Redo で projectStructureVersion が bump される", () => {
      const projectA = createProject({ name: "A" });
      const projectB = createProject({ name: "B" });

      useEditorStore.setState({
        project: structuredClone(projectA),
        projectStructureVersion: 0,
        projectVersion: 0,
      });

      useHistoryStore.getState().pushState(structuredClone(projectA));
      useEditorStore.setState({ project: structuredClone(projectB) });
      useHistoryStore.getState().undo();
      const beforeRedoStructure = useEditorStore.getState().projectStructureVersion;

      useHistoryStore.getState().redo();

      const afterRedo = useEditorStore.getState();
      expect(afterRedo.projectStructureVersion).toBe(beforeRedoStructure + 1);
      expect(afterRedo.project?.name).toBe("B");
    });

    it("Undo/Redo で projectVersion は変更されない（fit-to-view を避けるため）", () => {
      const projectA = createProject({ name: "A" });
      const projectB = createProject({ name: "B" });

      useEditorStore.setState({
        project: structuredClone(projectA),
        projectStructureVersion: 0,
        projectVersion: 7,
      });

      useHistoryStore.getState().pushState(structuredClone(projectA));
      useEditorStore.setState({ project: structuredClone(projectB) });

      useHistoryStore.getState().undo();
      expect(useEditorStore.getState().projectVersion).toBe(7);

      useHistoryStore.getState().redo();
      expect(useEditorStore.getState().projectVersion).toBe(7);
    });
  });

  describe("ボーン操作のundo/redo", () => {
    it("ボーン追加をundoで元に戻せる", async () => {
      const { useBoneStore } = await import("@/stores/boneStore");

      const projectBefore = createProject({ layers: [] });
      useEditorStore.setState({ project: structuredClone(projectBefore) });

      useHistoryStore.getState().pushState(structuredClone(projectBefore));

      useBoneStore.getState().addRootBone("テストボーン", 100, 200);

      const afterAdd = useEditorStore.getState().project!;
      expect(afterAdd.layers.filter((l) => l.kind === "bone")).toHaveLength(1);

      // undo
      useHistoryStore.getState().undo();

      const afterUndo = useEditorStore.getState().project!;
      expect(afterUndo.layers.filter((l) => l.kind === "bone")).toHaveLength(0);
    });

    it("ボーン追加のundo後にredoで復元できる", async () => {
      const { useBoneStore } = await import("@/stores/boneStore");

      const projectBefore = createProject({ layers: [] });
      useEditorStore.setState({ project: structuredClone(projectBefore) });

      useHistoryStore.getState().pushState(structuredClone(projectBefore));

      useBoneStore.getState().addRootBone("テストボーン", 100, 200);

      useHistoryStore.getState().undo();
      expect(
        useEditorStore.getState().project!.layers.filter((l) => l.kind === "bone"),
      ).toHaveLength(0);

      useHistoryStore.getState().redo();
      expect(
        useEditorStore.getState().project!.layers.filter((l) => l.kind === "bone"),
      ).toHaveLength(1);
    });
  });

  describe("Invariants", () => {
    beforeEach(() => {
      resetAllStores();
      registerHistoryCallbacks({
        getCurrentProject: () => useEditorStore.getState().project,
        restoreProject: (snapshot) => {
          useEditorStore.setState((s) => {
            s.project = structuredClone(snapshot);
            s.projectStructureVersion += 1;
          });
        },
      });
    });

    it("pushState 後に元のプロジェクトを変更してもスタックのスナップショットは影響を受けない", () => {
      const project = createProject({ name: "original" });
      useHistoryStore.getState().pushState(project);

      project.name = "mutated";

      const entry = useHistoryStore.getState().undoStack[0]!;
      expect(entry.kind).toBe("snapshot");
      if (entry.kind === "snapshot") {
        expect(entry.snapshot.name).toBe("original");
      }
    });

    it("undo → redo を繰り返しても project の値が発散しない", () => {
      const projectA = createProject({ name: "stateA" });
      const projectB = createProject({ name: "stateB" });

      useEditorStore.setState({ project: structuredClone(projectA) });
      useHistoryStore.getState().pushState(structuredClone(projectA));
      useEditorStore.setState({ project: structuredClone(projectB) });

      for (let i = 0; i < 10; i++) {
        useHistoryStore.getState().undo();
        expect(useEditorStore.getState().project!.name).toBe("stateA");
        useHistoryStore.getState().redo();
        expect(useEditorStore.getState().project!.name).toBe("stateB");
      }

      const final = useEditorStore.getState().project!;
      expect(final.width).toBe(projectB.width);
      expect(final.height).toBe(projectB.height);
    });

    it("復元されたプロジェクトは元オブジェクトと別参照", () => {
      const projectA = createProject({ name: "A" });
      const projectB = createProject({ name: "B" });

      useEditorStore.setState({ project: structuredClone(projectA) });
      useHistoryStore.getState().pushState(structuredClone(projectA));
      useEditorStore.setState({ project: structuredClone(projectB) });

      useHistoryStore.getState().undo();

      const restored = useEditorStore.getState().project!;
      const entry = useHistoryStore.getState().redoStack[0]!;
      if (entry.kind === "snapshot") {
        expect(restored).not.toBe(entry.snapshot);
      } else {
        throw new Error("expected snapshot entry");
      }
    });
  });
});


describe("historyStore — pushPatches / undo / redo", () => {
  beforeEach(() => {
    resetEditorStore();
    resetHistoryStore();
    _resetMergeTimer();
    vi.restoreAllMocks();
    registerHistoryCallbacks({
      getCurrentProject: () => useEditorStore.getState().project,
      restoreProject: (snapshot) => {
        useEditorStore.setState((s) => {
          s.project = snapshot;
        });
      },
    });
  });

  it("pushPatches で patch エントリが undoStack に積まれる", () => {
    const patches = [{ op: "replace" as const, path: ["name"], value: "after" }];
    const inversePatches = [{ op: "replace" as const, path: ["name"], value: "before" }];
    useHistoryStore.getState().pushPatches(patches, inversePatches);

    const { undoStack } = useHistoryStore.getState();
    expect(undoStack).toHaveLength(1);
    const entry = undoStack[0]!;
    expect(entry.kind).toBe("patch");
    if (entry.kind === "patch") {
      expect(entry.patches).toEqual(patches);
      expect(entry.inversePatches).toEqual(inversePatches);
    }
  });

  it("patches が空なら pushPatches は何もしない（no-op）", () => {
    useHistoryStore.getState().pushPatches([], []);
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it("mutateProject 経由の undo は inversePatches で元の状態に戻る", async () => {
    const { mutateProject } = await import("@/stores/projectMutator");
    const project = createProject({ name: "before" });
    useEditorStore.setState({ project: structuredClone(project) });

    mutateProject((p) => {
      p.name = "after";
    });
    expect(useEditorStore.getState().project!.name).toBe("after");

    useHistoryStore.getState().undo();
    expect(useEditorStore.getState().project!.name).toBe("before");
  });

  it("mutateProject → undo → redo で元の変更が再適用される", async () => {
    const { mutateProject } = await import("@/stores/projectMutator");
    const project = createProject({ name: "before" });
    useEditorStore.setState({ project: structuredClone(project) });

    mutateProject((p) => {
      p.name = "after";
    });

    useHistoryStore.getState().undo();
    expect(useEditorStore.getState().project!.name).toBe("before");

    useHistoryStore.getState().redo();
    expect(useEditorStore.getState().project!.name).toBe("after");
  });

  it("patch エントリの undo 後 redoStack にも patch エントリが積まれる", async () => {
    const { mutateProject } = await import("@/stores/projectMutator");
    const project = createProject({ name: "before" });
    useEditorStore.setState({ project: structuredClone(project) });

    mutateProject((p) => {
      p.name = "after";
    });
    useHistoryStore.getState().undo();

    const { redoStack } = useHistoryStore.getState();
    expect(redoStack).toHaveLength(1);
    expect(redoStack[0]!.kind).toBe("patch");
  });

  it("mergeKey が同一な連続 mutateProject は 1 エントリにまとまる", async () => {
    const { mutateProject } = await import("@/stores/projectMutator");
    const baseTime = 1000000;
    vi.spyOn(Date, "now").mockReturnValue(baseTime);

    const project = createProject({ name: "original" });
    useEditorStore.setState({ project: structuredClone(project) });

    mutateProject((p) => {
      p.name = "step1";
    }, "slider:name");
    vi.spyOn(Date, "now").mockReturnValue(baseTime + 100);
    mutateProject((p) => {
      p.name = "step2";
    }, "slider:name");
    vi.spyOn(Date, "now").mockReturnValue(baseTime + 200);
    mutateProject((p) => {
      p.name = "step3";
    }, "slider:name");

    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(useEditorStore.getState().project!.name).toBe("step3");

    useHistoryStore.getState().undo();
    expect(useEditorStore.getState().project!.name).toBe("original");
  });

  it("multi-path mergeKey 圧縮: 異なる path の連続編集を 1 undo で完全復元する", async () => {
    const { mutateProject } = await import("@/stores/projectMutator");
    const baseTime = 1000000;
    vi.spyOn(Date, "now").mockReturnValue(baseTime);

    const project = createProject({ name: "size-test", width: 100, height: 200 });
    useEditorStore.setState({ project: structuredClone(project) });

    mutateProject((p) => {
      p.width = 150;
    }, "canvas-resize");
    vi.spyOn(Date, "now").mockReturnValue(baseTime + 100);
    mutateProject((p) => {
      p.height = 250;
    }, "canvas-resize");
    vi.spyOn(Date, "now").mockReturnValue(baseTime + 200);
    mutateProject((p) => {
      p.width = 180;
    }, "canvas-resize");

    expect(useEditorStore.getState().project!.width).toBe(180);
    expect(useEditorStore.getState().project!.height).toBe(250);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(useHistoryStore.getState().undoStack[0]!.kind).toBe("patch");

    useHistoryStore.getState().undo();
    expect(useEditorStore.getState().project!.width).toBe(100);
    expect(useEditorStore.getState().project!.height).toBe(200);

    useHistoryStore.getState().redo();
    expect(useEditorStore.getState().project!.width).toBe(180);
    expect(useEditorStore.getState().project!.height).toBe(250);
  });
});
