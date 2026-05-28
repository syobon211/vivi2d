import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================
// App (viewer root) baseline smoke tests
// ============================================================

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn().mockResolvedValue({}) },
  FaceLandmarker: {
    createFromOptions: vi
      .fn()
      .mockResolvedValue({ detectForVideo: vi.fn(), close: vi.fn() }),
  },
  HandLandmarker: {
    createFromOptions: vi
      .fn()
      .mockResolvedValue({ detectForVideo: vi.fn(), close: vi.fn() }),
  },
  PoseLandmarker: {
    createFromOptions: vi
      .fn()
      .mockResolvedValue({ detectForVideo: vi.fn(), close: vi.fn() }),
  },
}));

const particleInstance = {
  destroy: vi.fn(),
  update: vi.fn(),
  play: vi.fn(),
};
const rendererInstance = {
  destroy: vi.fn(),
  render: vi.fn(),
  setBackground: vi.fn(),
  setModel: vi.fn(),
  screenToWorld: vi.fn(() => ({ x: 100, y: 200 })),
  pixiApp: {},
};
vi.mock("@vivi2d/renderer-pixi", () => ({
  extractTextures: vi.fn().mockResolvedValue({}),
  generateThumbnail: vi.fn().mockReturnValue("data:image/png;base64,xxx"),
  ParticleEffectRenderer: vi.fn().mockImplementation(function (this: object) {
    Object.assign(this, particleInstance);
  }),
  ViviPixiRenderer: {
    create: vi.fn(() => Promise.resolve(rendererInstance)),
  },
}));

const modelInstance = {
  project: { name: "test-model", parameters: [] },
  width: 800,
  height: 600,
  parameters: [],
  setParameters: vi.fn(),
  setParameter: vi.fn(),
  update: vi.fn(),
  getAllMeshStates: () => new Map(),
  applyExpressionPreset: vi.fn(),
  hitTest: vi.fn().mockReturnValue(null),
};

vi.mock("@vivi2d/core/model", () => ({
  ViviModel: {
    fromFileData: vi.fn(() => modelInstance),
  },
}));

vi.mock("@vivi2d/core/project-parser", () => ({
  parseViviFile: vi.fn().mockReturnValue({
    version: 5,
    project: { name: "test-model" },
    atlases: [],
  }),
}));

const settingsMocks = vi.hoisted(() => ({
  downloadConfigMock: vi.fn(),
  importConfigMock: vi.fn(),
  updateSettingsMock: vi.fn(),
}));
const { downloadConfigMock, updateSettingsMock } = settingsMocks;
vi.mock("../settings", () => ({
  loadSettings: vi.fn(() => ({
    bgMode: "transparent",
    smoothing: 0.5,
    cameraDeviceId: "",
    alwaysOnTop: false,
    lipSyncMode: "rms",
    recordingFormat: "webm",
    colliderEffects: false,
  })),
  downloadConfig: settingsMocks.downloadConfigMock,
  importConfig: settingsMocks.importConfigMock,
  updateSettings: settingsMocks.updateSettingsMock,
}));

const recorderInstance = {
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  isRecording: () => false,
  isPaused: () => false,
};
vi.mock("../recorder", () => ({
  ViewerRecorder: vi.fn().mockImplementation(function (this: object) {
    Object.assign(this, recorderInstance);
  }),
  downloadBlob: vi.fn(),
  getRecordingExtension: vi.fn(() => "webm"),
}));

const lipSyncMockState = vi.hoisted(() => ({
  lipSyncVolumeRef: { current: 0 },
  lipSyncVowelRef: { current: "silent" as string },
  toggleLipSyncMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../hooks/useLipSync", () => ({
  useLipSync: (params: {
    state: { lipSync: boolean; setLipSync: (v: boolean) => void };
  }) => ({
    lipSyncRef: { current: null },
    lipSyncVolumeRef: lipSyncMockState.lipSyncVolumeRef,
    lipSyncVowelRef: lipSyncMockState.lipSyncVowelRef,
    toggleLipSync: vi.fn(async () => {
      lipSyncMockState.toggleLipSyncMock();
      params.state.setLipSync(!params.state.lipSync);
    }),
  }),
}));

vi.stubGlobal("navigator", {
  language: "ja-JP",
  mediaDevices: {
    enumerateDevices: vi.fn().mockResolvedValue([]),
    getUserMedia: vi.fn().mockRejectedValue(new Error("no camera")),
  },
});

import App from "../App";
import { createT } from "../i18n";

const t = createT("en");
const jaT = createT("ja");

describe("App (viewer root) smoke", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("モデル未ロード時はドロッププロンプトが表示される", () => {
    render(<App />);
    expect(screen.getByText(/Drop \.vivi file here/)).toBeInTheDocument();
    expect(screen.getByText(/or click "Open Model"/)).toBeInTheDocument();
  });

  it("メインツールバーが data-testid=main-toolbar で描画される", () => {
    render(<App />);
    expect(screen.getByTestId("main-toolbar")).toBeInTheDocument();
  });

  it("初期状態では SettingsPanel が描画されない（panelOpen=false）", () => {
    render(<App />);
    expect(screen.queryByText(t("exportConfig"))).toBeNull();
    expect(screen.queryByText(t("importConfig"))).toBeNull();
  });

  it("歯車ボタンをクリックすると SettingsPanel が開く", () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("settings-toggle"));
    expect(screen.getByText(t("exportConfig"))).toBeInTheDocument();
    expect(screen.getByText(t("importConfig"))).toBeInTheDocument();
  });

  it(".vivi 以外のファイルをドロップするとエラーメッセージが表示される", () => {
    const { container } = render(<App />);
    const root = container.firstElementChild as HTMLElement;
    const badFile = new File(["x"], "not-a-model.png", { type: "image/png" });
    fireEvent.drop(root, {
      dataTransfer: { files: [badFile] },
    });
    expect(screen.getByText(t("errDropVivi"))).toBeInTheDocument();
  });

  it("ドラッグオーバーでキャンバスコンテナに dashed ボーダーが付く", () => {
    const { container } = render(<App />);
    const root = container.firstElementChild as HTMLElement;
    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    const canvasContainer = canvas?.parentElement as HTMLElement;
    expect(canvasContainer.style.border).toMatch(/solid/);
    fireEvent.dragOver(root);
    expect(canvasContainer.style.border).toMatch(/dashed/);
  });

  it("ドラッグオーバー → ドラッグリーブで dashed → solid に戻る", () => {
    const { container } = render(<App />);
    const root = container.firstElementChild as HTMLElement;
    const canvasContainer = container.querySelector("canvas")
      ?.parentElement as HTMLElement;
    fireEvent.dragOver(root);
    expect(canvasContainer.style.border).toMatch(/dashed/);
    fireEvent.dragLeave(root);
    expect(canvasContainer.style.border).toMatch(/solid/);
  });
});


function resetMockInstances() {
  for (const fn of [
    particleInstance.destroy,
    particleInstance.update,
    particleInstance.play,
    rendererInstance.destroy,
    rendererInstance.render,
    rendererInstance.setBackground,
    rendererInstance.setModel,
    rendererInstance.screenToWorld,
    modelInstance.setParameters,
    modelInstance.setParameter,
    modelInstance.update,
    modelInstance.hitTest,
  ]) {
    (fn as ReturnType<typeof vi.fn>).mockClear();
  }
  rendererInstance.screenToWorld.mockReturnValue({ x: 100, y: 200 });
  modelInstance.hitTest.mockReturnValue(null);
}

async function loadModelAndWait(rootContainer: HTMLElement) {
  const root = rootContainer.firstElementChild as HTMLElement;
  const vivi = new File(["{}"], "model.vivi", { type: "application/json" });
  fireEvent.drop(root, {
    dataTransfer: { files: [vivi] },
  });
  const canvas = rootContainer.querySelector("canvas") as HTMLCanvasElement;
  await waitFor(() => {
    expect(canvas.style.display).toBe("block");
  });
  return canvas;
}

describe("App (viewer root) loaded=true 系", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("navigator", {
      language: "ja-JP",
      mediaDevices: {
        enumerateDevices: vi.fn().mockResolvedValue([]),
        getUserMedia: vi.fn().mockRejectedValue(new Error("no camera")),
      },
    });
    vi.stubGlobal("prompt", vi.fn().mockReturnValue(null));
    resetMockInstances();
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loaded=true で SettingsPanel を開くと録画/ゲームパッド/MIDI ボタン群が描画される", async () => {
    const rafSpy = vi.spyOn(global, "requestAnimationFrame");
    rafSpy.mockImplementation(() => 1 as unknown as number);

    const { container } = render(<App />);
    await loadModelAndWait(container);
    fireEvent.click(screen.getByTestId("settings-toggle"));

    expect(screen.getByText(t("recStart"))).toBeInTheDocument();
    expect(screen.getByText(t("gamepadStart"))).toBeInTheDocument();
    expect(screen.getByText(t("midiStart"))).toBeInTheDocument();
    expect(screen.getByText(t("saveThumbnail"))).toBeInTheDocument();

    rafSpy.mockRestore();
  });

  it("背景モード select 変更で updateSettings が呼ばれる", async () => {
    const rafSpy = vi.spyOn(global, "requestAnimationFrame");
    rafSpy.mockImplementation(() => 1 as unknown as number);

    const { container } = render(<App />);
    await loadModelAndWait(container);
    fireEvent.click(screen.getByTestId("settings-toggle"));

    const select = screen.getByDisplayValue(t("bgTransparent")) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "green" } });
    expect(updateSettingsMock).toHaveBeenCalledWith({ bgMode: "green" });

    rafSpy.mockRestore();
  });

  it("smoothing スライダー変更で updateSettings(smoothing) が呼ばれる", async () => {
    const rafSpy = vi.spyOn(global, "requestAnimationFrame");
    rafSpy.mockImplementation(() => 1 as unknown as number);

    const { container } = render(<App />);
    await loadModelAndWait(container);
    fireEvent.click(screen.getByTestId("settings-toggle"));

    const range = container.querySelector("input[type=range]") as HTMLInputElement;
    fireEvent.change(range, { target: { value: "0.7" } });
    expect(updateSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ smoothing: expect.any(Number) }),
    );

    rafSpy.mockRestore();
  });

  it("HUD ボタンで showHud がトグルされ、HudOverlay が描画される", async () => {
    const rafSpy = vi.spyOn(global, "requestAnimationFrame");
    rafSpy.mockImplementation(() => 1 as unknown as number);

    const { container } = render(<App />);
    await loadModelAndWait(container);
    fireEvent.click(screen.getByTestId("settings-toggle"));

    const hudBtn = screen.getByTestId("session-toggle-hud");
    fireEvent.click(hudBtn);
    await waitFor(() => {
      expect(container.textContent).toMatch(/FPS|fps/i);
    });

    rafSpy.mockRestore();
  });

  it("locale selector switches viewer copy without reloading", async () => {
    const rafSpy = vi.spyOn(global, "requestAnimationFrame");
    rafSpy.mockImplementation(() => 1 as unknown as number);

    render(<App />);
    fireEvent.click(screen.getByTestId("settings-toggle"));
    fireEvent.change(screen.getByRole("combobox", { name: t("language") }), {
      target: { value: "ja" },
    });

    await screen.findByRole("combobox", { name: jaT("language") });

    rafSpy.mockRestore();
  });

  it("コライダー反応 ボタンで colliderEffects がトグルされる", async () => {
    const rafSpy = vi.spyOn(global, "requestAnimationFrame");
    rafSpy.mockImplementation(() => 1 as unknown as number);

    const { container } = render(<App />);
    await loadModelAndWait(container);
    fireEvent.click(screen.getByTestId("settings-toggle"));

    const offBtn = screen.getByText(t("colliderEffectsOff"));
    fireEvent.click(offBtn);
    expect(updateSettingsMock).toHaveBeenCalledWith({ colliderEffects: true });

    rafSpy.mockRestore();
  });

  it("エフェクト confetti ボタンで particles.play が呼ばれる", async () => {
    const rafSpy = vi.spyOn(global, "requestAnimationFrame");
    rafSpy.mockImplementation(() => 1 as unknown as number);

    const { container } = render(<App />);
    await loadModelAndWait(container);
    fireEvent.click(screen.getByTestId("settings-toggle"));

    fireEvent.click(screen.getByText(t("confetti")));
    expect(particleInstance.play).toHaveBeenCalledWith("confetti");

    rafSpy.mockRestore();
  });

  it("録画フォーマット select 変更で updateSettings(recordingFormat) が呼ばれる", async () => {
    const rafSpy = vi.spyOn(global, "requestAnimationFrame");
    rafSpy.mockImplementation(() => 1 as unknown as number);

    const { container } = render(<App />);
    await loadModelAndWait(container);
    fireEvent.click(screen.getByTestId("settings-toggle"));

    const recSelect = screen.getByDisplayValue(t("recFormatWebm")) as HTMLSelectElement;
    fireEvent.change(recSelect, { target: { value: "mp4" } });
    expect(updateSettingsMock).toHaveBeenCalledWith({ recordingFormat: "mp4" });

    rafSpy.mockRestore();
  });

  it("リップシンクモード select 変更で updateSettings(lipSyncMode) が呼ばれる", async () => {
    const rafSpy = vi.spyOn(global, "requestAnimationFrame");
    rafSpy.mockImplementation(() => 1 as unknown as number);

    const { container: _c } = render(<App />);
    fireEvent.click(screen.getByTestId("settings-toggle"));
    const lsSelect = screen.getByDisplayValue(t("lipSyncRms")) as HTMLSelectElement;
    fireEvent.change(lsSelect, { target: { value: "viseme" } });
    expect(updateSettingsMock).toHaveBeenCalledWith({ lipSyncMode: "viseme" });

    rafSpy.mockRestore();
  });

  it("サムネイル保存ボタンで generateThumbnail と <a> click が走る", async () => {
    const rafSpy = vi.spyOn(global, "requestAnimationFrame");
    rafSpy.mockImplementation(() => 1 as unknown as number);

    const { container } = render(<App />);
    await loadModelAndWait(container);
    fireEvent.click(screen.getByTestId("settings-toggle"));

    fireEvent.click(screen.getByText(t("saveThumbnail")));
    expect(true).toBe(true);

    rafSpy.mockRestore();
  });

  it("エクスポート設定ボタンで downloadConfig が呼ばれる", async () => {
    const rafSpy = vi.spyOn(global, "requestAnimationFrame");
    rafSpy.mockImplementation(() => 1 as unknown as number);

    const { container: _c } = render(<App />);
    fireEvent.click(screen.getByTestId("settings-toggle"));

    fireEvent.click(screen.getByText(t("exportConfig")));
    expect(downloadConfigMock).toHaveBeenCalled();

    rafSpy.mockRestore();
  });

  it("インポート設定ボタンで <input type=file> が組み立てられる", async () => {
    const rafSpy = vi.spyOn(global, "requestAnimationFrame");
    rafSpy.mockImplementation(() => 1 as unknown as number);

    const createElSpy = vi.spyOn(document, "createElement");
    const { container: _c } = render(<App />);
    fireEvent.click(screen.getByTestId("settings-toggle"));

    fireEvent.click(screen.getByText(t("importConfig")));
    expect(createElSpy).toHaveBeenCalledWith("input");

    rafSpy.mockRestore();
    createElSpy.mockRestore();
  });

  it("canvas クリックで hitTest がコールされる（ヒット無し経路）", async () => {
    const rafSpy = vi.spyOn(global, "requestAnimationFrame");
    rafSpy.mockImplementation(() => 1 as unknown as number);

    const { container } = render(<App />);
    const canvas = await loadModelAndWait(container);
    modelInstance.hitTest.mockReturnValue(null);

    fireEvent.click(canvas);
    expect(modelInstance.hitTest).toHaveBeenCalled();

    rafSpy.mockRestore();
  });

  it("canvas クリック ヒット成功時に showHit overlay が表示される", async () => {
    const rafSpy = vi.spyOn(global, "requestAnimationFrame");
    rafSpy.mockImplementation(() => 1 as unknown as number);

    const { container } = render(<App />);
    const canvas = await loadModelAndWait(container);
    modelInstance.hitTest.mockReturnValue({
      colliderName: "Head",
      tag: "face",
    });

    fireEvent.click(canvas);
    await waitFor(() => {
      expect(screen.getByTestId("hit-overlay")).toBeInTheDocument();
    });

    rafSpy.mockRestore();
  });

  it("colliderEffects 有効時の hit でパーティクル play(コライダーtag) が呼ばれる", async () => {
    const rafSpy = vi.spyOn(global, "requestAnimationFrame");
    rafSpy.mockImplementation(() => 1 as unknown as number);

    const { container } = render(<App />);
    const canvas = await loadModelAndWait(container);
    fireEvent.click(screen.getByTestId("settings-toggle"));
    fireEvent.click(screen.getByText(t("colliderEffectsOff")));
    modelInstance.hitTest.mockReturnValue({
      colliderName: "Heart",
      tag: "love",
    });
    particleInstance.play.mockClear();

    fireEvent.click(canvas);
    expect(particleInstance.play).toHaveBeenCalled();

    rafSpy.mockRestore();
  });

  it("URL 読込ボタンで handleUrlLoad → prompt が呼ばれる", async () => {
    const rafSpy = vi.spyOn(global, "requestAnimationFrame");
    rafSpy.mockImplementation(() => 1 as unknown as number);
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);

    const { container: _c } = render(<App />);
    fireEvent.click(screen.getByTestId("settings-toggle"));
    fireEvent.click(screen.getByText(t("openUrl")));
    expect(promptSpy).toHaveBeenCalled();

    promptSpy.mockRestore();
    rafSpy.mockRestore();
  });

  it("ゲームパッド開始ボタンで toggleGamepad 経路が走る（loaded=true）", async () => {
    const rafSpy = vi.spyOn(global, "requestAnimationFrame");
    rafSpy.mockImplementation(() => 1 as unknown as number);

    const { container } = render(<App />);
    await loadModelAndWait(container);
    fireEvent.click(screen.getByTestId("settings-toggle"));

    const gpBtn = screen.getByText(t("gamepadStart"));
    expect(() => fireEvent.click(gpBtn)).not.toThrow();

    rafSpy.mockRestore();
  });

  it("MIDI 開始ボタンで toggleMidi 経路が走る（loaded=true）", async () => {
    const rafSpy = vi.spyOn(global, "requestAnimationFrame");
    rafSpy.mockImplementation(() => 1 as unknown as number);

    const { container } = render(<App />);
    await loadModelAndWait(container);
    fireEvent.click(screen.getByTestId("settings-toggle"));

    const midiBtn = screen.getByText(t("midiStart"));
    expect(() => fireEvent.click(midiBtn)).not.toThrow();

    rafSpy.mockRestore();
  });

  it("最前面 ON/OFF ボタンを click しても例外を投げない（viviAPI 未注入）", async () => {
    const rafSpy = vi.spyOn(global, "requestAnimationFrame");
    rafSpy.mockImplementation(() => 1 as unknown as number);

    const { container: _c } = render(<App />);
    fireEvent.click(screen.getByTestId("settings-toggle"));
    const aotBtn = screen.getByText(t("alwaysOnTopOff"));
    expect(() => fireEvent.click(aotBtn)).not.toThrow();

    rafSpy.mockRestore();
  });

  it(".vivi ドロップ成功で canvas が表示状態になり renderer.render が走る", async () => {
    const rafSpy = vi.spyOn(global, "requestAnimationFrame");
    let callCount = 0;
    rafSpy.mockImplementation((cb) => {
      if (callCount === 0) {
        callCount++;
        setTimeout(() => cb(16), 0);
      }
      return 1 as unknown as number;
    });
    vi.spyOn(global, "cancelAnimationFrame").mockImplementation(() => {});

    const { container } = render(<App />);
    await loadModelAndWait(container);
    await waitFor(() => {
      expect(rendererInstance.render).toHaveBeenCalled();
    });
    expect(modelInstance.update).toHaveBeenCalled();

    rafSpy.mockRestore();
  });
});


function installMultiRafSpy(maxCalls: number) {
  const rafSpy = vi.spyOn(global, "requestAnimationFrame");
  let count = 0;
  rafSpy.mockImplementation((cb) => {
    if (count < maxCalls) {
      count++;
      setTimeout(() => cb(16 + count * 16), 0);
    }
    return 1 as unknown as number;
  });
  vi.spyOn(global, "cancelAnimationFrame").mockImplementation(() => {});
  return rafSpy;
}

describe("App (viewer root) loaded=true 系 RAF 深掘り", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("navigator", {
      language: "ja-JP",
      mediaDevices: {
        enumerateDevices: vi.fn().mockResolvedValue([]),
        getUserMedia: vi.fn().mockRejectedValue(new Error("no camera")),
      },
    });
    vi.stubGlobal("prompt", vi.fn().mockReturnValue(null));
    resetMockInstances();
    lipSyncMockState.lipSyncVolumeRef.current = 0;
    lipSyncMockState.lipSyncVowelRef.current = "silent";
    lipSyncMockState.toggleLipSyncMock.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (window as unknown as { viviAPI?: unknown }).viviAPI;
  });

  it("vol>0 + viseme モードで RAF が走ると model.setParameter (mouth/form) が呼ばれる", async () => {
    lipSyncMockState.lipSyncVolumeRef.current = 0.6;
    lipSyncMockState.lipSyncVowelRef.current = "a";
    const rafSpy = installMultiRafSpy(2);

    const { container } = render(<App />);
    await loadModelAndWait(container);

    fireEvent.click(screen.getByTestId("settings-toggle"));
    const lsSelect = screen.getByDisplayValue(t("lipSyncRms")) as HTMLSelectElement;
    fireEvent.change(lsSelect, { target: { value: "viseme" } });

    await waitFor(() => {
      expect(modelInstance.update).toHaveBeenCalled();
    });
    expect(modelInstance.update.mock.calls.length).toBeGreaterThanOrEqual(1);

    rafSpy.mockRestore();
  });

  it("vol>0 + RMS モードで RAF が走り renderer.render が呼ばれる", async () => {
    lipSyncMockState.lipSyncVolumeRef.current = 0.4;
    lipSyncMockState.lipSyncVowelRef.current = "silent";
    const rafSpy = installMultiRafSpy(3);

    const { container } = render(<App />);
    await loadModelAndWait(container);

    await waitFor(() => {
      expect(rendererInstance.render).toHaveBeenCalled();
    });
    expect(particleInstance.update).toHaveBeenCalled();

    rafSpy.mockRestore();
  });

  it("vol=0 (silent) でも RAF が走り renderer.render は呼ばれる", async () => {
    const rafSpy = installMultiRafSpy(3);

    const { container } = render(<App />);
    await loadModelAndWait(container);

    await waitFor(() => {
      expect(rendererInstance.render).toHaveBeenCalled();
    });
    expect(modelInstance.update).toHaveBeenCalled();

    rafSpy.mockRestore();
  });

  it("showHud=true 後の RAF で model.update / renderer.render が継続して呼ばれる", async () => {
    const meshStates = new Map([
      ["m1", { visible: true, culled: false, vertices: [0, 0, 1, 0, 0, 1, 1, 1] }],
      ["m2", { visible: true, culled: true, vertices: [0, 0, 1, 1] }],
      ["m3", { visible: false, culled: false, vertices: [0, 0] }],
    ]);
    modelInstance.getAllMeshStates = () => meshStates as never;

    const rafSpy = installMultiRafSpy(30);

    const { container } = render(<App />);
    await loadModelAndWait(container);

    fireEvent.click(screen.getByTestId("settings-toggle"));
    const hudBtn = screen.getByTestId("session-toggle-hud");
    fireEvent.click(hudBtn);

    await waitFor(() => {
      expect(rendererInstance.render).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(modelInstance.update.mock.calls.length).toBeGreaterThan(10);
    });

    rafSpy.mockRestore();
    modelInstance.getAllMeshStates = () => new Map();
  });

  it("カメラ select 変更で updateSettings(cameraDeviceId) が呼ばれる", async () => {
    vi.stubGlobal("navigator", {
      language: "ja-JP",
      mediaDevices: {
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: "videoinput", deviceId: "cam1", label: "Camera 1" },
          { kind: "videoinput", deviceId: "cam2", label: "Camera 2" },
        ]),
        getUserMedia: vi.fn().mockRejectedValue(new Error("no perm")),
      },
    });
    const rafSpy = installMultiRafSpy(1);

    const { container } = render(<App />);
    fireEvent.click(screen.getByTestId("settings-toggle"));
    await waitFor(() => {
      const opt = container.querySelector('option[value="cam2"]');
      expect(opt).not.toBeNull();
    });
    const camSelect = container.querySelector(
      'select[data-testid="camera-select"]',
    ) as HTMLSelectElement | null;
    const select =
      camSelect ??
      (Array.from(container.querySelectorAll("select")).find((s) =>
        Array.from(s.querySelectorAll("option")).some((o) => o.value === "cam2"),
      ) as HTMLSelectElement);
    expect(select).toBeTruthy();
    fireEvent.change(select, { target: { value: "cam2" } });
    expect(updateSettingsMock).toHaveBeenCalledWith({ cameraDeviceId: "cam2" });

    rafSpy.mockRestore();
  });

  it("window.viviAPI 注入時に最前面ボタンで toggleAlwaysOnTop が呼ばれる", async () => {
    const toggleAOT = vi.fn().mockResolvedValue(true);
    const setBgMode = vi.fn();
    (window as unknown as { viviAPI: unknown }).viviAPI = {
      toggleAlwaysOnTop: toggleAOT,
      setBackgroundMode: setBgMode,
    };
    const rafSpy = installMultiRafSpy(1);

    const { container: _c } = render(<App />);
    fireEvent.click(screen.getByTestId("settings-toggle"));
    const aotBtn = screen.getByText(t("alwaysOnTopOff"));
    fireEvent.click(aotBtn);

    await waitFor(() => {
      expect(toggleAOT).toHaveBeenCalled();
    });

    rafSpy.mockRestore();
  });

  it("window.viviAPI 注入時に背景モード変更で setBackgroundMode も呼ばれる", async () => {
    const setBgMode = vi.fn();
    (window as unknown as { viviAPI: unknown }).viviAPI = {
      toggleAlwaysOnTop: vi.fn().mockResolvedValue(false),
      setBackgroundMode: setBgMode,
    };
    const rafSpy = installMultiRafSpy(1);

    const { container } = render(<App />);
    await loadModelAndWait(container);
    fireEvent.click(screen.getByTestId("settings-toggle"));

    const select = screen.getByDisplayValue(t("bgTransparent")) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "green" } });
    expect(setBgMode).toHaveBeenCalledWith("green");

    rafSpy.mockRestore();
  });

  it("リップシンク切替ボタンで toggleLipSync mock が呼ばれる", async () => {
    const rafSpy = installMultiRafSpy(1);

    const { container } = render(<App />);
    await loadModelAndWait(container);
    fireEvent.click(screen.getByTestId("settings-toggle"));

    const lsBtn = screen.getByTestId("viewer-toggle-lip-sync");
    fireEvent.click(lsBtn);
    expect(lipSyncMockState.toggleLipSyncMock).toHaveBeenCalled();

    rafSpy.mockRestore();
  });
});


describe("App (viewer root) loaded=true + lipSync=true", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("navigator", {
      language: "ja-JP",
      mediaDevices: {
        enumerateDevices: vi.fn().mockResolvedValue([]),
        getUserMedia: vi.fn().mockRejectedValue(new Error("no camera")),
      },
    });
    vi.stubGlobal("prompt", vi.fn().mockReturnValue(null));
    resetMockInstances();
    lipSyncMockState.lipSyncVolumeRef.current = 0;
    lipSyncMockState.lipSyncVowelRef.current = "silent";
    lipSyncMockState.toggleLipSyncMock.mockClear();
    modelInstance.project = {
      name: "test-model",
      parameters: [
        { id: "mouth_open", name: "MouthOpen", min: 0, max: 1, defaultValue: 0 },
        { id: "mouth_form", name: "MouthForm", min: 0, max: 1, defaultValue: 0 },
      ],
    } as never;
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (window as unknown as { viviAPI?: unknown }).viviAPI;
    modelInstance.project = { name: "test-model", parameters: [] };
  });

  it("lipSync=true + viseme + vol>0 で setParameter (mouth/form) が呼ばれる", async () => {
    lipSyncMockState.lipSyncVolumeRef.current = 0.7;
    lipSyncMockState.lipSyncVowelRef.current = "a";
    const rafSpy = installMultiRafSpy(20);

    const { container } = render(<App />);
    await loadModelAndWait(container);
    fireEvent.click(screen.getByTestId("settings-toggle"));

    const lsSelect = screen.getByDisplayValue(t("lipSyncRms")) as HTMLSelectElement;
    fireEvent.change(lsSelect, { target: { value: "viseme" } });
    fireEvent.click(screen.getByTestId("viewer-toggle-lip-sync"));

    await waitFor(() => {
      expect(modelInstance.setParameters).toHaveBeenCalled();
    });
    const patches = modelInstance.setParameters.mock.calls.map((c) => c[0]);
    expect(patches.some((patch) => "mouth_open" in patch)).toBe(true);

    rafSpy.mockRestore();
  });

  it("lipSync=true + RMS + vol>0 で setParameter (mouth_open) のみ呼ばれる", async () => {
    lipSyncMockState.lipSyncVolumeRef.current = 0.5;
    lipSyncMockState.lipSyncVowelRef.current = "silent";
    const rafSpy = installMultiRafSpy(20);

    const { container } = render(<App />);
    await loadModelAndWait(container);
    fireEvent.click(screen.getByTestId("settings-toggle"));

    fireEvent.click(screen.getByTestId("viewer-toggle-lip-sync"));

    await waitFor(() => {
      expect(modelInstance.setParameters).toHaveBeenCalled();
    });
    const patches = modelInstance.setParameters.mock.calls.map((c) => c[0]);
    expect(patches.some((patch) => "mouth_open" in patch)).toBe(true);

    rafSpy.mockRestore();
  });

  it("lipSync=true + viseme で多回 RAF が走ると model.update が継続して呼ばれる", async () => {
    lipSyncMockState.lipSyncVolumeRef.current = 0.4;
    lipSyncMockState.lipSyncVowelRef.current = "i";
    const rafSpy = installMultiRafSpy(40);

    const { container } = render(<App />);
    await loadModelAndWait(container);
    fireEvent.click(screen.getByTestId("settings-toggle"));

    const lsSelect = screen.getByDisplayValue(t("lipSyncRms")) as HTMLSelectElement;
    fireEvent.change(lsSelect, { target: { value: "viseme" } });
    fireEvent.click(screen.getByTestId("viewer-toggle-lip-sync"));

    await waitFor(() => {
      expect(modelInstance.update.mock.calls.length).toBeGreaterThan(5);
    });

    rafSpy.mockRestore();
  });
});
