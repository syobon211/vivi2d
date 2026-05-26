import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ViewerApiGrantSummary } from "../api/viewer-api-client-types";
import { GrantManagementTable } from "../components/GrantManagementTable";
import { OverlaysPanel } from "../components/OverlaysPanel";
import { PairingRequestCard } from "../components/PairingRequestCard";
import { ViewerApiPanel } from "../components/ViewerApiPanel";

const writeGrant: ViewerApiGrantSummary = {
  id: "grant-write",
  appName: "Overlay Tool",
  scopes: ["read:props", "write:props"],
  originBinding: "no-origin",
  createdAt: 1,
  lastUsedAt: null,
};

function installViewerApiBridge() {
  let enabled = false;
  const bridge = {
    getStatus: vi.fn(async () => ({
      enabled,
      persistentGrantsAvailable: true,
      tokenPersistence: "persistent",
      pendingChallenges: [],
      grants: [],
    })),
    setEnabled: vi.fn(async (payload: { enabled: boolean }) => {
      enabled = payload.enabled;
    }),
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

describe("Viewer API UI", () => {
  afterEach(() => {
    delete (window as typeof window & { viviAPI?: unknown }).viviAPI;
  });

  it("shows browser-preview unavailability instead of silently no-oping", () => {
    render(<ViewerApiPanel locale="en" />);

    expect(screen.getByRole("button", { name: "Electron only" })).toBeDisabled();
    expect(
      screen.getByText(
        "Local API is available only in the Electron viewer. It is disabled in browser preview.",
      ),
    ).toBeInTheDocument();
  });

  it("enables the Electron bridge when it is available", async () => {
    const user = userEvent.setup();
    const bridge = installViewerApiBridge();
    render(<ViewerApiPanel locale="en" />);

    const button = await screen.findByRole("button", { name: "Enable Local API" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    await waitFor(() => {
      expect(bridge.setEnabled).toHaveBeenCalledWith({
        enabled: true,
        port: undefined,
      });
    });
    await screen.findByRole("button", { name: "Disable Local API" });
  });

  it("warns when packaged secure storage is unavailable", async () => {
    const bridge = installViewerApiBridge();
    bridge.getStatus.mockResolvedValueOnce({
      enabled: false,
      persistentGrantsAvailable: false,
      tokenPersistence: "unavailable",
      pendingChallenges: [],
      grants: [],
    });

    render(<ViewerApiPanel locale="en" />);

    expect(
      await screen.findByText(
        "Secure storage unavailable: pairing cannot persist approved clients",
      ),
    ).toBeInTheDocument();
  });


  it("keeps pairing codes hidden and approves only the user-entered code", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    render(
      <PairingRequestCard
        locale="ja"
        busy={false}
        challenge={{
          id: "challenge-1",
          appName: "Node Sample",
          scopes: ["read:state"],
          originBinding: "no-origin",
          createdAt: Date.now(),
          expiresAt: Date.now() + 90_000,
          badCodeAttempts: 0,
        }}
        onApprove={onApprove}
      />,
    );

    expect(screen.getByLabelText("確認コードは非表示です")).toHaveTextContent(
      "******",
    );
    expect(screen.queryByText(/\b[0-9]{6}\b/)).toBeNull();

    const approve = screen.getByRole("button", { name: "承認" });
    expect(approve).toBeDisabled();
    await user.type(
      screen.getByLabelText(/外部クライアントに表示された6桁のコードを入力/),
      "12x3456",
    );
    await user.click(approve);

    expect(onApprove).toHaveBeenCalledWith("challenge-1", "123456");
  });

  it("renders grant actions as keyboard-reachable buttons", async () => {
    const user = userEvent.setup();
    const onRevoke = vi.fn();
    const onRotate = vi.fn();
    render(
      <GrantManagementTable
        locale="en"
        grants={[writeGrant]}
        busy={false}
        onRevoke={onRevoke}
        onRotate={onRotate}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Revoke and re-pair" }));
    await user.click(screen.getByRole("button", { name: "Revoke" }));

    expect(onRotate).toHaveBeenCalledWith("grant-write");
    expect(onRevoke).toHaveBeenCalledWith("grant-write");
  });

  it("creates user-mediated API asset handles without exposing file paths", async () => {
    const user = userEvent.setup();
    const asset = {
      assetId: "vpa_test",
      grantId: "grant-write",
      appName: "Overlay Tool",
      label: "badge.png",
      mimeType: "image/png",
      bytes: 67,
      secondsRemaining: 900,
      extended: false,
    };
    const onCreateApiAsset = vi.fn().mockResolvedValue({ ok: true, asset });
    const onListApiAssets = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([asset]);

    render(
      <OverlaysPanel
        locale="en"
        props={[]}
        apiGrants={[writeGrant]}
        onAddFile={vi.fn()}
        onCreateApiAsset={onCreateApiAsset}
        onListApiAssets={onListApiAssets}
        onExtendApiAsset={vi.fn()}
        onRevokeApiAsset={vi.fn()}
        onDuplicateProp={vi.fn()}
        onRemoveProp={vi.fn()}
        onPatchTransform={vi.fn()}
        onSetVisible={vi.fn()}
        onUpdateProp={vi.fn()}
        onCycleGroup={vi.fn()}
        onSpawnBurst={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Target client")).toHaveValue("grant-write"),
    );
    const input = screen.getByLabelText("Issue API asset handle");
    await user.upload(
      input,
      new File([new Uint8Array([1, 2, 3])], "C:\\Users\\dev\\badge.png", {
        type: "image/png",
      }),
    );

    await screen.findByText("vpa_test");
    expect(onCreateApiAsset).toHaveBeenCalledWith(expect.any(File), "grant-write");
    expect(screen.getByTestId("viewer-api-prop-asset-row")).not.toHaveTextContent(
      /C:\\Users\\dev/,
    );
  });

  it("explains the missing write grant in Japanese", () => {
    render(
      <OverlaysPanel
        locale="ja"
        props={[]}
        apiGrants={[
          {
            ...writeGrant,
            id: "grant-read",
            scopes: ["read:props"],
          },
        ]}
        onAddFile={vi.fn()}
        onDuplicateProp={vi.fn()}
        onRemoveProp={vi.fn()}
        onPatchTransform={vi.fn()}
        onSetVisible={vi.fn()}
        onUpdateProp={vi.fn()}
        onCycleGroup={vi.fn()}
        onSpawnBurst={vi.fn()}
      />,
    );

    expect(
      screen.getByText("write:propsを許可したクライアントがありません。"),
    ).toBeInTheDocument();
  });
});
