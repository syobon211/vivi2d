import type { ViviFileData } from "@vivi2d/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTextures, setTexture } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import * as projectIO from "@/stores/projectIO";
import { useSelectionStore } from "@/stores/selectionStore";
import { createViviMesh, createProject } from "@/test/fixtures";
import { mockCanvasContext, mockImageLoad } from "@/test/mocks";
import {
  TEST_BAD_VIVI_PATH,
  TEST_EXISTING_TEST_VIVI_PATH,
  TEST_GENERIC_TEST_VIVI_PATH,
  TEST_LOADED_VIVI_PATH,
  TEST_MODEL_VIVI_PATH,
  TEST_NEW_TEST_VIVI_PATH,
  TEST_SAVED_VIVI_PATH,
} from "@/test/path-fixtures";
import { resetEditorStore, resetSelectionStore } from "@/test/store-reset";

describe("editorStore: saveProject / loadProject", () => {
  beforeEach(() => {
    resetEditorStore();
    resetSelectionStore();
    clearTextures();
    mockCanvasContext();
    mockImageLoad();
    vi.mocked(window.electronAPI.saveFile).mockReset();
    vi.mocked(window.electronAPI.openViviFile).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearTextures();
  });

  // ============================================================
  // saveProject
  // ============================================================

  describe("saveProject", () => {
    it("プロジェクト未読み込み時は false を返す", async () => {
      const result = await projectIO.saveProject();
      expect(result).toBe(false);
      expect(window.electronAPI.saveFile).not.toHaveBeenCalled();
    });

    it("プロジェクトを保存して true を返す", async () => {
      const mesh = createViviMesh();
      const project = createProject({ layers: [mesh] });
      setTexture(mesh.id, document.createElement("canvas"));
      useEditorStore.setState({ project, projectVersion: 1 });

      vi.mocked(window.electronAPI.saveFile).mockResolvedValue({
        filePath: TEST_MODEL_VIVI_PATH,
      });

      const result = await projectIO.saveProject();

      expect(result).toBe(true);
      expect(window.electronAPI.saveFile).toHaveBeenCalledOnce();
      const callArgs = vi.mocked(window.electronAPI.saveFile).mock.calls[0]![0];
      expect(callArgs.defaultName).toBe(`${project.name}.vivi`);
      expect(JSON.parse(callArgs.data!).version).toBe(9);
    });

    it("保存後に currentFilePath が更新される", async () => {
      const project = createProject({ layers: [] });
      useEditorStore.setState({ project, projectVersion: 1 });

      vi.mocked(window.electronAPI.saveFile).mockResolvedValue({
        filePath: TEST_SAVED_VIVI_PATH,
      });

      await projectIO.saveProject();
      expect(useEditorStore.getState().currentFilePath).toBe(TEST_SAVED_VIVI_PATH);
    });

    it("キャンセル時は false を返し currentFilePath を変更しない", async () => {
      const project = createProject({ layers: [] });
      useEditorStore.setState({ project, projectVersion: 1 });

      vi.mocked(window.electronAPI.saveFile).mockResolvedValue(null);

      const result = await projectIO.saveProject();
      expect(result).toBe(false);
      expect(useEditorStore.getState().currentFilePath).toBeNull();
    });

    it("上書き保存時は既存の filePath を渡す", async () => {
      const project = createProject({ layers: [] });
      useEditorStore.setState({
        project,
        projectVersion: 1,
        currentFilePath: TEST_EXISTING_TEST_VIVI_PATH,
      });

      vi.mocked(window.electronAPI.saveFile).mockResolvedValue({
        filePath: TEST_EXISTING_TEST_VIVI_PATH,
      });

      await projectIO.saveProject(false);

      const callArgs = vi.mocked(window.electronAPI.saveFile).mock.calls[0]![0];
      expect(callArgs.filePath).toBe(TEST_EXISTING_TEST_VIVI_PATH);
    });

    it("名前を付けて保存時は filePath を渡さない", async () => {
      const project = createProject({ layers: [] });
      useEditorStore.setState({
        project,
        projectVersion: 1,
        currentFilePath: TEST_EXISTING_TEST_VIVI_PATH,
      });

      vi.mocked(window.electronAPI.saveFile).mockResolvedValue({
        filePath: TEST_NEW_TEST_VIVI_PATH,
      });

      await projectIO.saveProject(true);

      const callArgs = vi.mocked(window.electronAPI.saveFile).mock.calls[0]![0];
      expect(callArgs.filePath).toBeUndefined();
    });
  });

  // ============================================================
  // loadProject
  // ============================================================

  describe("loadProject", () => {
    it("キャンセル時は false を返す", async () => {
      vi.mocked(window.electronAPI.openViviFile).mockResolvedValue(null);

      const result = await projectIO.loadProject();
      expect(result).toBe(false);
    });

    it(".vivi ファイルを読み込んでプロジェクトを設定する", async () => {
      const project = createProject({ name: "読み込みテスト", layers: [] });
      const fileData: ViviFileData = {
        version: 1,
        project,
        atlases: [],
      };

      vi.mocked(window.electronAPI.openViviFile).mockResolvedValue({
        data: JSON.stringify(fileData),
        filePath: TEST_LOADED_VIVI_PATH,
      });

      const result = await projectIO.loadProject();

      expect(result).toBe(true);
      const state = useEditorStore.getState();
      expect(state.project).not.toBeNull();
      expect(state.project!.name).toBe("読み込みテスト");
      expect(state.currentFilePath).toBe(TEST_LOADED_VIVI_PATH);
      expect(useSelectionStore.getState().selectedLayerId).toBeNull();
    });

    it("読み込み時に projectVersion がインクリメントされる", async () => {
      useEditorStore.setState({ projectVersion: 5 });
      const fileData: ViviFileData = {
        version: 1,
        project: createProject({ layers: [] }),
        atlases: [],
      };

      vi.mocked(window.electronAPI.openViviFile).mockResolvedValue({
        data: JSON.stringify(fileData),
        filePath: TEST_GENERIC_TEST_VIVI_PATH,
      });

      await projectIO.loadProject();
      expect(useEditorStore.getState().projectVersion).toBe(6);
    });

    it("不正な JSON で false を返す", async () => {
      vi.mocked(window.electronAPI.openViviFile).mockResolvedValue({
        data: "invalid json",
        filePath: TEST_BAD_VIVI_PATH,
      });

      const result = await projectIO.loadProject();
      expect(result).toBe(false);
    });
  });
});
