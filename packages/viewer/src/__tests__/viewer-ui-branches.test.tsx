import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ViewerApiGrantSummary } from "../api/viewer-api-client-types";
import { ContextToolbar } from "../components/ContextToolbar";
import { GrantManagementTable } from "../components/GrantManagementTable";
import { InputEffectsPanel } from "../components/InputEffectsPanel";
import { SideSheet } from "../components/SideSheet";
import { ViewerApiPanel } from "../components/ViewerApiPanel";
import {
  deriveViewerWorkflowModel,
  type ViewerSheetSection,
} from "../components/viewer-workflow";
import { createT } from "../i18n";

const t = createT("en");

afterEach(() => {
  delete (window as typeof window & { viviAPI?: unknown }).viviAPI;
  vi.restoreAllMocks();
});

function makeGrant(overrides: Partial<ViewerApiGrantSummary> = {}): ViewerApiGrantSummary {
  return {
    id: "grant-abcdef1234567890",
    appName: "Overlay Tool",
    scopes: ["read:state"],
    originBinding: "https://example.test",
    createdAt: 1,
    lastUsedAt: null,
    ...overrides,
  };
}

describe("Viewer UI branch behavior", () => {
  it("shows an empty grant state and disables grant actions while busy", async () => {
    const onRevoke = vi.fn();
    const onRotate = vi.fn();
    const { rerender } = render(
      <GrantManagementTable
        locale="en"
        grants={[]}
        busy={false}
        onRevoke={onRevoke}
        onRotate={onRotate}
      />,
    );

    expect(screen.getByText("No approved clients.")).toBeInTheDocument();

    rerender(
      <GrantManagementTable
        locale="en"
        grants={[makeGrant({ lastUsedAt: Date.UTC(2026, 4, 20, 12, 0, 0) })]}
        busy={true}
        onRevoke={onRevoke}
        onRotate={onRotate}
      />,
    );

    expect(screen.getByText(/#grant-abcdef/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke and re-pair" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeDisabled();

    rerender(
      <GrantManagementTable
        locale="ja"
        grants={[makeGrant({ scopes: ["write:calibration"] })]}
        busy={false}
        onRevoke={onRevoke}
        onRotate={onRotate}
      />,
    );

    expect(screen.getByTestId("viewer-api-grant-row").textContent).toContain(
      "write:calibration",
    );
  });

  it("keeps unloaded input controls disabled and loaded controls wired", async () => {
    const user = userEvent.setup();
    const onToggleTracking = vi.fn();
    const onLipSyncModeChange = vi.fn();
    const onToggleColliderEffects = vi.fn();
    const onToggleGamepad = vi.fn();
    const onToggleMidi = vi.fn();
    const onScriptInputChange = vi.fn();
    const onRunScript = vi.fn();
    const camera = {
      deviceId: "camera-private-id-1234",
      label: "",
      kind: "videoinput",
      groupId: "group",
      toJSON: () => ({}),
    } as MediaDeviceInfo;

    const { rerender } = render(
      <InputEffectsPanel
        t={t}
        loaded={false}
        locale="en"
        tracking={false}
        handTracking={false}
        lipSync={false}
        poseTracking={false}
        lipSyncMode="rms"
        cameras={[camera]}
        selectedCamera=""
        colliderEffects={false}
        gamepadActive={false}
        midiActive={false}
        scriptInput=""
        scriptRunning={false}
        onToggleTracking={onToggleTracking}
        onToggleHandTracking={vi.fn()}
        onToggleLipSync={vi.fn()}
        onTogglePoseTracking={vi.fn()}
        onCameraChange={vi.fn()}
        onLipSyncModeChange={onLipSyncModeChange}
        onToggleColliderEffects={onToggleColliderEffects}
        onPlayEffect={vi.fn()}
        onToggleGamepad={onToggleGamepad}
        onToggleMidi={onToggleMidi}
        onScriptInputChange={onScriptInputChange}
        onRunScript={onRunScript}
      />,
    );

    expect(screen.getByTestId("viewer-toggle-face-tracking")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Lip sync mode"), {
      target: { value: "viseme" },
    });
    expect(onLipSyncModeChange).toHaveBeenCalledWith("viseme");
    expect(screen.queryByText("Reactions")).toBeNull();

    rerender(
      <InputEffectsPanel
        t={t}
        loaded={true}
        locale="en"
        tracking={true}
        handTracking={true}
        lipSync={true}
        poseTracking={true}
        lipSyncMode="viseme"
        cameras={[camera, { ...camera, deviceId: "camera-2" }]}
        selectedCamera="camera-private-id-1234"
        colliderEffects={true}
        gamepadActive={true}
        midiActive={true}
        scriptInput="wave"
        scriptRunning={true}
        onToggleTracking={onToggleTracking}
        onToggleHandTracking={vi.fn()}
        onToggleLipSync={vi.fn()}
        onTogglePoseTracking={vi.fn()}
        onCameraChange={vi.fn()}
        onLipSyncModeChange={onLipSyncModeChange}
        onToggleColliderEffects={onToggleColliderEffects}
        onPlayEffect={vi.fn()}
        onToggleGamepad={onToggleGamepad}
        onToggleMidi={onToggleMidi}
        onScriptInputChange={onScriptInputChange}
        onRunScript={onRunScript}
      />,
    );

    expect(screen.queryByLabelText("Lip sync mode")).toBeNull();
    expect(screen.getByText("Reactions")).toBeInTheDocument();
    expect(screen.getByLabelText("Camera")).toBeDisabled();
    await user.click(screen.getByText(t("colliderEffectsOn")));
    await user.click(screen.getByText(t("gamepadStop")));
    await user.click(screen.getByText(t("midiStop")));
    fireEvent.keyDown(screen.getByDisplayValue("wave"), { key: "Enter" });

    expect(onToggleColliderEffects).toHaveBeenCalledTimes(1);
    expect(onToggleGamepad).toHaveBeenCalledTimes(1);
    expect(onToggleMidi).toHaveBeenCalledTimes(1);
    expect(onRunScript).toHaveBeenCalledTimes(1);
  });

  it("renders toolbar loading, recording, panel, error, and file-change branches", async () => {
    const user = userEvent.setup();
    const onFileLoad = vi.fn();
    const onToggleRecording = vi.fn();
    const onToggleHud = vi.fn();
    const { container, rerender } = render(
      <ContextToolbar
        t={t}
        locale="en"
        loaded={true}
        modelName="C:/secret/hero.vivi"
        mappedCount={0}
        platformFaceMappedCount={0}
        handMappedCount={0}
        poseMappedCount={0}
        tracking={false}
        handTracking={false}
        lipSync={false}
        poseTracking={false}
        error={null}
        panelOpen={true}
        recordingState="processing"
        recordingElapsed={12.5}
        workflow={deriveViewerWorkflowModel({
          loaded: true,
          modelLoading: true,
          recordingState: "processing",
          viewerApiEnabled: false,
          calibrationNeedsAttention: false,
          issues: [],
        })}
        onFileLoad={onFileLoad}
        onTogglePanel={vi.fn()}
        onPrimaryAction={vi.fn()}
        onToggleRecording={onToggleRecording}
        onToggleHud={onToggleHud}
      />,
    );

    expect(screen.getByTestId("workflow-primary-action")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stopping recording" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Toggle stats overlay" }));
    expect(onToggleHud).toHaveBeenCalledTimes(1);

    const fileInput = container.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["{}"], "next.vivi")] },
    });
    expect(onFileLoad).toHaveBeenCalledWith(expect.objectContaining({ name: "next.vivi" }));

    rerender(
      <ContextToolbar
        t={t}
        locale="en"
        loaded={true}
        modelName="hero.vivi"
        mappedCount={1}
        platformFaceMappedCount={1}
        handMappedCount={1}
        poseMappedCount={1}
        tracking={true}
        handTracking={true}
        lipSync={true}
        poseTracking={true}
        error="Renderer failed"
        panelOpen={false}
        recordingState="recording"
        recordingElapsed={3.9}
        workflow={deriveViewerWorkflowModel({
          loaded: true,
          modelLoading: false,
          recordingState: "recording",
          viewerApiEnabled: true,
          calibrationNeedsAttention: false,
          issues: [
            {
              code: "renderer",
              severity: "blocking",
              category: "unknown",
              message: "Renderer failed",
              createdAtMs: 1,
            },
          ],
        })}
        onFileLoad={onFileLoad}
        onTogglePanel={vi.fn()}
        onPrimaryAction={vi.fn()}
        onToggleRecording={onToggleRecording}
        onToggleHud={onToggleHud}
      />,
    );

    await user.click(screen.getByTestId("viewer-recording-stop"));
    expect(onToggleRecording).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Renderer failed");
    expect(screen.getAllByText("Face").length).toBeGreaterThan(1);
  });

  it("navigates side sheet sections and reports issues without modalizing the stage", async () => {
    const onSectionChange = vi.fn();
    const onClose = vi.fn();
    const sections: Record<ViewerSheetSection, ReactNode> = {
      session: <div>Session body</div>,
      connect: <div>Connect body</div>,
      overlays: <div>Items body</div>,
      calibration: <div>Calibration body</div>,
      inputEffects: <div>Inputs body</div>,
    };

    const { rerender } = render(
      <SideSheet
        locale="en"
        open={true}
        activeSection="connect"
        issues={[
          {
            code: "api",
            severity: "warning",
            category: "viewer_api",
            message: "API disabled",
            createdAtMs: 1,
          },
          {
            code: "calibration",
            severity: "warning",
            category: "unknown",
            message: "Needs review",
            createdAtMs: 2,
          },
          {
            code: "props",
            severity: "warning",
            category: "unknown",
            message: "Hidden prop",
            createdAtMs: 3,
          },
          {
            code: "extra",
            severity: "warning",
            category: "unknown",
            message: "Not displayed",
            createdAtMs: 4,
          },
        ]}
        sections={sections}
        onClose={onClose}
        onSectionChange={onSectionChange}
      />,
    );

    expect(screen.getByTestId("viewer-issue-list")).toHaveTextContent("API disabled");
    expect(screen.getByTestId("viewer-issue-list")).not.toHaveTextContent("Not displayed");
    fireEvent.keyDown(screen.getByTestId("side-sheet-tab-connect"), { key: "Home" });
    fireEvent.keyDown(screen.getByTestId("side-sheet-tab-connect"), { key: "End" });
    fireEvent.keyDown(screen.getByTestId("side-sheet-tab-connect"), { key: "ArrowLeft" });
    fireEvent.keyDown(screen.getByTestId("side-sheet-tab-connect"), { key: "PageDown" });
    expect(onSectionChange).toHaveBeenCalledWith("session");
    expect(onSectionChange).toHaveBeenCalledWith("inputEffects");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <SideSheet
        locale="en"
        open={false}
        activeSection="session"
        issues={[]}
        sections={sections}
        onClose={onClose}
        onSectionChange={onSectionChange}
      />,
    );
    expect(screen.queryByTestId("side-sheet")).toBeNull();
  });

  it("surfaces Viewer API pending, grant, storage, endpoint, and error states", async () => {
    const bridge = installViewerApiBridge({
      enabled: true,
      port: 17321,
      endpoint: null,
      pairingWindowOpen: true,
      persistentGrantsAvailable: false,
      tokenPersistence: "session",
      pendingChallenges: [
        {
          id: "challenge-1",
          appName: "OBS bridge",
          scopes: ["read:state"],
          originBinding: "no-origin",
          createdAt: Date.now(),
          expiresAt: Date.now() + 90_000,
          badCodeAttempts: 1,
        },
      ],
      grants: [
        makeGrant({
          scopes: ["write:props"],
          fingerprint: "abc123",
        }),
      ],
    });
    bridge.closePairingWindow.mockRejectedValueOnce(new Error("close failed"));
    render(<ViewerApiPanel locale="en" />);

    await screen.findByText(/ws:\/\/127\.0\.0\.1:17321/);
    expect(screen.getByText("Secure storage: dev session only")).toBeInTheDocument();
    expect(screen.getByText("Pending requests")).toBeInTheDocument();
    expect(screen.getByText(/#abc123/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close pairing" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("close failed"));
  });
});

function installViewerApiBridge(status: Record<string, unknown>) {
  const bridge = {
    getStatus: vi.fn(async () => status),
    setEnabled: vi.fn(async () => {}),
    openPairingWindow: vi.fn(async () => {}),
    closePairingWindow: vi.fn(async () => {}),
    listGrants: vi.fn(async () => []),
    approvePairing: vi.fn(async () => {}),
    revokeGrant: vi.fn(async () => true),
    rotateGrant: vi.fn(async () => {}),
    publishEvent: vi.fn(async () => 0),
    respondRendererRequest: vi.fn(async () => true),
    createPropAsset: vi.fn(async () => ({})),
    listPropAssets: vi.fn(async () => []),
    extendPropAsset: vi.fn(async () => ({})),
    revokePropAsset: vi.fn(async () => true),
    onStatusChanged: vi.fn(() => () => {}),
    onAssetStatusChanged: vi.fn(() => () => {}),
    onRendererRequest: vi.fn(() => () => {}),
  };
  window.viviAPI = {
    setBackgroundMode: vi.fn(async () => {}),
    toggleAlwaysOnTop: vi.fn(async () => false),
    toggleFrame: vi.fn(async () => {}),
    setWindowSize: vi.fn(async () => {}),
    onBackgroundModeChanged: vi.fn(() => () => {}),
    viewerApi: bridge,
  };
  return bridge;
}
