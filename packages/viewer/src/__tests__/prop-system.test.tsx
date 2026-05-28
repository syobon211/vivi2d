import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViviActionRunner } from "../actions/action-runner";
import { propSpawnBurstPayloadSchema, propTransformPayloadSchema } from "../actions/action-types";
import { OverlaysPanel } from "../components/OverlaysPanel";
import { PropOverlay } from "../props/PropOverlay";
import { resolvePropAnchorTransform } from "../props/prop-anchors";
import {
  assertPropAnimationLimits,
  createPropFromFile,
  readPropImageDimensions,
} from "../props/prop-loader";
import { ViviPropStore } from "../props/prop-store";
import {
  MAX_ACTIVE_PROPS,
  MAX_PROP_DIMENSION,
  parseViviProp,
  type ViviProp,
} from "../props/prop-types";

const baseProp: ViviProp = {
  id: "prop-1",
  name: "Prop",
  kind: "image",
  visible: true,
  drawOrder: 10,
  opacity: 1,
  transform: { x: 1, y: 2, scaleX: 1, scaleY: 1, rotation: 0 },
  source: {
    kind: "inlineBase64",
    mimeType: "image/png",
    bytes: "AAAA",
    portable: true,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ViviPropStore", () => {
  it("validates, sorts, updates, and removes props", () => {
    const store = new ViviPropStore();
    store.add({ ...baseProp, drawOrder: 2 });
    store.add({ ...baseProp, id: "prop-2", drawOrder: 1 });

    expect(store.list().map((prop) => prop.id)).toEqual(["prop-2", "prop-1"]);
    expect(store.setVisible("prop-1", false)?.visible).toBe(false);
    expect(store.patchTransform("prop-1", { x: 8, opacity: 0.5 })?.transform.x).toBe(8);
    expect(store.get("prop-1")?.opacity).toBe(0.5);
    expect(() => store.add({ ...baseProp, id: "prop-2" })).toThrow("Prop already exists");
    expect(() => store.update({ ...baseProp, id: "missing" })).toThrow("Prop not found");
    expect(store.remove("prop-1")).toBe(true);
  });

  it("enforces active prop limits and returns safe values for unknown ids", () => {
    const store = new ViviPropStore();
    for (let index = 0; index < MAX_ACTIVE_PROPS; index += 1) {
      store.add({ ...baseProp, id: `prop-${index}` });
    }

    expect(() => store.add({ ...baseProp, id: "overflow" })).toThrow("Prop limit reached");
    expect(store.setVisible("missing", true)).toBeNull();
    expect(store.patchTransform("missing", { x: 1 })).toBeNull();
    expect(store.remove("missing")).toBe(false);
  });

  it("revokes object URLs when props are overwritten, removed, or cleared", () => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(),
      revokeObjectURL,
    });
    const objectProp = {
      ...baseProp,
      source: {
        kind: "objectUrl",
        url: "blob:old",
        mimeType: "image/png",
        bytes: 3,
        portable: false,
      },
    } satisfies ViviProp;
    const store = new ViviPropStore();

    store.add(objectProp);
    store.update({
      ...objectProp,
      source: { ...objectProp.source, url: "blob:new" },
    });
    store.update({
      ...objectProp,
      source: { ...objectProp.source, url: "blob:new" },
    });
    store.remove(objectProp.id);
    store.add({ ...objectProp, id: "clear-me", source: { ...objectProp.source, url: "blob:clear" } });
    store.clear();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:old");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:new");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:clear");
    expect(revokeObjectURL).toHaveBeenCalledTimes(3);
  });

  it("keeps shared object URLs alive until the last prop is removed", () => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(),
      revokeObjectURL,
    });
    const sharedProp = {
      ...baseProp,
      source: {
        kind: "objectUrl",
        url: "blob:shared",
        mimeType: "image/png",
        bytes: 3,
        portable: false,
      },
    } satisfies ViviProp;
    const store = new ViviPropStore();

    store.add({ ...sharedProp, id: "a" });
    store.add({ ...sharedProp, id: "b" });
    store.remove("a");
    expect(revokeObjectURL).not.toHaveBeenCalled();

    store.remove("b");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:shared");
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("enforces burst limits", () => {
    const store = new ViviPropStore();
    store.add(baseProp);

    expect(() => store.spawnBurst(Array.from({ length: 17 }, (_, i) => `p-${i}`))).toThrow(
      "Prop burst limit exceeded",
    );
  });

  it("cycles one visible prop per group", () => {
    const store = new ViviPropStore();
    store.add({ ...baseProp, id: "a", groupId: "faces", visible: true });
    store.add({ ...baseProp, id: "b", groupId: "faces", visible: false });

    store.cycleGroup("faces", "next");

    expect(store.get("a")?.visible).toBe(false);
    expect(store.get("b")?.visible).toBe(true);
  });

  it("handles empty and initially hidden prop groups", () => {
    const store = new ViviPropStore();
    store.add({ ...baseProp, id: "a", groupId: "faces", visible: false });
    store.add({ ...baseProp, id: "b", groupId: "faces", visible: false });

    expect(store.cycleGroup("missing")).toEqual([]);
    store.cycleGroup("faces", "next");

    expect(store.get("a")?.visible).toBe(true);
    expect(store.get("b")?.visible).toBe(false);
  });

  it("marks burst props as temporary and visible", () => {
    const store = new ViviPropStore();
    store.add({ ...baseProp, id: "burst", visible: false });

    store.spawnBurst(["burst"]);

    expect(store.get("burst")).toMatchObject({ visible: true, temporary: true });
  });
});

describe("prop loader", () => {
  it("creates object-url props from file picker files", async () => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:prop"),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 128, height: 64, close: vi.fn() })),
    );
    const file = new File(["abc"], "hat.png", { type: "image/png" });

    const prop = await createPropFromFile(file);

    expect(prop.source).toMatchObject({
      kind: "objectUrl",
      url: "blob:prop",
      portable: false,
    });
  });

  it("rejects unsupported prop files", async () => {
    const file = new File(["<svg></svg>"], "bad.svg", { type: "image/svg+xml" });
    await expect(createPropFromFile(file)).rejects.toThrow("Unsupported prop image type");
  });

  it("rejects oversized image dimensions before creating object URLs", async () => {
    const createObjectURL = vi.fn(() => "blob:prop");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({
        width: MAX_PROP_DIMENSION + 1,
        height: 128,
        close: vi.fn(),
      })),
    );
    const file = new File(["abc"], "huge.png", { type: "image/png" });

    await expect(createPropFromFile(file)).rejects.toThrow(
      "Prop image dimensions exceed limit",
    );
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("rejects animated prop files with too many frames", async () => {
    const gifBytes: number[] = [];
    for (let index = 0; index < 257; index += 1) {
      gifBytes.push(0x21, 0xf9);
    }
    const file = new File([new Uint8Array(gifBytes)], "busy.gif", {
      type: "image/gif",
    });

    await expect(createPropFromFile(file)).rejects.toThrow(
      "Prop animation frame count exceeds limit",
    );
  });

  it("accepts animated prop files at the frame limit", async () => {
    const gifBytes: number[] = [];
    for (let index = 0; index < 256; index += 1) {
      gifBytes.push(0x21, 0xf9);
    }
    const file = new File([new Uint8Array(gifBytes)], "busy.gif", {
      type: "image/gif",
    });

    await expect(assertPropAnimationLimits(file)).resolves.toBeUndefined();
  });

  it("skips animation frame inspection for static prop files", async () => {
    const file = new File(["png"], "hat.png", { type: "image/png" });

    await expect(assertPropAnimationLimits(file)).resolves.toBeUndefined();
  });

  it("fails closed when image dimensions cannot be inspected", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const file = new File(["not really png"], "bad.png", { type: "image/png" });

    await expect(createPropFromFile(file)).rejects.toThrow(
      "Prop image dimensions could not be inspected",
    );
  });

  it("rejects unsafe direct prop sources", () => {
    expect(() =>
      parseViviProp({
        ...baseProp,
        source: {
          kind: "objectUrl",
          url: "blob:svg",
          mimeType: "image/svg+xml",
          bytes: 16,
          portable: false,
        },
      }),
    ).toThrow();
    expect(() =>
      parseViviProp({
        ...baseProp,
        source: {
          kind: "objectUrl",
          url: "file:///tmp/hat.png",
          mimeType: "image/png",
          bytes: 16,
          portable: false,
        },
      }),
    ).toThrow();
    expect(() =>
      parseViviProp({
        ...baseProp,
        source: {
          kind: "inlineBase64",
          mimeType: "image/png",
          bytes: "A".repeat(70_000),
          portable: true,
        },
      }),
    ).toThrow();
    expect(() =>
      parseViviProp({
        ...baseProp,
        source: {
          kind: "inlineBase64",
          mimeType: "image/png",
          bytes: "not base64!",
          portable: true,
        },
      }),
    ).toThrow();
    expect(() => parseViviProp({ ...baseProp, extra: true })).toThrow();
    expect(() =>
      parseViviProp({
        ...baseProp,
        transform: { ...baseProp.transform, scaleX: 0.001 },
      }),
    ).toThrow();
    expect(() =>
      parseViviProp({
        ...baseProp,
        anchor: {
          target: { kind: "screen" },
          offsetX: 0,
          offsetY: 0,
          rotationWeight: 1.1,
          scaleWeight: 0,
        },
      }),
    ).toThrow();
  });

  it("accepts bounded inline base64 variants with explicit padding", () => {
    expect(
      parseViviProp({
        ...baseProp,
        id: "inline-one-padding",
        source: {
          kind: "inlineBase64",
          mimeType: "image/png",
          bytes: "AAA=",
          portable: true,
        },
      }).source,
    ).toMatchObject({ kind: "inlineBase64" });
    expect(
      parseViviProp({
        ...baseProp,
        id: "inline-two-padding",
        source: {
          kind: "inlineBase64",
          mimeType: "image/png",
          bytes: "AA==",
          portable: true,
        },
      }).source,
    ).toMatchObject({ kind: "inlineBase64" });
  });

  it("reads bounded dimensions from supported image headers", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 320, false);
    new DataView(png.buffer).setUint32(20, 240, false);

    const gif = new Uint8Array(10);
    gif.set([0x47, 0x49, 0x46, 0x38]);
    new DataView(gif.buffer).setUint16(6, 64, true);
    new DataView(gif.buffer).setUint16(8, 32, true);

    const jpeg = new Uint8Array(21);
    jpeg.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80]);

    const webp = new Uint8Array(30);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    webp.set([0x56, 0x50, 0x38, 0x58], 12);
    webp[24] = 63;
    webp[27] = 31;

    expect(readPropImageDimensions(png, "image/png")).toEqual({ width: 320, height: 240 });
    expect(readPropImageDimensions(gif, "image/gif")).toEqual({ width: 64, height: 32 });
    expect(readPropImageDimensions(jpeg, "image/jpeg")).toEqual({ width: 640, height: 480 });
    expect(readPropImageDimensions(webp, "image/webp")).toEqual({ width: 64, height: 32 });
  });

  it("recognizes WebP VP8L and VP8 dimension headers", () => {
    const webpLossless = new Uint8Array(30);
    webpLossless.set([0x52, 0x49, 0x46, 0x46], 0);
    webpLossless.set([0x57, 0x45, 0x42, 0x50], 8);
    webpLossless.set([0x56, 0x50, 0x38, 0x4c], 12);
    const width = 12;
    const height = 9;
    const bits = (width - 1) | ((height - 1) << 14);
    webpLossless[21] = bits & 0xff;
    webpLossless[22] = (bits >> 8) & 0xff;
    webpLossless[23] = (bits >> 16) & 0xff;
    webpLossless[24] = (bits >> 24) & 0xff;

    const webpLossy = new Uint8Array(30);
    webpLossy.set([0x52, 0x49, 0x46, 0x46], 0);
    webpLossy.set([0x57, 0x45, 0x42, 0x50], 8);
    webpLossy.set([0x56, 0x50, 0x38, 0x20], 12);
    webpLossy[26] = 0x20;
    webpLossy[28] = 0x10;

    expect(readPropImageDimensions(webpLossless, "image/webp")).toEqual({
      width,
      height,
    });
    expect(readPropImageDimensions(webpLossy, "image/webp")).toEqual({
      width: 32,
      height: 16,
    });
  });

  it("returns null for malformed image headers and unsupported MIME types", () => {
    expect(readPropImageDimensions(new Uint8Array(4), "image/png")).toBeNull();
    expect(readPropImageDimensions(new Uint8Array(9), "image/gif")).toBeNull();
    expect(readPropImageDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xda]), "image/jpeg")).toBeNull();
    expect(readPropImageDimensions(new Uint8Array(30), "image/webp")).toBeNull();
    expect(readPropImageDimensions(new Uint8Array(30), "image/svg+xml")).toBeNull();
  });
});

describe("prop anchors and overlay", () => {
  it("resolves model-root anchors without exposing mesh data", () => {
    const transform = resolvePropAnchorTransform(
      {
        ...baseProp,
        anchor: {
          target: { kind: "modelRoot" },
          offsetX: 2,
          offsetY: 3,
          rotationWeight: 0.5,
          scaleWeight: 0.5,
        },
      },
      { modelRoot: { x: 10, y: 20, scaleX: 2, scaleY: 2, rotation: 30 } },
    );

    expect(transform).toMatchObject({
      x: 13,
      y: 25,
      scaleX: 1.5,
      scaleY: 1.5,
      rotation: 15,
    });
  });

  it("renders visible props as a viewer overlay", () => {
    render(<PropOverlay props={[baseProp, { ...baseProp, id: "hidden", visible: false }]} />);

    expect(screen.getByTestId("prop-overlay").querySelectorAll("img")).toHaveLength(1);
  });

  it("renders object URLs and resolves file-picker assets through a caller-owned resolver", () => {
    render(
      <PropOverlay
        props={[
          {
            ...baseProp,
            id: "object-url",
            source: {
              kind: "objectUrl",
              url: "blob:object",
              mimeType: "image/png",
              bytes: 3,
              portable: false,
            },
          },
          {
            ...baseProp,
            id: "asset",
            source: {
              kind: "filePickerAsset",
              assetId: "asset-1",
              mimeType: "image/png",
              bytes: 3,
              portable: false,
            },
          },
        ]}
        resolveAssetUrl={(assetId) => (assetId === "asset-1" ? "blob:asset" : null)}
      />,
    );

    const sources = [...screen.getByTestId("prop-overlay").querySelectorAll("img")].map(
      (image) => image.getAttribute("src"),
    );
    expect(sources).toEqual(["blob:object", "blob:asset"]);
  });

  it("does not render unresolved file-picker assets", () => {
    render(
      <PropOverlay
        props={[
          {
            ...baseProp,
            source: {
              kind: "filePickerAsset",
              assetId: "missing",
              mimeType: "image/png",
              bytes: 3,
              portable: false,
            },
          },
        ]}
      />,
    );

    expect(screen.getByTestId("prop-overlay").querySelectorAll("img")).toHaveLength(0);
  });

  it("passes public anchor context into the overlay transform", () => {
    render(
      <PropOverlay
        props={[
          {
            ...baseProp,
            anchor: {
              target: { kind: "modelRoot" },
              offsetX: 2,
              offsetY: 3,
              rotationWeight: 1,
              scaleWeight: 1,
            },
          },
        ]}
        anchorContext={{ modelRoot: { x: 10, y: 20, scaleX: 2, scaleY: 2, rotation: 30 } }}
      />,
    );

    const image = screen.getByTestId("prop-overlay").querySelector("img");
    expect(image?.style.transform).toContain("translate(13px, 25px)");
    expect(image?.style.transform).toContain("rotate(30deg)");
    expect(image?.style.transform).toContain("scale(2, 2)");
  });

  it("falls back to local prop transform when an anchor target is missing", () => {
    const transform = resolvePropAnchorTransform(
      {
        ...baseProp,
        anchor: {
          target: { kind: "bone", boneId: "missing" },
          offsetX: 2,
          offsetY: 3,
          rotationWeight: 1,
          scaleWeight: 1,
        },
      },
      { bones: {} },
    );

    expect(transform).toMatchObject({
      x: 3,
      y: 5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    });
  });
});

describe("OverlaysPanel", () => {
  function makePanelProps(
    overrides: Partial<React.ComponentProps<typeof OverlaysPanel>> = {},
  ): React.ComponentProps<typeof OverlaysPanel> {
    return {
      locale: "en",
      props: [],
      onAddFile: vi.fn(),
      onDuplicateProp: vi.fn(),
      onRemoveProp: vi.fn(),
      onPatchTransform: vi.fn(),
      onSetVisible: vi.fn(),
      onUpdateProp: vi.fn(),
      onCycleGroup: vi.fn(),
      onSpawnBurst: vi.fn(),
      ...overrides,
    };
  }

  it("shows an empty state and forwards selected image files", async () => {
    const user = userEvent.setup();
    const onAddFile = vi.fn();
    render(<OverlaysPanel {...makePanelProps({ onAddFile })} />);

    expect(screen.getByText(/No overlays yet/)).toBeInTheDocument();
    await user.upload(
      screen.getByLabelText("Add image"),
      new File(["image"], "hat.png", { type: "image/png" }),
    );

    expect(onAddFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "hat.png", type: "image/png" }),
    );
  });

  it("edits visibility, grouping, anchors, and transforms without touching model data", async () => {
    const user = userEvent.setup();
    const onSetVisible = vi.fn();
    const onPatchTransform = vi.fn();
    const onUpdateProp = vi.fn();
    const onDuplicateProp = vi.fn();
    const onRemoveProp = vi.fn();
    const onCycleGroup = vi.fn();
    const onSpawnBurst = vi.fn();
    render(
      <OverlaysPanel
        {...makePanelProps({
          props: [{ ...baseProp, groupId: "faces" }],
          onSetVisible,
          onPatchTransform,
          onUpdateProp,
          onDuplicateProp,
          onRemoveProp,
          onCycleGroup,
          onSpawnBurst,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Hide" }));
    fireEvent.change(screen.getByLabelText("X position Prop"), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText("Group Prop"), {
      target: { value: "hats" },
    });
    await user.selectOptions(screen.getByLabelText("Anchor Prop"), "modelRoot");
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    await user.click(screen.getByRole("button", { name: "Previous" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Reset transform" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Show group" }));

    expect(onSetVisible).toHaveBeenCalledWith("prop-1", false);
    expect(onPatchTransform).toHaveBeenCalledWith("prop-1", { x: 12 });
    expect(onUpdateProp).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "hats" }),
    );
    expect(onUpdateProp).toHaveBeenCalledWith(
      expect.objectContaining({
        anchor: expect.objectContaining({ target: { kind: "modelRoot" } }),
      }),
    );
    expect(onDuplicateProp).toHaveBeenCalledWith("prop-1");
    expect(onCycleGroup).toHaveBeenCalledWith("faces", "previous");
    expect(onCycleGroup).toHaveBeenCalledWith("faces", "next");
    expect(onPatchTransform).toHaveBeenCalledWith("prop-1", {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
    });
    expect(onRemoveProp).toHaveBeenCalledWith("prop-1");
    expect(onSpawnBurst).toHaveBeenCalledWith(["prop-1"]);
  });

  it("handles API asset errors and refresh actions without exposing invalid rows", async () => {
    const user = userEvent.setup();
    const asset = {
      assetId: "asset-1",
      grantId: "grant-write",
      mimeType: "image/png",
      bytes: 12,
      secondsRemaining: 4.8,
      extended: false,
    };
    const onListApiAssets = vi
      .fn()
      .mockResolvedValueOnce([asset, { assetId: 7 }])
      .mockResolvedValueOnce([]);
    const onExtendApiAsset = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: "asset_unavailable", message: "expired" },
    });
    const onRevokeApiAsset = vi.fn().mockResolvedValue(undefined);

    render(
      <OverlaysPanel
        {...makePanelProps({
          apiGrants: [
            {
              id: "grant-write",
              appName: "Overlay Tool",
              scopes: ["write:props"],
              originBinding: "no-origin",
              createdAt: 1,
              lastUsedAt: null,
            },
          ],
          onCreateApiAsset: vi.fn(),
          onListApiAssets,
          onExtendApiAsset,
          onRevokeApiAsset,
        })}
      />,
    );

    await screen.findByText("asset-1");
    expect(screen.getAllByTestId("viewer-api-prop-asset-row")).toHaveLength(1);
    expect(screen.getByText(/Expires in 4s/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Extend" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Error: expired (asset_unavailable)",
    );
    expect(onExtendApiAsset).toHaveBeenCalledWith("grant-write", "asset-1");

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() =>
      expect(screen.queryByTestId("viewer-api-prop-asset-row")).toBeNull(),
    );
    expect(onRevokeApiAsset).toHaveBeenCalledWith("grant-write", "asset-1");
  });
});

describe("prop action integration", () => {
  it("runs prop visibility through the action runner capability", async () => {
    const setPropVisible = vi.fn();
    const runner = new ViviActionRunner(
      { setPropVisible },
      { scopes: ["write:props"] },
    );

    const event = await runner.runAction({
      id: "show-prop",
      name: "Show prop",
      kind: "propVisibility",
      enabled: true,
      payload: { propId: "prop-1", visible: true },
    });

    expect(event.status).toBe("completed");
    expect(setPropVisible).toHaveBeenCalledWith("prop-1", true);
  });

  it("keeps burst action payloads within the prop burst limit", () => {
    expect(() =>
      propSpawnBurstPayloadSchema.parse({
        propIds: Array.from({ length: 17 }, (_, index) => `prop-${index}`),
      }),
    ).toThrow();
  });

  it("aligns prop transform action scale bounds with prop schema bounds", () => {
    expect(() =>
      propTransformPayloadSchema.parse({
        propId: "prop-1",
        transform: { scaleX: 0.001 },
      }),
    ).toThrow();
  });
});
