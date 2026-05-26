import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ViviViewerController } from "../controller/viewer-controller";
import { useViewerOverlayActions } from "../props/useViewerOverlayActions";
import type { ViviProp } from "../props/prop-types";

const baseProp: ViviProp = {
  id: "prop-1",
  name: "Hat",
  kind: "image",
  visible: true,
  drawOrder: 1,
  opacity: 1,
  transform: { x: 1, y: 2, scaleX: 1, scaleY: 1, rotation: 0 },
  source: {
    kind: "inlineBase64",
    mimeType: "image/png",
    bytes: "AAAA",
    portable: true,
  },
};

type OverlayActions = ReturnType<typeof useViewerOverlayActions>;

function makeController(dispatch = vi.fn(async () => ({ accepted: true }))) {
  return {
    dispatch,
  } as unknown as ViviViewerController & { dispatch: typeof dispatch };
}

function renderHookProbe(options: {
  controller?: ViviViewerController;
  props?: ViviProp[];
  showToast?: (message: string) => void;
}) {
  let latest: OverlayActions | null = null;
  const controller = options.controller ?? makeController();
  const showToast = options.showToast ?? vi.fn();

  function Probe() {
    latest = useViewerOverlayActions({
      viewerController: controller,
      viewerProps: options.props ?? [baseProp],
      showToast,
    });
    return <output data-testid="error">{latest.error ?? ""}</output>;
  }

  render(<Probe />);
  return {
    controller,
    showToast,
    get actions() {
      if (!latest) throw new Error("hook not rendered");
      return latest;
    },
  };
}

function stubImageLoading() {
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:prop"),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 32, height: 16, close: vi.fn() })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "viviAPI");
});

describe("useViewerOverlayActions", () => {
  it("adds local files through the controller and reports success", async () => {
    stubImageLoading();
    const dispatch = vi.fn(async () => ({ accepted: true }));
    const showToast = vi.fn();
    const probe = renderHookProbe({
      controller: makeController(dispatch),
      showToast,
    });

    await act(async () => {
      await probe.actions.handleAddFile(
        new File(["abc"], "hat.png", { type: "image/png" }),
      );
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "props.add",
        scopes: ["write:props"],
        prop: expect.objectContaining({ name: "hat" }),
      }),
    );
    expect(showToast).toHaveBeenCalledWith("Overlay added: hat");
    expect(screen.getByTestId("error")).toHaveTextContent("");
  });

  it("surfaces add failures without throwing through the UI", async () => {
    stubImageLoading();
    const probe = renderHookProbe({
      controller: makeController(vi.fn(async () => ({
        accepted: false,
        reason: "prop already exists",
      }))),
    });

    await act(async () => {
      await probe.actions.handleAddFile(
        new File(["abc"], "hat.png", { type: "image/png" }),
      );
    });

    expect(screen.getByTestId("error")).toHaveTextContent("prop already exists");
  });

  it("wraps prop mutation commands and stores controller rejection messages", async () => {
    const dispatch = vi
      .fn()
      .mockResolvedValueOnce({ accepted: false, reason: "update failed" })
      .mockResolvedValueOnce({ accepted: false, reason: "remove failed" })
      .mockResolvedValueOnce({ accepted: false, reason: "transform failed" })
      .mockResolvedValueOnce({ accepted: false, reason: "visibility failed" })
      .mockResolvedValueOnce({ accepted: false, reason: "cycle failed" })
      .mockResolvedValueOnce({ accepted: false, reason: "burst failed" });
    const probe = renderHookProbe({ controller: makeController(dispatch) });

    await act(async () => {
      await probe.actions.handleUpdateProp(baseProp);
    });
    expect(screen.getByTestId("error")).toHaveTextContent("update failed");

    await act(async () => {
      await probe.actions.handleRemoveProp("prop-1");
      await probe.actions.handlePatchTransform("prop-1", { x: 4 });
      await probe.actions.handleSetVisible("prop-1", false);
      await probe.actions.handleCycleGroup("hats", "next");
      await probe.actions.handleSpawnBurst(["prop-1"]);
    });

    expect(dispatch).toHaveBeenNthCalledWith(
      2,
      { type: "props.remove", propId: "prop-1", scopes: ["write:props"] },
    );
    expect(dispatch).toHaveBeenNthCalledWith(
      3,
      {
        type: "props.patchTransform",
        propId: "prop-1",
        transform: { x: 4 },
        scopes: ["write:props"],
      },
    );
    expect(dispatch).toHaveBeenNthCalledWith(
      4,
      {
        type: "props.setVisible",
        propId: "prop-1",
        visible: false,
        scopes: ["write:props"],
      },
    );
    expect(screen.getByTestId("error")).toHaveTextContent("burst failed");
  });

  it("duplicates visible props with bounded copy metadata", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "copy-id" });
    const dispatch = vi.fn(async () => ({ accepted: true }));
    const probe = renderHookProbe({ controller: makeController(dispatch) });

    await act(async () => {
      await probe.actions.handleDuplicateProp("prop-1");
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "props.add",
      scopes: ["write:props"],
      prop: expect.objectContaining({
        id: "prop-1-copy-copy-id",
        name: "Hat Copy",
        visible: true,
        drawOrder: 2,
        transform: expect.objectContaining({ x: 25, y: 26 }),
      }),
    });
  });

  it("reports missing duplicate sources", async () => {
    const dispatch = vi.fn();
    const probe = renderHookProbe({
      controller: makeController(dispatch),
      props: [],
    });

    await act(async () => {
      await probe.actions.handleDuplicateProp("missing");
    });

    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByTestId("error")).toHaveTextContent("Overlay not found");
  });

  it("uses the viewer API bridge for mediated prop assets", async () => {
    const createPropAsset = vi.fn(async () => ({ assetId: "asset-1" }));
    const listPropAssets = vi.fn(async () => [{ assetId: "asset-1" }]);
    const extendPropAsset = vi.fn(async () => ({ ok: true }));
    const revokePropAsset = vi.fn(async () => ({ ok: true }));
    Object.defineProperty(window, "viviAPI", {
      configurable: true,
      value: {
        viewerApi: {
          createPropAsset,
          listPropAssets,
          extendPropAsset,
          revokePropAsset,
        },
      },
    });
    const probe = renderHookProbe({});

    await expect(
      probe.actions.handleCreateApiAsset(
        new File(["abc"], "hat.jpg", { type: "" }),
        "grant-1",
      ),
    ).resolves.toEqual({ assetId: "asset-1" });
    await expect(probe.actions.handleListApiAssets("grant-1")).resolves.toEqual([
      { assetId: "asset-1" },
    ]);
    await expect(
      probe.actions.handleExtendApiAsset("grant-1", "asset-1"),
    ).resolves.toEqual({ ok: true });
    await expect(
      probe.actions.handleRevokeApiAsset("grant-1", "asset-1"),
    ).resolves.toEqual({ ok: true });
    await waitFor(() =>
      expect(createPropAsset).toHaveBeenCalledWith({
        grantId: "grant-1",
        displayName: "hat.jpg",
        mimeType: "image/jpeg",
        bytesBase64: "YWJj",
      }),
    );
  });

  it("fails closed when the viewer API asset bridge is unavailable", async () => {
    const probe = renderHookProbe({});

    await expect(
      probe.actions.handleCreateApiAsset(
        new File(["abc"], "hat.webp", { type: "" }),
        "grant-1",
      ),
    ).rejects.toThrow("Viewer API bridge is unavailable");
    await expect(probe.actions.handleListApiAssets("grant-1")).resolves.toEqual([]);
    await expect(
      probe.actions.handleExtendApiAsset("grant-1", "asset-1"),
    ).resolves.toBeUndefined();
    await expect(
      probe.actions.handleRevokeApiAsset("grant-1", "asset-1"),
    ).resolves.toBeUndefined();
  });
});
