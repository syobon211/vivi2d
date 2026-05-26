import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  MAX_PENDING_ASSETS_PER_GRANT,
  MAX_PENDING_BYTES_PER_GRANT,
  createViewerApiAssetBroker,
} = require("../../electron/viewer-api-asset-broker.cjs");

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function makePngBase64(
  width = 1,
  height = 1,
  extraChunks: string[] = [],
): string {
  const chunkBytes = extraChunks.length * 12;
  const bytes = new Uint8Array(33 + chunkBytes);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  let offset = 33;
  for (const chunk of extraChunks) {
    view.setUint32(offset, 0, false);
    bytes.set([...chunk].map((char) => char.charCodeAt(0)), offset + 4);
    offset += 12;
  }
  return base64(bytes);
}

function makeWebpBase64({ flags = 0, extraChunk }: { flags?: number; extraChunk?: string } = {}) {
  const extraBytes = extraChunk ? 8 : 0;
  const bytes = new Uint8Array(30 + extraBytes);
  const view = new DataView(bytes.buffer);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, bytes.length - 8, true);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x58], 12);
  view.setUint32(16, 10, true);
  bytes[20] = flags;
  if (extraChunk) {
    bytes.set([...extraChunk].map((char) => char.charCodeAt(0)), 30);
    view.setUint32(34, 0, true);
  }
  return base64(bytes);
}

const grant = {
  id: "grant-1",
  appName: "Fixture Client",
  scopes: ["read:state", "write:props"],
  originBinding: "no-origin",
};

const browserGrant = {
  ...grant,
  id: "grant-browser",
  originBinding: "http://client.example",
};

function issuePng(broker: ReturnType<typeof createViewerApiAssetBroker>, overrides = {}) {
  return broker.issue(
    {
      grantId: grant.id,
      displayName: "C:/Users/Alice/private-badge.png",
      mimeType: "image/png",
      bytesBase64: makePngBase64(),
      ...overrides,
    },
    grant,
  );
}

describe("viewer-api-asset-broker.cjs", () => {
  it("issues opaque grant-bound handles without leaking local paths", () => {
    const broker = createViewerApiAssetBroker();
    const result = issuePng(broker);

    expect(result.ok).toBe(true);
    expect(result.asset.assetId).toMatch(/^vpa_[A-Za-z0-9_-]+$/);
    expect(result.asset.assetId).not.toContain("private-badge");
    expect(JSON.stringify(result.asset)).not.toContain("C:/Users");
    expect(result.asset.grantId).toBe("grant-1");
    expect(result.asset.bytes).toBe(33);
  });

  it("reserves and consumes a handle exactly once after renderer acceptance", () => {
    const broker = createViewerApiAssetBroker();
    const issued = issuePng(broker);
    const checkout = broker.checkout(
      {
        kind: "filePickerAsset",
        assetId: issued.asset.assetId,
        mimeType: "image/png",
        bytes: 33,
      },
      grant,
      null,
    );

    expect(checkout.ok).toBe(true);
    expect(checkout.source.kind).toBe("inlineBase64");
    expect(broker.consume(checkout.reservation)).toBe(true);
    expect(
      broker.checkout(
        {
          kind: "filePickerAsset",
          assetId: issued.asset.assetId,
          mimeType: "image/png",
          bytes: 33,
        },
        grant,
        null,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "asset_unavailable", details: { reason: "not_found" } },
    });
  });

  it("releases reserved handles on renderer rejection", () => {
    const broker = createViewerApiAssetBroker();
    const issued = issuePng(broker);
    const source = {
      kind: "filePickerAsset",
      assetId: issued.asset.assetId,
      mimeType: "image/png",
      bytes: 33,
    };
    const first = broker.checkout(source, grant, null);
    expect(first.ok).toBe(true);
    expect(broker.release(first.reservation)).toBe(true);
    const second = broker.checkout(source, grant, null);
    expect(second.ok).toBe(true);
  });

  it("keeps reservation tokens scoped to a single checkout", () => {
    const broker = createViewerApiAssetBroker();
    const issued = issuePng(broker);
    const source = {
      kind: "filePickerAsset",
      assetId: issued.asset.assetId,
      mimeType: "image/png",
      bytes: 33,
    };
    const reserved = broker.checkout(source, grant, null);
    expect(reserved.ok).toBe(true);
    expect(broker.checkout(source, grant, null)).toMatchObject({
      ok: false,
      error: { code: "asset_unavailable", details: { reason: "consumed" } },
    });
    expect(
      broker.consume({
        assetId: issued.asset.assetId,
        token: "wrong-token",
      }),
    ).toBe(false);
    expect(broker.consume(reserved.reservation)).toBe(true);
    expect(broker.consume(reserved.reservation)).toBe(false);
  });

  it("rejects expired, wrong-grant, and wrong-origin lookups", () => {
    let now = 1_000;
    const broker = createViewerApiAssetBroker({ now: () => now });
    const issued = broker.issue(
      {
        mimeType: "image/png",
        bytesBase64: makePngBase64(),
        ttlMs: 60_000,
      },
      browserGrant,
    );
    const source = {
      kind: "filePickerAsset",
      assetId: issued.asset.assetId,
      mimeType: "image/png",
      bytes: 33,
    };

    expect(broker.checkout(source, grant, null)).toMatchObject({
      ok: false,
      error: { code: "asset_unavailable", details: { reason: "wrong_grant" } },
    });
    expect(broker.checkout(source, browserGrant, "http://other.example")).toMatchObject({
      ok: false,
      error: { code: "asset_unavailable", details: { reason: "wrong_origin" } },
    });

    now += 60_001;
    expect(broker.checkout(source, browserGrant, "http://client.example")).toMatchObject({
      ok: false,
      error: { code: "asset_unavailable", details: { reason: "not_found" } },
    });
  });

  it("invalidates pending assets when a grant is revoked", () => {
    const broker = createViewerApiAssetBroker();
    const one = issuePng(broker);
    const two = issuePng(broker);

    expect(broker.revokeGrant(grant.id)).toBe(2);
    expect(broker.listForGrant(grant.id)).toEqual([]);
    expect(broker.lookup(one.asset.assetId)).toBeNull();
    expect(broker.lookup(two.asset.assetId)).toBeNull();
  });

  it("cleans up expired handles and refuses to revoke already-expired assets", () => {
    let now = 5_000;
    const broker = createViewerApiAssetBroker({ now: () => now });
    const first = issuePng(broker, { ttlMs: 60_000 });
    const second = issuePng(broker, { ttlMs: 60_000 });

    now += 60_001;

    expect(broker.revoke(first.asset.assetId, grant)).toBe(false);
    expect(broker.cleanupExpired()).toBe(1);
    expect(broker.lookup(first.asset.assetId)).toBeNull();
    expect(broker.lookup(second.asset.assetId)).toBeNull();
  });

  it("enforces per-grant count and byte budgets before storing assets", () => {
    const broker = createViewerApiAssetBroker();
    for (let index = 0; index < MAX_PENDING_ASSETS_PER_GRANT; index += 1) {
      expect(issuePng(broker).ok).toBe(true);
    }
    expect(issuePng(broker)).toMatchObject({
      ok: false,
      error: { code: "asset_unavailable", details: { reason: "limit_exceeded" } },
    });

    const byteBroker = createViewerApiAssetBroker();
    const largePng = makePngBase64(2048, 2048);
    const first = byteBroker.issue(
      {
        mimeType: "image/png",
        bytesBase64: largePng,
      },
      grant,
    );
    expect(first.ok).toBe(true);
    const second = byteBroker.issue(
      {
        mimeType: "image/png",
        bytesBase64: "A".repeat(MAX_PENDING_BYTES_PER_GRANT),
      },
      grant,
    );
    expect(second.ok).toBe(false);
  });

  it("rejects animated formats for public API asset handles", () => {
    const broker = createViewerApiAssetBroker();
    expect(
      broker.issue(
        {
          mimeType: "image/png",
          bytesBase64: makePngBase64(1, 1, ["acTL"]),
        },
        grant,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_request" },
    });
    expect(
      broker.issue(
        {
          mimeType: "image/webp",
          bytesBase64: makeWebpBase64({ flags: 0x02 }),
        },
        grant,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_request" },
    });
  });

  it("rejects malformed base64 before attempting image inspection", () => {
    const broker = createViewerApiAssetBroker();
    expect(
      broker.issue(
        {
          mimeType: "image/png",
          bytesBase64: "not base64!",
        },
        grant,
      ),
    ).toMatchObject({
      ok: false,
      error: {
        code: "invalid_request",
        details: { field: "source", reason: "format" },
      },
    });
  });
});
