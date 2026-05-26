import { describe, expect, it, vi } from "vitest";
import {
  isViewerApiRendererRequestPayload,
  resolveViewerApiRendererRequest,
} from "../api/viewer-api-renderer-requests";
import {
  DEFAULT_TRACKING_CHANNEL_CALIBRATION,
} from "../calibration/calibration-types";
import type { ViviProp } from "../props/prop-types";

const baseProp: ViviProp = {
  id: "prop-1",
  name: "Hat",
  kind: "image",
  visible: true,
  drawOrder: 1,
  opacity: 1,
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
  source: {
    kind: "inlineBase64",
    mimeType: "image/png",
    bytes: "AAAA",
    portable: true,
  },
};

function makePngBase64(): string {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, 1, false);
  view.setUint32(20, 1, false);
  return Buffer.from(bytes).toString("base64");
}

function makeContext(overrides: Partial<{ props: ViviProp[] }> = {}) {
  const dispatch = vi.fn(async () => ({ accepted: true }));
  return {
    dispatch,
    snapshot: () => ({
      props: overrides.props ?? [baseProp],
      calibration: {
        activeProfileId: "balanced",
        profiles: [
          {
            version: 1 as 1,
            id: "balanced",
            name: "Balanced",
            channels: {
              "face.mouthOpen": DEFAULT_TRACKING_CHANNEL_CALIBRATION,
            },
          },
        ],
        diagnostics: [
          {
            channelId: "face.mouthOpen",
            source: "face" as const,
            raw: 0.5,
            value: 0.4,
            calibrated: true,
            clipped: false,
            stale: false,
            observedMin: 0.1,
            observedMax: 0.9,
          },
        ],
        observedRanges: [],
      },
    }),
  };
}

describe("viewer-api renderer request resolver", () => {
  it("validates renderer request payload shape", () => {
    expect(
      isViewerApiRendererRequestPayload({
        requestId: "req",
        type: "viewer.props.list",
        data: {},
        scopes: ["read:props"],
      }),
    ).toBe(true);
    expect(isViewerApiRendererRequestPayload({ requestId: "req" })).toBe(false);
  });

  it("returns public prop summaries without leaking image bytes", async () => {
    const response = await resolveViewerApiRendererRequest(
      {
        requestId: "req",
        type: "viewer.props.list",
        data: {},
        scopes: ["read:props"],
      },
      makeContext(),
    );

    expect(response.ok).toBe(true);
    expect(response.data.props).toEqual([
      expect.objectContaining({
        id: "prop-1",
        source: expect.objectContaining({ bytes: 3 }),
      }),
    ]);
    expect(JSON.stringify(response.data)).not.toContain("AAAA");
  });

  it("returns calibration diagnostics as summaries without raw values", async () => {
    const response = await resolveViewerApiRendererRequest(
      {
        requestId: "req",
        type: "viewer.calibration.get",
        data: {},
        scopes: ["read:calibration"],
      },
      makeContext(),
    );

    expect(response.ok).toBe(true);
    expect(response.data.calibration).toMatchObject({
      activeProfileId: "balanced",
      profileCount: 1,
    });
    expect(JSON.stringify(response.data)).not.toContain("\"raw\"");
    expect(JSON.stringify(response.data)).toContain("observedMin");
  });

  it("dispatches inline prop loads through the controller boundary", async () => {
    const context = makeContext();
    const response = await resolveViewerApiRendererRequest(
      {
        requestId: "req",
        type: "viewer.prop.load",
        data: {
          name: "Badge",
          visible: false,
          groupId: "badges",
          transform: { x: 12, opacity: 0.6 },
          anchor: { kind: "modelRoot" },
          source: {
            kind: "inlineBase64",
            mimeType: "image/png",
            bytes: makePngBase64(),
          },
        },
        scopes: ["write:props"],
      },
      context,
    );

    expect(response.ok).toBe(true);
    expect(response.data.prop).toMatchObject({
      name: "Badge",
      visible: false,
      groupId: "badges",
      opacity: 0.6,
      transform: expect.objectContaining({ x: 12 }),
      anchor: { kind: "modelRoot" },
      source: expect.objectContaining({
        kind: "inlineBase64",
        mimeType: "image/png",
        portable: true,
      }),
    });
    expect(JSON.stringify(response.data)).not.toContain(makePngBase64());
    expect(context.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "props.add",
        prop: expect.objectContaining({
          id: expect.stringMatching(/^prop-api-/),
          kind: "image",
          source: expect.objectContaining({ portable: true }),
        }),
      }),
    );
  });

  it("keeps unavailable prop asset handles out of the renderer", async () => {
    const response = await resolveViewerApiRendererRequest(
      {
        requestId: "req",
        type: "viewer.prop.load",
        data: {
          source: {
            kind: "filePickerAsset",
            assetId: "asset-1",
            mimeType: "image/png",
            bytes: 128,
          },
        },
        scopes: ["write:props"],
      },
      makeContext(),
    );

    expect(response).toMatchObject({
      ok: false,
      data: { accepted: false },
      reason: "asset unavailable",
    });
  });

  it("dispatches prop updates only with the write prop scope", async () => {
    const denied = await resolveViewerApiRendererRequest(
      {
        requestId: "req",
        type: "viewer.prop.update",
        data: { propId: "prop-1", visible: false },
        scopes: ["read:props"],
      },
      makeContext(),
    );
    expect(denied).toMatchObject({ ok: false, reason: "prop scope denied" });

    const context = makeContext();
    const accepted = await resolveViewerApiRendererRequest(
      {
        requestId: "req",
        type: "viewer.prop.update",
        data: {
          propId: "prop-1",
          visible: false,
          transform: { x: 12, opacity: 0.5 },
          anchor: { kind: "modelRoot" },
        },
        scopes: ["write:props"],
      },
      context,
    );

    expect(accepted.ok).toBe(true);
    expect(context.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "props.update",
        prop: expect.objectContaining({
          visible: false,
          opacity: 0.5,
          transform: expect.objectContaining({ x: 12 }),
          anchor: expect.objectContaining({ target: { kind: "modelRoot" } }),
        }),
      }),
    );
  });

  it("rejects unsupported defensive anchor values instead of silently defaulting", async () => {
    await expect(
      resolveViewerApiRendererRequest(
        {
          requestId: "req",
          type: "viewer.prop.update",
          data: { propId: "prop-1", anchor: { kind: "bone" } },
          scopes: ["write:props"],
        },
        makeContext(),
      ),
    ).rejects.toThrow("unsupported prop anchor kind");
  });

  it("dispatches remove and group-cycle commands", async () => {
    const context = makeContext();
    await resolveViewerApiRendererRequest(
      {
        requestId: "remove",
        type: "viewer.prop.remove",
        data: { propId: "prop-1" },
        scopes: ["write:props"],
      },
      context,
    );
    await resolveViewerApiRendererRequest(
      {
        requestId: "cycle",
        type: "viewer.prop.group.cycle",
        data: { groupId: "faces", direction: "previous" },
        scopes: ["write:props"],
      },
      context,
    );

    expect(context.dispatch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: "props.remove", propId: "prop-1" }),
    );
    expect(context.dispatch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: "props.cycleGroup",
        groupId: "faces",
        direction: "previous",
      }),
    );
  });
});
