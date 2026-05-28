import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ContextToolbar } from "../components/ContextToolbar";
import { InputEffectsPanel } from "../components/InputEffectsPanel";
import { SideSheet } from "../components/SideSheet";
import { ViewerShell } from "../components/ViewerShell";
import { ViewerStatusStrip } from "../components/ViewerStatusStrip";
import { ViewerStage } from "../shell/ViewerStage";
import {
  deriveViewerWorkflowModel,
  type ViewerSheetSection,
} from "../components/viewer-workflow";
import { createT } from "../i18n";

const t = createT("en");

function workflow(overrides: Partial<Parameters<typeof deriveViewerWorkflowModel>[0]> = {}) {
  return deriveViewerWorkflowModel({
    loaded: true,
    modelLoading: false,
    recordingState: "idle",
    viewerApiEnabled: false,
    calibrationNeedsAttention: false,
    issues: [],
    ...overrides,
  });
}

describe("ContextToolbar", () => {
  it("preserves App test ids and routes primary actions to the side sheet", () => {
    const onTogglePanel = vi.fn();
    const onPrimaryAction = vi.fn();
    render(
      <ContextToolbar
        t={t}
        locale="en"
        loaded={true}
        modelName="C:/private/hero.vivi"
        mappedCount={1}
        platformFaceMappedCount={0}
        handMappedCount={0}
        poseMappedCount={0}
        tracking={false}
        handTracking={false}
        lipSync={false}
        poseTracking={false}
        error={null}
        panelOpen={false}
        recordingState="idle"
        recordingElapsed={0}
        workflow={workflow()}
        onFileLoad={vi.fn()}
        onTogglePanel={onTogglePanel}
        onPrimaryAction={onPrimaryAction}
        onToggleRecording={vi.fn()}
        onToggleHud={vi.fn()}
      />,
    );

    expect(screen.getByTestId("main-toolbar")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("settings-toggle"));
    expect(onTogglePanel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("workflow-primary-action"));
    expect(onPrimaryAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText("hero")).toBeInTheDocument();
  });

  it("keeps file load wired from the compact toolbar", () => {
    const onFileLoad = vi.fn();
    const { container } = render(
      <ContextToolbar
        t={t}
        locale="en"
        loaded={true}
        modelName="hero.vivi"
        mappedCount={0}
        platformFaceMappedCount={0}
        handMappedCount={0}
        poseMappedCount={0}
        tracking={false}
        handTracking={false}
        lipSync={false}
        poseTracking={false}
        error={null}
        panelOpen={false}
        recordingState="idle"
        recordingElapsed={0}
        workflow={workflow()}
        onFileLoad={onFileLoad}
        onTogglePanel={vi.fn()}
        onPrimaryAction={vi.fn()}
        onToggleRecording={vi.fn()}
        onToggleHud={vi.fn()}
      />,
    );

    const file = new File(["{}"], "hero.vivi");
    const fileInput = container.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(onFileLoad).toHaveBeenCalledWith(file);
  });

  it("uses a single localized open-model CTA before a model is loaded", () => {
    render(
      <ContextToolbar
        t={createT("ja")}
        locale="ja"
        loaded={false}
        modelName=""
        mappedCount={0}
        platformFaceMappedCount={0}
        handMappedCount={0}
        poseMappedCount={0}
        tracking={false}
        handTracking={false}
        lipSync={false}
        poseTracking={false}
        error={null}
        panelOpen={false}
        recordingState="idle"
        recordingElapsed={0}
        workflow={workflow({ loaded: false })}
        onFileLoad={vi.fn()}
        onTogglePanel={vi.fn()}
        onPrimaryAction={vi.fn()}
        onToggleRecording={vi.fn()}
        onToggleHud={vi.fn()}
      />,
    );

    expect(screen.getAllByText("モデルを開く")).toHaveLength(1);
    expect(screen.getByText("モデル未読み込み")).toBeInTheDocument();
    expect(screen.queryByText("Open Model")).toBeNull();
    expect(screen.queryByText("No model")).toBeNull();
    expect(screen.queryByRole("button", { name: "モデル変更" })).toBeNull();
  });
});

describe("InputEffectsPanel", () => {
  it("owns camera, tracking, input device, script, and effect controls", () => {
    const onCameraChange = vi.fn();
    const onToggleLipSync = vi.fn();
    const onRunScript = vi.fn();
    const onPlayEffect = vi.fn();
    const camera = {
      deviceId: "camera-123456789",
      label: "Camera A",
      kind: "videoinput",
      groupId: "group",
      toJSON: () => ({}),
    } as MediaDeviceInfo;

    render(
      <InputEffectsPanel
        t={t}
        loaded={true}
        locale="en"
        tracking={false}
        handTracking={false}
        lipSync={false}
        poseTracking={false}
        lipSyncMode="rms"
        cameras={[camera, { ...camera, deviceId: "camera-2", label: "Camera B" }]}
        selectedCamera=""
        colliderEffects={false}
        gamepadActive={false}
        midiActive={false}
        scriptInput="smile"
        scriptRunning={false}
        onToggleTracking={vi.fn()}
        onToggleHandTracking={vi.fn()}
        onToggleLipSync={onToggleLipSync}
        onTogglePoseTracking={vi.fn()}
        onCameraChange={onCameraChange}
        onLipSyncModeChange={vi.fn()}
        onToggleColliderEffects={vi.fn()}
        onPlayEffect={onPlayEffect}
        onToggleGamepad={vi.fn()}
        onToggleMidi={vi.fn()}
        onScriptInputChange={vi.fn()}
        onRunScript={onRunScript}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("Default Camera"), {
      target: { value: "camera-2" },
    });
    expect(onCameraChange).toHaveBeenCalledWith("camera-2");

    fireEvent.click(screen.getByText(t("lipSyncStart")));
    expect(onToggleLipSync).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText(t("confetti")));
    expect(onPlayEffect).toHaveBeenCalledWith("confetti");

    fireEvent.click(screen.getByText(t("scriptRun")));
    expect(onRunScript).toHaveBeenCalledTimes(1);
  });
});

describe("SideSheet and ViewerShell", () => {
  const sections: Record<ViewerSheetSection, ReactNode> = {
    session: <div>Session body</div>,
    connect: <div>Connect body</div>,
    overlays: <div>Items body</div>,
    calibration: <div>Calibration body</div>,
    inputEffects: <div>Inputs body</div>,
  };

  it("keeps the stage rendered while the non-modal side sheet is open", () => {
    render(
      <ViewerShell
        toolbar={<div>Toolbar</div>}
        sideSheet={
          <SideSheet
            locale="en"
            open={true}
            activeSection="session"
            issues={[]}
            sections={sections}
            onClose={vi.fn()}
            onSectionChange={vi.fn()}
          />
        }
        statusStrip={<div>Status</div>}
      >
        <canvas data-testid="viewer-stage-canvas" />
      </ViewerShell>,
    );

    expect(screen.getByTestId("side-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("viewer-stage-canvas")).toBeInTheDocument();
  });

  it("switches tabs through section callbacks and hides itself when closed", () => {
    const onSectionChange = vi.fn();
    const { rerender } = render(
      <SideSheet
        locale="en"
        open={true}
        activeSection="session"
        issues={[]}
        sections={sections}
        onClose={vi.fn()}
        onSectionChange={onSectionChange}
      />,
    );

    const sessionTab = screen.getByTestId("side-sheet-tab-session");
    expect(sessionTab).toHaveAttribute("tabindex", "0");
    expect(screen.getByTestId("side-sheet-tab-overlays")).toHaveAttribute(
      "tabindex",
      "-1",
    );

    fireEvent.keyDown(sessionTab, { key: "ArrowRight" });
    expect(onSectionChange).toHaveBeenCalledWith("connect");

    fireEvent.click(screen.getByTestId("side-sheet-tab-overlays"));
    expect(onSectionChange).toHaveBeenCalledWith("overlays");

    rerender(
      <SideSheet
        locale="en"
        open={false}
        activeSection="session"
        issues={[]}
        sections={sections}
        onClose={vi.fn()}
        onSectionChange={onSectionChange}
      />,
    );
    expect(screen.queryByTestId("side-sheet")).toBeNull();
  });

  it.each(["ja", "zh-Hans", "ko-KR"] as const)(
    "localizes the side sheet shell in %s without English fallback",
    (locale) => {
      const sideSheetT = createT(locale);
      render(
        <SideSheet
          locale={locale}
          open={true}
          activeSection="inputEffects"
          issues={[]}
          sections={sections}
          onClose={vi.fn()}
          onSectionChange={vi.fn()}
        />,
      );

      expect(screen.getByLabelText(sideSheetT("sideSheetAria"))).toBeInTheDocument();
      expect(screen.getByText("Vivi2D Viewer")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: sideSheetT("closePanel") }),
      ).toBeInTheDocument();
      expect(screen.getByText(sideSheetT("sideSheetInputEffectsDescription"))).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: sideSheetT("inputEffects") })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
      expect(
        screen.queryByText("Input devices, scripts, reactions, and effect routing."),
      ).toBeNull();
    },
  );
});

describe("ViewerStatusStrip", () => {
  it("shows stream-safe model names and compact status", () => {
    render(
      <ViewerStatusStrip
        locale="en"
        loaded={true}
        modelName="C:/secret/hero.vivi"
        viewerApiEnabled={true}
        tracking={true}
        handTracking={false}
        poseTracking={false}
        lipSync={false}
        showHud={true}
        recordingState="idle"
        propCount={2}
        calibrationProfileCount={3}
      />,
    );

    expect(screen.getByText("hero")).toBeInTheDocument();
    expect(screen.getByText("Stats on")).toBeInTheDocument();
    expect(screen.getByText("Items 2")).toBeInTheDocument();
    expect(screen.getByText("Profiles 3")).toBeInTheDocument();
  });
});

describe("ViewerStage", () => {
  function renderStage(
    readinessWarnings: Parameters<typeof ViewerStage>[0]["readinessWarnings"],
  ) {
    return render(
      <ViewerStage
        t={createT("ja")}
        locale="ja"
        loaded={false}
        dragging={false}
        bgMode="transparent"
        canvasRef={{ current: null }}
        onCanvasClick={vi.fn()}
        readinessWarnings={readinessWarnings}
        onClearReadinessWarnings={vi.fn()}
        onOpenSheetSection={vi.fn()}
        onDismissRecommendation={vi.fn()}
        onRestoreRecommendation={vi.fn()}
        lastHit={null}
        showHud={false}
        hudStats={{ fps: 60, meshes: 1, vertices: 3 }}
        viewerProps={[]}
        lipSync={false}
        lipSyncMode="rms"
        currentVowel="silent"
        recordingState="idle"
        activePreset={null}
        toast={null}
      />,
    );
  }

  it("keeps readiness-card Japanese copy intact", () => {
    renderStage([
      {
        id: "connect",
        label: "接続設定を確認",
        targetSection: "connect",
        recommendationKey: "connect",
      },
    ]);

    expect(screen.getByLabelText("配信前チェック"))
      .toBeInTheDocument();
    expect(screen.getByText("準備状態の警告")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "閉じる" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "開く" }))
      .toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "リマインダーを停止",
      }),
    ).toBeInTheDocument();
  });

  it("shows the Japanese restore action for dismissed readiness warnings", () => {
    renderStage([
      {
        id: "calibration",
        label: "調整を確認",
        targetSection: "calibration",
        recommendationKey: "calibrate",
        dismissed: true,
      },
    ]);

    expect(screen.getByText(/リマインダー停止中/))
      .toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "リマインダーを復元",
      }),
    ).toBeInTheDocument();
  });

  it("hides reminder controls when a readiness warning has no recommendation key", () => {
    renderStage([
      {
        id: "props",
        label: "Prop settings",
        targetSection: "overlays",
      },
    ]);

    expect(screen.getByRole("button", { name: "開く" }))
      .toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "リマインダーを停止",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "リマインダーを戻す",
      }),
    ).toBeNull();
  });
});
