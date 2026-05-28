import { describe, expect, it } from "vitest";
import {
  analyzeAcceptedMaskPacket,
  canonicalRational,
  createAcceptedMaskAlphaHash,
  createAcceptedMaskPacket,
  createAcceptedMaskPacketRegistry,
  createAcceptedMaskPlacementHash,
  createProtectedRegionSetHash,
  createSourceMaskBytesHash,
  createDefaultAcceptedMaskPlacement,
  validateScopedSha256,
} from "../accepted-mask-packet";

const alpha = new Uint8Array([0, 255, 255, 0]);
const sourceBytes = new Uint8ClampedArray(2 * 2 * 4);
sourceBytes[0] = 11;
sourceBytes[15] = 222;

function packetInput(overrides = {}) {
  return {
    layerId: "layer-hair",
    manualSplitLayerId: "split-hair",
    manualSplitMaskId: "mask-hair",
    semanticRole: "hairFront" as const,
    riggingHint: "localBones" as const,
    width: 2,
    height: 2,
    alpha,
    sourceLayerId: "source",
    sourceTextureId: "texture",
    sourceFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    sourceWidth: 2,
    sourceHeight: 2,
    sourceBytes,
    sourceLayerRevision: "source-rev",
    sourceTextureRevision: "texture-rev",
    layerPath: ["group", "layer-hair"],
    layerBounds: { x: 10, y: 20, width: 4, height: 8 },
    ...overrides,
  };
}

describe("accepted mask packet", () => {
  it("creates scoped SHA-256 hashes and validates their scope", () => {
    const result = createAcceptedMaskPacket(packetInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validateScopedSha256(result.packet.acceptedMaskAlphaHash, "maskAlphaCanonical.v2")).toBe(
      true,
    );
    expect(
      validateScopedSha256(result.packet.acceptedMaskPlacementHash, "maskPlacementCanonical.v2"),
    ).toBe(true);
    expect(validateScopedSha256(`sha256:v1:${"a".repeat(64)}`, "maskAlphaCanonical.v2")).toBe(
      false,
    );
    expect(
      validateScopedSha256(
        `sha256:v1:maskAlphaCanonical.v2:${"A".repeat(64)}`,
        "maskAlphaCanonical.v2",
      ),
    ).toBe(false);
  });

  it("hashes the editor-owned alpha copy instead of caller-owned alpha", () => {
    const callerAlpha = new Uint8Array([0, 255, 255, 0]);
    const result = createAcceptedMaskPacket(packetInput({ alpha: callerAlpha }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const originalHash = result.packet.acceptedMaskAlphaHash;
    callerAlpha.fill(0);

    expect(result.packet.acceptedMaskAlphaHash).toBe(originalHash);
    expect((result.packet as { alpha?: unknown }).alpha).toBeUndefined();
    expect(analyzeAcceptedMaskPacket(result.packet, "alphaSummary", {})).toEqual(
      expect.objectContaining({ opaquePixels: 2, alphaSum: 510 }),
    );
    expect(JSON.stringify(result.packet)).not.toContain('"alpha"');
    expect(
      createAcceptedMaskAlphaHash({
        width: result.packet.width,
        height: result.packet.height,
        semanticRole: result.packet.semanticRole,
        manualSplitMaskId: result.packet.manualSplitMaskId,
        sourceLayerId: result.packet.sourceLayerId,
        sourceTextureId: result.packet.sourceTextureId,
        layerPath: result.packet.layerPath,
        alpha: callerAlpha,
      }),
    ).not.toBe(originalHash);
  });

  it("hashes the editor-owned source texture bytes instead of caller-owned bytes", () => {
    const sourceBytes = new Uint8ClampedArray(2 * 2 * 4);
    sourceBytes[0] = 11;
    sourceBytes[15] = 222;
    const result = createAcceptedMaskPacket(
      packetInput({ sourceBytes, sourceWidth: 2, sourceHeight: 2 }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const originalHash = result.packet.sourceMaskBytesHash;
    sourceBytes.fill(0);

    expect(result.packet.sourceMaskBytesHash).toBe(originalHash);
    expect(
      createSourceMaskBytesHash({
        sourceLayerId: result.packet.sourceLayerId,
        sourceTextureId: result.packet.sourceTextureId,
        width: 2,
        height: 2,
        sourceFingerprint: result.packet.sourceLayerRevision,
        bytes: new Uint8Array(sourceBytes),
      }),
    ).not.toBe(originalHash);
  });

  it("rejects SharedArrayBuffer-backed alpha", () => {
    if (typeof SharedArrayBuffer === "undefined") return;
    const shared = new SharedArrayBuffer(4);
    const result = createAcceptedMaskPacket(
      packetInput({ alpha: new Uint8Array(shared) }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("invalidAlpha");
  });

  it("rejects SharedArrayBuffer-backed source bytes", () => {
    if (typeof SharedArrayBuffer === "undefined") return;
    const shared = new SharedArrayBuffer(16);
    const result = createAcceptedMaskPacket(
      packetInput({ sourceBytes: new Uint8Array(shared), sourceWidth: 2, sourceHeight: 2 }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("invalidSource");
  });

  it("rejects resizable ArrayBuffer-backed alpha when the runtime supports it", () => {
    const ArrayBufferCtor = ArrayBuffer as typeof ArrayBuffer & {
      new (byteLength: number, options: { maxByteLength: number }): ArrayBuffer;
    };
    let resizable: ArrayBuffer | undefined;
    try {
      resizable = new ArrayBufferCtor(4, { maxByteLength: 8 });
    } catch {
      return;
    }
    const result = createAcceptedMaskPacket(
      packetInput({ alpha: new Uint8Array(resizable) }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("invalidAlpha");
  });

  it("quarantines duplicate registry identities instead of using last-write wins", () => {
    const registry = createAcceptedMaskPacketRegistry([
      packetInput({ layerId: "same-layer", manualSplitMaskId: "mask-a" }),
      packetInput({
        layerId: "same-layer",
        manualSplitLayerId: "split-b",
        manualSplitMaskId: "mask-b",
      }),
    ]);

    expect(registry.hasConflicts).toBe(true);
    expect(registry.byLayerId.has("same-layer")).toBe(false);
    expect(registry.rejected).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "duplicateLayerId" })]),
    );
  });

  it("changes placement hash when only transform-relevant bounds change", () => {
    const basePlacement = createDefaultAcceptedMaskPlacement({
      layerBounds: { x: 0, y: 0, width: 20, height: 20 },
      maskWidth: 10,
      maskHeight: 10,
    });
    const movedPlacement = createDefaultAcceptedMaskPlacement({
      layerBounds: { x: 1, y: 0, width: 20, height: 20 },
      maskWidth: 10,
      maskHeight: 10,
    });
    const baseHash = createAcceptedMaskPlacementHash({
      manualSplitLayerId: "split",
      sourceLayerId: "source",
      layerPath: ["layer"],
      placement: basePlacement,
    });
    const movedHash = createAcceptedMaskPlacementHash({
      manualSplitLayerId: "split",
      sourceLayerId: "source",
      layerPath: ["layer"],
      placement: movedPlacement,
    });

    expect(movedHash).not.toBe(baseHash);
  });

  it("encodes layer path segments without slash-join collisions", () => {
    const alpha = new Uint8Array([0, 255, 255, 0]);
    const placement = createDefaultAcceptedMaskPlacement({
      layerBounds: { x: 0, y: 0, width: 2, height: 2 },
      maskWidth: 2,
      maskHeight: 2,
    });
    const leftPath = ["a/b", "c"];
    const rightPath = ["a", "b/c"];

    expect(
      createAcceptedMaskAlphaHash({
        width: 2,
        height: 2,
        semanticRole: "hair",
        manualSplitMaskId: "mask",
        sourceLayerId: "source",
        sourceTextureId: "texture",
        layerPath: leftPath,
        alpha,
      }),
    ).not.toBe(
      createAcceptedMaskAlphaHash({
        width: 2,
        height: 2,
        semanticRole: "hair",
        manualSplitMaskId: "mask",
        sourceLayerId: "source",
        sourceTextureId: "texture",
        layerPath: rightPath,
        alpha,
      }),
    );
    expect(
      createAcceptedMaskPlacementHash({
        manualSplitLayerId: "split",
        sourceLayerId: "source",
        layerPath: leftPath,
        placement,
      }),
    ).not.toBe(
      createAcceptedMaskPlacementHash({
        manualSplitLayerId: "split",
        sourceLayerId: "source",
        layerPath: rightPath,
        placement,
      }),
    );
  });

  it("changes protected-region hash when crop generation changes", () => {
    const base = createProtectedRegionSetHash({
      semanticPolicyId: "policy.semantic.v1.secondary",
      semanticPolicyVersion: 1,
      protectedRegionSetRevision: "rev",
      regions: [{
        id: "face",
        role: "face",
        bounds: { x: 0, y: 0, width: 10, height: 10 },
        cropGeneration: 1,
      }],
    });
    const changed = createProtectedRegionSetHash({
      semanticPolicyId: "policy.semantic.v1.secondary",
      semanticPolicyVersion: 1,
      protectedRegionSetRevision: "rev",
      regions: [{
        id: "face",
        role: "face",
        bounds: { x: 0, y: 0, width: 10, height: 10 },
        cropGeneration: 2,
      }],
    });

    expect(changed).not.toBe(base);
  });

  it("requires canonical rational placement values", () => {
    expect(canonicalRational(2, 4)).toEqual({ numerator: 1n, denominator: 2n });
    const result = createAcceptedMaskPacket(
      packetInput({
        placement: {
          layerBounds: { x: 0, y: 0, width: 2, height: 2 },
          maskToLayerTransform: {
            scaleX: { numerator: 2n, denominator: 4n },
            scaleY: canonicalRational(1),
            offsetX: canonicalRational(0),
            offsetY: canonicalRational(0),
          },
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("invalidPlacement");
  });

  it("normalizes default placement construction failures into invalidPlacement", () => {
    const result = createAcceptedMaskPacket(
      packetInput({ layerBounds: { x: 0.5, y: 0, width: 2, height: 2 } }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("invalidPlacement");
  });
});
