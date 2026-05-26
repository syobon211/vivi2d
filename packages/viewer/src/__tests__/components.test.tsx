import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HudOverlay } from "../components/HudOverlay";
import {
  PresetIndicator,
  RecordingIndicator,
  Toast,
  VowelIndicator,
} from "../components/Indicators";
import { MappingBadges } from "../components/MappingBadges";
import { PairingRequestCard } from "../components/PairingRequestCard";
import { SettingsPanel } from "../components/SettingsPanel";
import { Toolbar } from "../components/Toolbar";
import { createT } from "../i18n";
import type { RecordingState } from "../recorder";

// ============================================================
// Toolbar / SettingsPanel / HudOverlay / Indicators / MappingBadges
// ============================================================

afterEach(() => {
  cleanup();
});

const t = createT("ja");
const tEn = createT("en");

// ----------------------------------------------------------
// HudOverlay
// ----------------------------------------------------------
describe("HudOverlay", () => {
  it("FPS・メッシュ数・頂点数を表示する", () => {
    render(<HudOverlay locale="en" stats={{ fps: 60, meshes: 12, vertices: 345 }} />);
    expect(screen.getByText("60 FPS")).toBeInTheDocument();
    expect(screen.getByText("12 meshes")).toBeInTheDocument();
    expect(screen.getByText("345 verts")).toBeInTheDocument();
  });

  it("日本語 locale では統計ラベルも日本語で表示する", () => {
    render(<HudOverlay locale="ja" stats={{ fps: 30, meshes: 2, vertices: 120 }} />);
    expect(screen.getByText("30 FPS")).toBeInTheDocument();
    expect(screen.getByText("2 メッシュ")).toBeInTheDocument();
    expect(screen.getByText("120 頂点")).toBeInTheDocument();
  });

  it("値が 0 でも表示される（非表示化の副作用がない）", () => {
    render(<HudOverlay locale="en" stats={{ fps: 0, meshes: 0, vertices: 0 }} />);
    expect(screen.getByText("0 FPS")).toBeInTheDocument();
    expect(screen.getByText("0 meshes")).toBeInTheDocument();
    expect(screen.getByText("0 verts")).toBeInTheDocument();
  });

  it("pointer-events が none でクリックを奪わない", () => {
    const { container } = render(
      <HudOverlay locale="en" stats={{ fps: 60, meshes: 1, vertices: 2 }} />,
    );
    const hud = container.firstElementChild as HTMLElement;
    expect(hud.style.pointerEvents).toBe("none");
  });
});

// ----------------------------------------------------------
// Indicators
// ----------------------------------------------------------
describe("VowelIndicator", () => {
  it("silent では何も描画しない", () => {
    const { container } = render(<VowelIndicator t={t} vowel="silent" />);
    expect(container.firstChild).toBeNull();
  });

  it("母音 A を翻訳付きで表示する（日本語）", () => {
    render(<VowelIndicator t={t} vowel="a" />);
    expect(screen.getByText("あ")).toBeInTheDocument();
  });

  it("母音 O を英語ロケールで表示する", () => {
    render(<VowelIndicator t={tEn} vowel="o" />);
    expect(screen.getByText("O")).toBeInTheDocument();
  });

  it("5 母音すべてレンダラーが落ちない", () => {
    for (const v of ["a", "i", "u", "e", "o"] as const) {
      const { unmount } = render(<VowelIndicator t={t} vowel={v} />);
      unmount();
    }
  });
});

describe("RecordingIndicator", () => {
  it("赤い点を絶対配置で描画する", () => {
    const { container } = render(<RecordingIndicator />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.style.position).toBe("absolute");
    expect(el.style.borderRadius).toBe("50%");
  });
});

describe("PresetIndicator", () => {
  it("渡されたラベルを表示する", () => {
    render(<PresetIndicator label="Preset A" />);
    expect(screen.getByText("Preset A")).toBeInTheDocument();
  });
});

describe("Toast", () => {
  it("メッセージを中央下部に表示する", () => {
    render(<Toast message="保存しました" />);
    expect(screen.getByText("保存しました")).toBeInTheDocument();
  });
});

// ----------------------------------------------------------
// MappingBadges
// ----------------------------------------------------------
describe("MappingBadges", () => {
  function renderBadges(
    overrides: Partial<{
      mappedCount: number;
      platformFaceMappedCount: number;
      handMappedCount: number;
      poseMappedCount: number;
    }> = {},
  ) {
    return render(
      <MappingBadges
        t={t}
        mappedCount={overrides.mappedCount ?? 0}
        platformFaceMappedCount={overrides.platformFaceMappedCount ?? 0}
        handMappedCount={overrides.handMappedCount ?? 0}
        poseMappedCount={overrides.poseMappedCount ?? 0}
      />,
    );
  }

  it("すべて 0 の場合バッジを表示しない", () => {
    const { container } = renderBadges();
    expect(container.textContent).toBe("");
  });

  it("Face マッピング数だけ表示する", () => {
    renderBadges({ mappedCount: 3 });
    const node = screen.getByText(/顔/);
    expect(node.textContent).toMatch(/3\//);
  });

  it("Hand と Body は他がゼロでも独立に描画する", () => {
    renderBadges({ handMappedCount: 2, poseMappedCount: 4 });
    expect(screen.getByText(/手/)).toBeInTheDocument();
    expect(screen.getByText(/体/)).toBeInTheDocument();
  });

  it("英語ロケールでバッジラベルが Face/Expression map/Hand/Body になる", () => {
    render(
      <MappingBadges
        t={tEn}
        mappedCount={1}
        platformFaceMappedCount={1}
        handMappedCount={1}
        poseMappedCount={1}
      />,
    );
    expect(screen.getByText(/Face/)).toBeInTheDocument();
    expect(screen.getByText(/Expression map 1\/52/)).toBeInTheDocument();
    expect(screen.getByText(/Hand/)).toBeInTheDocument();
    expect(screen.getByText(/Body/)).toBeInTheDocument();
  });
});

// ----------------------------------------------------------
// SettingsPanel
// ----------------------------------------------------------
describe("SettingsPanel", () => {
  function makeProps(
    overrides: Partial<React.ComponentProps<typeof SettingsPanel>> = {},
  ): React.ComponentProps<typeof SettingsPanel> {
    return {
      t,
      loaded: false,
      bgMode: "transparent",
      smoothing: 0.6,
      lipSync: false,
      lipSyncMode: "rms",
      alwaysOnTop: false,
      showHud: true,
      locale: "ja",
      colliderEffects: true,
      recordingFormat: "webm",
      recordingState: "idle" as RecordingState,
      recordingElapsed: 0,
      gamepadActive: false,
      midiActive: false,
      scriptInput: "",
      scriptRunning: false,
      onBgModeChange: vi.fn(),
      onSmoothingChange: vi.fn(),
      onLipSyncModeChange: vi.fn(),
      onToggleAlwaysOnTop: vi.fn(),
      onToggleHud: vi.fn(),
      onSetLocale: vi.fn(),
      onUrlLoad: vi.fn(),
      onToggleColliderEffects: vi.fn(),
      onPlayEffect: vi.fn(),
      onRecordingFormatChange: vi.fn(),
      onToggleRecording: vi.fn(),
      onToggleGamepad: vi.fn(),
      onToggleMidi: vi.fn(),
      onScriptInputChange: vi.fn(),
      onRunScript: vi.fn(),
      onSaveThumbnail: vi.fn(),
      onExportConfig: vi.fn(),
      onImportConfig: vi.fn(),
      ...overrides,
    };
  }

  it("初期状態（loaded=false）ではモデル依存ボタンが描画されない", () => {
    render(<SettingsPanel {...makeProps()} />);
    expect(screen.queryByText(t("recStart"))).toBeNull();
    expect(screen.queryByText(t("gamepadStart"))).toBeNull();
    expect(screen.queryByText(t("scriptRun"))).toBeNull();
    expect(screen.getByText(t("exportConfig"))).toBeInTheDocument();
    expect(screen.getByText(t("importConfig"))).toBeInTheDocument();
  });

  it("loaded=true でモデル依存ボタン群が描画される", () => {
    render(<SettingsPanel {...makeProps({ loaded: true })} />);
    expect(screen.getByText(t("recStart"))).toBeInTheDocument();
    expect(screen.getByText(t("gamepadStart"))).toBeInTheDocument();
    expect(screen.getByText(t("scriptRun"))).toBeInTheDocument();
    expect(screen.getByText(t("saveThumbnail"))).toBeInTheDocument();
  });

  it("bgMode 変更でハンドラが新しい値で呼ばれる", async () => {
    const user = userEvent.setup();
    const onBgModeChange = vi.fn();
    render(<SettingsPanel {...makeProps({ onBgModeChange })} />);
    const select = screen.getByDisplayValue(t("bgTransparent"));
    await user.selectOptions(select, "green");
    expect(onBgModeChange).toHaveBeenCalledWith("green");
  });

  it("smoothing スライダー変更で number に変換された値が渡る", () => {
    const onSmoothingChange = vi.fn();
    render(<SettingsPanel {...makeProps({ onSmoothingChange })} />);
    const slider = document.querySelector("input[type='range']") as HTMLInputElement;
    expect(slider).not.toBeNull();
    fireEvent.change(slider, { target: { value: "0.42" } });
    expect(onSmoothingChange).toHaveBeenCalledWith(0.42);
  });

  it("smoothing の表示が 100% 換算される", () => {
    render(<SettingsPanel {...makeProps({ smoothing: 0.42 })} />);
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("lipSync=true の間は lipSyncMode セレクタが描画されない", () => {
    render(<SettingsPanel {...makeProps({ lipSync: true, loaded: true })} />);
    expect(screen.queryByDisplayValue(t("lipSyncRms"))).toBeNull();
  });

  it("recordingState=processing で録画ボタンが disabled", () => {
    render(
      <SettingsPanel {...makeProps({ loaded: true, recordingState: "processing" })} />,
    );
    const btn = screen.getByText(t("recProcessing")).closest("button");
    expect(btn).not.toBeNull();
    expect(btn).toBeDisabled();
  });

  it("recordingState=recording で経過秒数が表示される", () => {
    render(
      <SettingsPanel
        {...makeProps({
          loaded: true,
          recordingState: "recording",
          recordingElapsed: 7.4,
        })}
      />,
    );
    // Math.floor(7.4) === 7
    expect(screen.getByText(new RegExp(`${t("recStop")} 7s`))).toBeInTheDocument();
  });

  it("英語ロケールで Locale トグルラベルが 'JA' になる", () => {
    render(<SettingsPanel {...makeProps({ t: tEn, locale: "en" })} />);
    expect(screen.getByLabelText(tEn("language"))).toHaveValue("en");
  });

  it("スクリプト入力で Enter キー押下時に onRunScript が発火する", async () => {
    const user = userEvent.setup();
    const onRunScript = vi.fn();
    render(
      <SettingsPanel
        {...makeProps({ loaded: true, onRunScript, scriptInput: "smile" })}
      />,
    );
    const input = screen.getByPlaceholderText(t("scriptPlaceholder"));
    input.focus();
    await user.keyboard("{Enter}");
    expect(onRunScript).toHaveBeenCalledTimes(1);
  });

  it("HUD / 最前面 / ロケール / URL はモデル未ロードでも常時操作できる", async () => {
    const user = userEvent.setup();
    const onToggleHud = vi.fn();
    const onToggleAlwaysOnTop = vi.fn();
    const onSetLocale = vi.fn();
    const onUrlLoad = vi.fn();
    render(
      <SettingsPanel
        {...makeProps({
          onToggleHud,
          onToggleAlwaysOnTop,
          onSetLocale,
          onUrlLoad,
        })}
      />,
    );
    await user.click(screen.getByText(t("stats")));
    await user.click(screen.getByText(t("alwaysOnTopOff")));
    await user.selectOptions(screen.getByLabelText(t("language")), "en");
    await user.click(screen.getByText(t("openUrl")));
    expect(onToggleHud).toHaveBeenCalledTimes(1);
    expect(onToggleAlwaysOnTop).toHaveBeenCalledTimes(1);
    expect(onSetLocale).toHaveBeenCalledWith("en");
    expect(onUrlLoad).toHaveBeenCalledTimes(1);
  });

  it("4つのエフェクトボタンがそれぞれ正しい type で onPlayEffect を呼ぶ", async () => {
    const user = userEvent.setup();
    const onPlayEffect = vi.fn();
    render(<SettingsPanel {...makeProps({ loaded: true, onPlayEffect })} />);
    await user.click(screen.getByText(t("confetti")));
    await user.click(screen.getByText(t("hearts")));
    await user.click(screen.getByText(t("stars")));
    await user.click(screen.getByText(t("sparkles")));
    expect(onPlayEffect).toHaveBeenNthCalledWith(1, "confetti");
    expect(onPlayEffect).toHaveBeenNthCalledWith(2, "hearts");
    expect(onPlayEffect).toHaveBeenNthCalledWith(3, "stars");
    expect(onPlayEffect).toHaveBeenNthCalledWith(4, "sparkles");
  });

  it("gamepadActive / midiActive のラベルは 'Stop' 系が表示される", () => {
    render(
      <SettingsPanel
        {...makeProps({ loaded: true, gamepadActive: true, midiActive: true })}
      />,
    );
    expect(screen.getByText(t("gamepadStop"))).toBeInTheDocument();
    expect(screen.getByText(t("midiStop"))).toBeInTheDocument();
  });
});

describe("PairingRequestCard", () => {
  it("requires a user-entered pairing code without revealing the approval code", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    render(
      <PairingRequestCard
        locale="en"
        busy={false}
        challenge={{
          id: "challenge-1",
          appName: "Sample",
          scopes: ["read:state"],
          originBinding: "no-origin",
          createdAt: Date.now(),
          expiresAt: Date.now() + 90_000,
          badCodeAttempts: 0,
        }}
        onApprove={onApprove}
      />,
    );

    const approve = screen.getByRole("button", { name: "Approve" });
    expect(approve).toBeDisabled();
    await user.type(screen.getByLabelText(/external client/i), "654321");
    await user.click(approve);
    expect(onApprove).toHaveBeenCalledWith("challenge-1", "654321");
  });
});

// ----------------------------------------------------------
// Toolbar
// ----------------------------------------------------------
describe("Toolbar", () => {
  function makeProps(
    overrides: Partial<React.ComponentProps<typeof Toolbar>> = {},
  ): React.ComponentProps<typeof Toolbar> {
    return {
      t,
      loaded: false,
      modelName: "",
      mappedCount: 0,
      platformFaceMappedCount: 0,
      handMappedCount: 0,
      poseMappedCount: 0,
      tracking: false,
      handTracking: false,
      lipSync: false,
      poseTracking: false,
      cameras: [],
      selectedCamera: "",
      error: null,
      panelOpen: false,
      onFileLoad: vi.fn(),
      onToggleTracking: vi.fn(),
      onToggleHandTracking: vi.fn(),
      onToggleLipSync: vi.fn(),
      onTogglePoseTracking: vi.fn(),
      onCameraChange: vi.fn(),
      onTogglePanel: vi.fn(),
      ...overrides,
    };
  }

  it("data-testid で main-toolbar が描画される", () => {
    render(<Toolbar {...makeProps()} />);
    expect(screen.getByTestId("main-toolbar")).toBeInTheDocument();
  });

  it("モデル未ロード時は4トラッキングボタンが disabled", () => {
    render(<Toolbar {...makeProps()} />);
    const buttons = screen.getAllByRole("button");
    const disabledCount = buttons.filter((b) => (b as HTMLButtonElement).disabled).length;
    expect(disabledCount).toBeGreaterThanOrEqual(4);
  });

  it("モデル名が指定されるとモデル名と MappingBadges が描画される", () => {
    render(
      <Toolbar
        {...makeProps({ modelName: "my-char.vivi", mappedCount: 5, loaded: true })}
      />,
    );
    expect(screen.getByText(/my-char\.vivi/)).toBeInTheDocument();
    expect(screen.getAllByText(/顔/).length).toBeGreaterThan(0);
  });

  it("loaded=true でトラッキングボタンが enabled になる", () => {
    render(<Toolbar {...makeProps({ loaded: true })} />);
    const buttons = screen.getAllByRole("button");
    const enabledCount = buttons.filter((b) => !(b as HTMLButtonElement).disabled).length;
    expect(enabledCount).toBeGreaterThanOrEqual(5);
  });

  it("エラー文字列が赤色で表示される", () => {
    render(<Toolbar {...makeProps({ error: "マイク接続エラー" })} />);
    expect(screen.getByText("マイク接続エラー")).toBeInTheDocument();
  });

  it("cameras.length > 1 でカメラセレクタが表示される", () => {
    const cameras = [
      {
        deviceId: "a",
        label: "Camera A",
        kind: "videoinput" as MediaDeviceKind,
        groupId: "1",
        toJSON: () => ({}),
      },
      {
        deviceId: "b",
        label: "Camera B",
        kind: "videoinput" as MediaDeviceKind,
        groupId: "1",
        toJSON: () => ({}),
      },
    ] as MediaDeviceInfo[];
    render(<Toolbar {...makeProps({ cameras })} />);
    expect(screen.getByText("Camera A")).toBeInTheDocument();
    expect(screen.getByText("Camera B")).toBeInTheDocument();
  });

  it("cameras.length <= 1 ではカメラセレクタが描画されない", () => {
    render(<Toolbar {...makeProps({ cameras: [] })} />);
    expect(screen.queryByText(t("defaultCamera"))).toBeNull();
  });

  it("label 無しカメラはデバイスIDの接頭辞でラベルフォールバックされる", () => {
    const cameras = [
      {
        deviceId: "aaa",
        label: "",
        kind: "videoinput" as MediaDeviceKind,
        groupId: "1",
        toJSON: () => ({}),
      },
      {
        deviceId: "bbbbbbbbbbbbb",
        label: "",
        kind: "videoinput" as MediaDeviceKind,
        groupId: "1",
        toJSON: () => ({}),
      },
    ] as MediaDeviceInfo[];
    render(<Toolbar {...makeProps({ cameras })} />);
    expect(screen.getByText(/bbbbbbbb/)).toBeInTheDocument();
  });

  it("歯車ボタンをクリックすると onTogglePanel が呼ばれる", async () => {
    const user = userEvent.setup();
    const onTogglePanel = vi.fn();
    render(<Toolbar {...makeProps({ onTogglePanel })} />);
    await user.click(screen.getByTestId("settings-toggle"));
    expect(onTogglePanel).toHaveBeenCalledTimes(1);
  });

  it("ファイル入力に .vivi を投入すると onFileLoad が呼ばれる", async () => {
    const user = userEvent.setup();
    const onFileLoad = vi.fn();
    render(<Toolbar {...makeProps({ onFileLoad })} />);
    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    expect(input).not.toBeNull();
    const file = new File(["x"], "model.vivi", { type: "application/octet-stream" });
    await user.upload(input, file);
    expect(onFileLoad).toHaveBeenCalledTimes(1);
    expect(onFileLoad.mock.calls[0][0].name).toBe("model.vivi");
  });

  it("tracking=true の間は cameras セレクタが disabled", () => {
    const cameras = [
      {
        deviceId: "a",
        label: "A",
        kind: "videoinput" as MediaDeviceKind,
        groupId: "1",
        toJSON: () => ({}),
      },
      {
        deviceId: "b",
        label: "B",
        kind: "videoinput" as MediaDeviceKind,
        groupId: "1",
        toJSON: () => ({}),
      },
    ] as MediaDeviceInfo[];
    render(<Toolbar {...makeProps({ cameras, tracking: true })} />);
    const select = screen.getByDisplayValue(t("defaultCamera")) as HTMLSelectElement;
    expect(select.disabled).toBe(true);
  });
});
