import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "@/lib/i18n";
import {
  clearTextures,
  getTexture,
  getTextureStoreRevision,
  setTexture,
  snapshotTextureCanvas,
  type TextureHistoryEffect,
} from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import {
  _resetCallbacks,
  _resetMergeTimer,
  prepareHistorySnapshot,
  registerHistoryCallbacks,
  useHistoryStore,
} from "@/stores/historyStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { createProject } from "@/test/fixtures";
import { installRasterCanvas } from "@/test/raster-canvas";
import { resetAllStores, resetEditorStore, resetHistoryStore } from "@/test/store-reset";

describe("historyStore", () => {
  beforeEach(() => {
    resetEditorStore();
    resetHistoryStore();
    _resetMergeTimer();
    vi.restoreAllMocks();
  });

  describe("atomic texture history", () => {
    let raster: ReturnType<typeof installRasterCanvas>;
    beforeEach(() => {
      clearTextures();
      raster = installRasterCanvas();
    });
    afterEach(() => {
      clearTextures();
      vi.restoreAllMocks();
    });

    function committedEffect(id: string): TextureHistoryEffect {
      const oldCanvas = raster.create(1, 1, 10);
      const canvas = raster.create(2, 2, 20);
      const before = snapshotTextureCanvas(id, oldCanvas);
      const after = snapshotTextureCanvas(id, canvas);
      setTexture(id, canvas);
      return {
        kind: "texture",
        undo: {
          createdTextureIds: [],
          restoredTextures: [before],
          expectedCurrentHash: { [id]: after.hash },
          expectedCurrentDimensions: { [id]: { width: 2, height: 2 } },
        },
        redo: {
          promotedTextures: [{ textureId: id, canvas, snapshot: after }],
          expectedCurrentHash: { [id]: before.hash },
          expectedCurrentDimensions: { [id]: { width: 1, height: 1 } },
        },
        rendererInvalidation: "projectStructureVersion",
      };
    }

    it("restores exact old/new project, pixels, and dimensions through one undo/redo", () => {
      const effect = committedEffect("layer");
      useHistoryStore
        .getState()
        .pushState(createProject({ name: "before" }), undefined, [effect]);
      useEditorStore.setState({
        project: createProject({ name: "after" }),
        projectStructureVersion: 20,
      });
      const retained = getTexture("layer")!;
      useHistoryStore.getState().undo();
      expect(useEditorStore.getState().project!.name).toBe("before");
      expect(useEditorStore.getState().projectStructureVersion).toBe(21);
      expect(getTexture("layer")!.width).toBe(1);
      expect(raster.read(getTexture("layer")!)).toEqual([10, 10, 10, 10]);
      retained
        .getContext("2d")!
        .putImageData(new ImageData(new Uint8ClampedArray(16).fill(99), 2, 2), 0, 0);
      useHistoryStore.getState().redo();
      expect(useEditorStore.getState().project!.name).toBe("after");
      expect(useEditorStore.getState().projectStructureVersion).toBe(22);
      expect(getTexture("layer")!.width).toBe(2);
      expect(getTexture("layer")!.height).toBe(2);
      expect(raster.read(getTexture("layer")!)).toEqual(new Array(16).fill(20));
      expect(useHistoryStore.getState().undoStack).toHaveLength(1);
      expect(useHistoryStore.getState().redoStack).toHaveLength(0);
    });

    it.each([
      "undo",
      "redo",
    ] as const)("%s prepares all resources before changing live state", (direction) => {
      const effects = [committedEffect("first"), committedEffect("second")];
      useHistoryStore
        .getState()
        .pushState(createProject({ name: "before" }), undefined, effects);
      useEditorStore.setState({ project: createProject({ name: "after" }) });
      if (direction === "redo") useHistoryStore.getState().undo();
      const editor = useEditorStore.getState();
      const history = useHistoryStore.getState();
      const first = getTexture("first");
      const second = getTexture("second");
      const revision = getTextureStoreRevision();
      const notify = vi.spyOn(useNotificationStore.getState(), "addNotification");
      const createElement = document.createElement.bind(document);
      vi.spyOn(document, "createElement")
        .mockImplementationOnce(createElement)
        .mockImplementationOnce(() => {
          throw new Error("C:/private/source.psd decoder detail");
        });
      useHistoryStore.getState()[direction]();
      expect(useEditorStore.getState().project).toBe(editor.project);
      expect(useEditorStore.getState().projectStructureVersion).toBe(
        editor.projectStructureVersion,
      );
      expect(useHistoryStore.getState().undoStack).toBe(history.undoStack);
      expect(useHistoryStore.getState().redoStack).toBe(history.redoStack);
      expect(getTexture("first")).toBe(first);
      expect(getTexture("second")).toBe(second);
      expect(getTextureStoreRevision()).toBe(revision);
      expect(notify).toHaveBeenCalledWith(
        "error",
        t(direction === "undo" ? "notify.undoFailed" : "notify.redoFailed"),
      );
    });

    it("rolls back project, renderer version, textures, and history after a store subscriber throws", () => {
      const effect = committedEffect("layer");
      useHistoryStore
        .getState()
        .pushState(createProject({ name: "before" }), undefined, [effect]);
      useEditorStore.setState({
        project: createProject({ name: "after" }),
        projectVersion: 7,
        projectStructureVersion: 20,
      });
      const editor = useEditorStore.getState();
      const history = useHistoryStore.getState();
      const canvas = getTexture("layer");
      const revision = getTextureStoreRevision();
      const setState = useEditorStore.setState;
      vi.spyOn(useEditorStore, "setState").mockImplementationOnce(
        (...args: Parameters<typeof setState>) => {
          setState(...args);
          throw new Error("private source metadata");
        },
      );
      const notify = vi.spyOn(useNotificationStore.getState(), "addNotification");
      useHistoryStore.getState().undo();
      expect(useEditorStore.getState().project).toBe(editor.project);
      expect(useEditorStore.getState().projectVersion).toBe(7);
      expect(useEditorStore.getState().projectStructureVersion).toBe(20);
      expect(useHistoryStore.getState().undoStack).toBe(history.undoStack);
      expect(useHistoryStore.getState().redoStack).toBe(history.redoStack);
      expect(getTexture("layer")).toBe(canvas);
      expect(getTextureStoreRevision()).toBe(revision);
      expect(notify).toHaveBeenCalledWith("error", t("notify.undoFailed"));
    });

    it("rolls back an already installed history position when its subscriber throws", () => {
      const effect = committedEffect("layer");
      useHistoryStore
        .getState()
        .pushState(createProject({ name: "before" }), undefined, [effect]);
      useEditorStore.setState({
        project: createProject({ name: "after" }),
        projectStructureVersion: 20,
      });
      const editor = useEditorStore.getState();
      const history = useHistoryStore.getState();
      const canvas = getTexture("layer");
      const revision = getTextureStoreRevision();
      const setState = useHistoryStore.setState;
      vi.spyOn(useHistoryStore, "setState").mockImplementationOnce(
        (...args: Parameters<typeof setState>) => {
          setState(...args);
          throw new Error("history subscriber failure");
        },
      );
      useHistoryStore.getState().undo();
      expect(useEditorStore.getState().project).toBe(editor.project);
      expect(useEditorStore.getState().projectStructureVersion).toBe(20);
      expect(useHistoryStore.getState().undoStack).toBe(history.undoStack);
      expect(useHistoryStore.getState().redoStack).toBe(history.redoStack);
      expect(getTexture("layer")).toBe(canvas);
      expect(getTextureStoreRevision()).toBe(revision);
    });

    it("finishes reverse-project snapshot preparation before touching textures", () => {
      const effect = committedEffect("layer");
      useHistoryStore
        .getState()
        .pushState(createProject({ name: "before" }), undefined, [effect]);
      useEditorStore.setState({ project: createProject({ name: "after" }) });
      const editor = useEditorStore.getState();
      const history = useHistoryStore.getState();
      const canvas = getTexture("layer");
      const revision = getTextureStoreRevision();
      vi.spyOn(globalThis, "structuredClone").mockImplementationOnce(() => {
        throw new Error("snapshot preparation failure");
      });
      useHistoryStore.getState().undo();
      expect(useEditorStore.getState().project).toBe(editor.project);
      expect(useHistoryStore.getState().undoStack).toBe(history.undoStack);
      expect(useHistoryStore.getState().redoStack).toBe(history.redoStack);
      expect(getTexture("layer")).toBe(canvas);
      expect(getTextureStoreRevision()).toBe(revision);
    });

    it("prepares a bounded snapshot entry and restores exact stack identities on rollback", () => {
      for (let index = 0; index < 50; index += 1) {
        useHistoryStore.getState().pushState(createProject({ name: String(index) }));
      }
      const before = useHistoryStore.getState();
      const project = createProject({ name: "prepared" });
      const prepared = prepareHistorySnapshot(project, []);
      project.name = "changed after preparation";
      expect(useHistoryStore.getState().undoStack).toBe(before.undoStack);
      prepared.commit();
      expect(useHistoryStore.getState().undoStack).toHaveLength(50);
      expect(useHistoryStore.getState().undoStack[49]).toMatchObject({
        snapshot: { name: "prepared" },
      });
      prepared.rollback();
      expect(useHistoryStore.getState().undoStack).toBe(before.undoStack);
      expect(useHistoryStore.getState().redoStack).toBe(before.redoStack);
    });

    it("restores merge timers even when a rollback subscriber throws", () => {
      vi.spyOn(Date, "now").mockReturnValue(1_000_000);
      useHistoryStore.getState().pushState(createProject({ name: "before" }), "gesture");
      const prepared = prepareHistorySnapshot(createProject({ name: "prepared" }), []);
      prepared.commit();
      const setState = useHistoryStore.setState;
      vi.spyOn(useHistoryStore, "setState").mockImplementationOnce(
        (...args: Parameters<typeof setState>) => {
          setState(...args);
          throw new Error("rollback subscriber failure");
        },
      );
      expect(() => prepared.rollback()).toThrow(/subscriber/);
      useHistoryStore
        .getState()
        .pushState(createProject({ name: "continuation" }), "gesture");
      expect(useHistoryStore.getState().undoStack).toHaveLength(1);
      expect(useHistoryStore.getState().undoStack[0]).toMatchObject({
        snapshot: { name: "before" },
      });
    });
  });

  // ----------------------------------------------------------
  // pushState
  // ----------------------------------------------------------

  describe("pushState", () => {
    it("snapshotの保存・undo・redoは途中の両stackとプロジェクトを保持する", () => {
      // The module import registers editorStore\'s production callback; no test callback is installed here.
      useEditorStore.setState({ projectStructureVersion: 11, projectVersion: 7 });
      const before = createProject({ name: "変更前" });
      useHistoryStore.getState().pushState(before);
      expect(useHistoryStore.getState().undoStack).toMatchObject([
        { kind: "snapshot", snapshot: { name: "変更前" } },
      ]);
      useEditorStore.setState({ project: createProject({ name: "変更後" }) });
      useHistoryStore.getState().undo();
      expect(useEditorStore.getState().project!.name).toBe("変更前");
      expect(useEditorStore.getState().projectStructureVersion).toBe(12);
      expect(useEditorStore.getState().projectVersion).toBe(7);
      expect(useHistoryStore.getState().undoStack).toEqual([]);
      expect(useHistoryStore.getState().redoStack).toMatchObject([
        { kind: "snapshot", snapshot: { name: "変更後" } },
      ]);
      useHistoryStore.getState().redo();
      expect(useEditorStore.getState().project!.name).toBe("変更後");
      expect(useEditorStore.getState().projectStructureVersion).toBe(13);
      expect(useEditorStore.getState().projectVersion).toBe(7);
      expect(useHistoryStore.getState().redoStack).toEqual([]);
      expect(useHistoryStore.getState().undoStack).toMatchObject([
        { kind: "snapshot", snapshot: { name: "変更前" } },
      ]);
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
      useHistoryStore.getState().pushState(projectB);
      useEditorStore.setState({ project: createProject({ name: "C" }) });
      useHistoryStore.getState().undo();
      expect(useHistoryStore.getState().undoStack).toHaveLength(1);
      expect(useHistoryStore.getState().redoStack).toHaveLength(1);
      useHistoryStore.getState().clear();
      expect(useHistoryStore.getState().undoStack).toEqual([]);
      expect(useHistoryStore.getState().redoStack).toEqual([]);
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
      const clock = vi.spyOn(Date, "now").mockReturnValue(baseTime);
      const projectA = createProject({ name: "A" });
      const projectB = createProject({ name: "B" });
      useHistoryStore.getState().pushState(projectA, "same-key");
      clock.mockReturnValue(baseTime + 1000);
      useHistoryStore.getState().pushState(projectB, "same-key");
      useEditorStore.setState({ project: createProject({ name: "current" }) });
      useHistoryStore.getState().undo();
      expect(useHistoryStore.getState().undoStack).toHaveLength(1);
      // Still inside the previous push's merge interval with the same merge key.
      useHistoryStore.getState().pushState(createProject({ name: "C" }), "same-key");
      expect(useHistoryStore.getState().undoStack).toMatchObject([
        { kind: "snapshot", snapshot: { name: "A" } },
        { kind: "snapshot", snapshot: { name: "C" } },
      ]);
      expect(useHistoryStore.getState().redoStack).toEqual([]);
    });
  });
});

describe("historyStore — エッジケース", () => {
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

  describe("ボーン操作のundo/redo", () => {
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
      useEditorStore.setState({ project: structuredClone(projectA) });
      useHistoryStore.getState().pushState(projectA);
      const entry = useHistoryStore.getState().undoStack[0]!;
      if (entry.kind !== "snapshot") throw new Error("expected snapshot entry");
      const storedSnapshot = entry.snapshot;
      useEditorStore.setState({ project: createProject({ name: "B" }) });
      useHistoryStore.getState().undo();
      const restored = useEditorStore.getState().project!;
      expect(restored).toEqual(projectA);
      expect(restored).not.toBe(storedSnapshot);
      expect(restored).not.toBe(projectA);
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

  it("patchのforward/inverse値とundo/redoのentry種類を保持する", async () => {
    const { mutateProject } = await import("@/stores/projectMutator");
    useEditorStore.setState({ project: createProject({ name: "before" }) });
    mutateProject((project) => {
      project.name = "after";
    });
    expect(useEditorStore.getState().project!.name).toBe("after");
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(useHistoryStore.getState().undoStack[0]!.kind).toBe("patch");
    useHistoryStore.getState().undo();
    expect(useEditorStore.getState().project!.name).toBe("before");
    expect(useHistoryStore.getState().undoStack).toEqual([]);
    expect(useHistoryStore.getState().redoStack).toHaveLength(1);
    expect(useHistoryStore.getState().redoStack[0]!.kind).toBe("patch");
    useHistoryStore.getState().redo();
    expect(useEditorStore.getState().project!.name).toBe("after");
    expect(useHistoryStore.getState().redoStack).toEqual([]);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(useHistoryStore.getState().undoStack[0]!.kind).toBe("patch");
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
