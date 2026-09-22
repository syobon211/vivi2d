import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnimationClip } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPixiAppRefs } from "@/hooks/usePixiApp";
import * as mediaExporter from "@/lib/export/media-exporter";
import { useEditorStore } from "@/stores/editorStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { createProject } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";
import { MediaExportDialog } from "../MediaExportDialog";

vi.mock("@/hooks/usePixiApp", () => ({
  getPixiAppRefs: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/export/media-exporter", () => ({
  exportPngSequence: vi.fn().mockResolvedValue(30),
  exportMp4: vi.fn().mockResolvedValue(undefined),
}));

function createClip(overrides?: Partial<AnimationClip>): AnimationClip {
  return {
    id: crypto.randomUUID(),
    name: "TestClip",
    duration: 60,
    fps: 30,
    tracks: [],
    ...overrides,
  };
}

describe("MediaExportDialog", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    resetAllStores();
    vi.clearAllMocks();
  });

  it("プロジェクトがない場合は何もレンダリングしない", () => {
    const { container } = render(<MediaExportDialog onClose={onClose} />);
    expect(container.innerHTML).toBe("");
  });

  it("クリップがない場合はエクスポートボタンが無効化される", () => {
    const project = createProject({ scenes: [{ id: "s1", name: "S", clips: [] }] });
    useEditorStore.setState({ project, projectVersion: 1 });

    render(<MediaExportDialog onClose={onClose} />);

    const exportBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.match(/エクスポート|Export/i));
    expect(exportBtn).toBeDisabled();
  });

  it("閉じるボタンでonCloseが呼ばれる", () => {
    const clip = createClip();
    const project = createProject({ scenes: [{ id: "s1", name: "S", clips: [clip] }] });
    useEditorStore.setState({ project, projectVersion: 1 });

    render(<MediaExportDialog onClose={onClose} />);

    const closeBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.match(/閉じる|Close/i));
    if (closeBtn) fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("オーバーレイクリックでonCloseが呼ばれる", () => {
    const clip = createClip();
    const project = createProject({ scenes: [{ id: "s1", name: "S", clips: [clip] }] });
    useEditorStore.setState({ project, projectVersion: 1 });

    render(<MediaExportDialog onClose={onClose} />);

    const overlay = document.querySelector(".modal-overlay");
    if (overlay) fireEvent.click(overlay);

    expect(onClose).toHaveBeenCalled();
  });

  it("PixiJS未初期化時はエラー通知される", async () => {
    vi.mocked(getPixiAppRefs).mockReturnValue(null);
    const clip = createClip();
    const project = createProject({ scenes: [{ id: "s1", name: "S", clips: [clip] }] });
    useEditorStore.setState({ project, projectVersion: 1 });
    const addNotification = vi.fn();
    useNotificationStore.setState({ addNotification } as any);

    render(<MediaExportDialog onClose={onClose} />);
    const exportBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.match(/^エクスポート$|^Export$/i));
    fireEvent.click(exportBtn!);

    await waitFor(() => {
      expect(addNotification).toHaveBeenCalledWith(
        "error",
        expect.stringContaining("PixiJS"),
      );
    });
  });

  it("ディレクトリ選択をキャンセルするとエクスポート実行されない", async () => {
    vi.mocked(getPixiAppRefs).mockReturnValue({
      app: { render: vi.fn(), canvas: document.createElement("canvas") } as any,
    } as any);
    (window.electronAPI as any).selectExportDirectory = vi.fn().mockResolvedValue(null);

    const clip = createClip();
    const project = createProject({ scenes: [{ id: "s1", name: "S", clips: [clip] }] });
    useEditorStore.setState({ project, projectVersion: 1 });
    const exportPngSpy = vi.spyOn(mediaExporter, "exportPngSequence");

    render(<MediaExportDialog onClose={onClose} />);
    const exportBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.match(/^エクスポート$|^Export$/i));
    fireEvent.click(exportBtn!);

    await waitFor(() => {
      expect(window.electronAPI.selectExportDirectory).toHaveBeenCalled();
    });
    expect(exportPngSpy).not.toHaveBeenCalled();
  });

  it.each([
    "replaced",
    "preparation-failed",
  ])("does not capture or report success when the display is %s", async (failure) => {
    const draw = vi.fn();
    const refs = {
      app: { render: vi.fn(), canvas: document.createElement("canvas") },
      prepareDisplayFrame: () => {
        if (failure === "preparation-failed") throw Error("PROJECT_DISPLAY_UNAVAILABLE");
      },
      renderDisplay: draw,
    };
    vi.mocked(getPixiAppRefs).mockReturnValue(refs as any);
    window.electronAPI.selectExportDirectory = vi.fn(async () => {
      if (failure === "replaced") vi.mocked(getPixiAppRefs).mockReturnValue(null);
      return "/tmp/export";
    });
    // Exercise the actual dialog adapter, not just the mocked export invocation.
    vi.mocked(mediaExporter.exportPngSequence).mockImplementationOnce(async (app) => {
      app.render();
      return 1;
    });
    useEditorStore.setState({
      project: createProject({
        scenes: [{ id: "s1", name: "S", clips: [createClip()] }],
      }),
      projectVersion: 1,
    });
    const notify = vi.fn();
    useNotificationStore.setState({ addNotification: notify });
    render(<MediaExportDialog onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /^エクスポート$|^Export$/i }));
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        "error",
        expect.stringContaining("PROJECT_DISPLAY_UNAVAILABLE"),
      ),
    );
    expect(draw).not.toHaveBeenCalled();
    expect(refs.app.render).not.toHaveBeenCalled();
    expect(notify.mock.calls.some(([kind]) => kind === "info")).toBe(false);
  });

  it("PNG連番エクスポートが成功すると通知される", async () => {
    vi.mocked(getPixiAppRefs).mockReturnValue({
      app: { render: vi.fn(), canvas: document.createElement("canvas") } as any,
    } as any);
    (window.electronAPI as any).selectExportDirectory = vi
      .fn()
      .mockResolvedValue("/tmp/export");

    vi.mocked(mediaExporter.exportPngSequence).mockResolvedValue(30);

    const clip = createClip({ name: "Walk", duration: 90, fps: 30 });
    const project = createProject({ scenes: [{ id: "s1", name: "S", clips: [clip] }] });
    useEditorStore.setState({ project, projectVersion: 1 });
    const addNotification = vi.fn();
    useNotificationStore.setState({ addNotification } as any);

    render(<MediaExportDialog onClose={onClose} />);
    expect(screen.getByText(/メディア|Media/i)).toBeInTheDocument();
    expect(screen.getByText(/Walk/)).toBeInTheDocument();
    expect(screen.getByText(/3\.00秒/)).toBeInTheDocument();
    expect(screen.getByText(/フレーム数.*90/)).toBeInTheDocument();
    expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(1);
    const exportBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.match(/^エクスポート$|^Export$/i));
    fireEvent.click(exportBtn!);

    await waitFor(() => {
      expect(mediaExporter.exportPngSequence).toHaveBeenCalledWith(
        expect.objectContaining({ canvas: expect.any(HTMLCanvasElement) }),
        project,
        clip.id,
        "/tmp/export",
        expect.any(Function),
      );
      expect(addNotification).toHaveBeenCalledWith(
        "info",
        expect.stringContaining("30枚"),
      );
    });
  });

  it("MP4フォーマットに変更して実行するとexportMp4が呼ばれる", async () => {
    vi.mocked(getPixiAppRefs).mockReturnValue({
      app: { render: vi.fn(), canvas: document.createElement("canvas") } as any,
    } as any);
    (window.electronAPI as any).selectExportDirectory = vi
      .fn()
      .mockResolvedValue("/tmp/export");
    vi.mocked(mediaExporter.exportMp4).mockResolvedValue(undefined as any);

    const clip = createClip();
    const project = createProject({ scenes: [{ id: "s1", name: "S", clips: [clip] }] });
    useEditorStore.setState({ project, projectVersion: 1 });

    render(<MediaExportDialog onClose={onClose} />);
    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    fireEvent.change(selects[1]!, { target: { value: "mp4" } });

    expect(screen.getByText(/WebM 動画ファイル/)).toBeInTheDocument();
    const exportBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.match(/^エクスポート$|^Export$/i));
    fireEvent.click(exportBtn!);

    await waitFor(() => {
      expect(mediaExporter.exportMp4).toHaveBeenCalledWith(
        expect.objectContaining({ canvas: expect.any(HTMLCanvasElement) }),
        project,
        clip.id,
        "/tmp/export",
        expect.any(Function),
      );
    });
  });

  it("エクスポート失敗時にエラー通知される", async () => {
    vi.mocked(getPixiAppRefs).mockReturnValue({
      app: { render: vi.fn(), canvas: document.createElement("canvas") } as any,
    } as any);
    (window.electronAPI as any).selectExportDirectory = vi
      .fn()
      .mockResolvedValue("/tmp/export");

    vi.mocked(mediaExporter.exportPngSequence).mockRejectedValue(
      new Error("書き込み失敗"),
    );

    const clip = createClip();
    const project = createProject({ scenes: [{ id: "s1", name: "S", clips: [clip] }] });
    useEditorStore.setState({ project, projectVersion: 1 });
    const addNotification = vi.fn();
    useNotificationStore.setState({ addNotification } as any);

    render(<MediaExportDialog onClose={onClose} />);
    const exportBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.match(/^エクスポート$|^Export$/i));
    fireEvent.click(exportBtn!);

    await waitFor(() => {
      expect(addNotification).toHaveBeenCalledWith(
        "error",
        expect.stringContaining("書き込み失敗"),
      );
    });
  });
});
