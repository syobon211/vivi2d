// @vitest-environment node
import * as fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import embeddedFixture from "../../tests/conformance/project-embedded-round-trip-v11/manifest.json";
import { LocalAssetCopyCoordinator, type NativeLocalAsset } from "../local-asset-copy";
import { LocalExchangeHost } from "../local-exchange-host";

// Real persisted F cells and actual main adapter. Only the native module is a
// controlled participant here; separate actual Electron tests cover Rust/SQLite.
const temporaryRoot = path.resolve("tmp");
const owned: Array<{
  root: string;
  host: LocalExchangeHost;
  copy: LocalAssetCopyCoordinator;
}> = [];
const documentId = "123e4567-e89b-42d3-a456-426614174000";
const asset = {
  objectAddress: "ab".repeat(32),
  contentSha256: "ab".repeat(32),
  storageKind: "blob" as const,
  mediaType: "image/png",
  sizeBytes: 1,
};
const ready = {
  status: "ready" as const,
  verified: {
    asset,
    png: { profile: "vivi2d.png.rgba8.v1" as const, width: 1, height: 1 },
  },
};
const request = () => ({
  kind: "referenced" as const,
  atlasId: "atlas",
  reference: { ...asset },
  declaredWidth: 1,
  declaredHeight: 1,
});
afterEach(async () => {
  for (const entry of owned.splice(0)) {
    await entry.copy.close();
    entry.host.close();
    expect(path.dirname(entry.root)).toBe(temporaryRoot);
    expect(path.basename(entry.root)).toMatch(/^local-asset-copy-test-/);
    fs.rmSync(entry.root, { recursive: true, force: true });
  }
});
async function fixture(native: NativeLocalAsset, preview = false) {
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(temporaryRoot, "local-asset-copy-test-"));
  const host = await LocalExchangeHost.open({
    root: path.join(root, "local-exchange-v1"),
    ownsProcessLock: true,
  });
  const cell = await host.createWorkspace(documentId);
  const replica = await host.createReplica(cell.cellId);
  const copy = new LocalAssetCopyCoordinator({
    userData: root,
    host,
    native,
    // Test-only main configuration; never renderer capability authority.
    copyCapabilities: preview
      ? () => new Map([["vivi.cap.referencedAssets", 1]])
      : undefined,
  });
  const entry = { root, host, copy, cell, replica };
  owned.push(entry);
  return entry;
}
function module() {
  return {
    abiVersion: 1 as const,
    start: vi.fn<NativeLocalAsset["start"]>(() => ({
      token: {},
      result: Promise.resolve(ready),
    })),
    cancel: vi.fn(),
    close: vi.fn(async () => {}),
  };
}
function endpoint(bytes: Buffer) {
  const length = bytes.readUInt32LE(0);
  return {
    path: bytes.toString("utf8", 8, 8 + length),
    principal: bytes.subarray(8 + length),
  };
}

it("binds only persisted non-frozen cells, keeps stable namespaces after reopen, and separates replicas", async () => {
  const native = module();
  const f = await fixture(native);
  const source = f.copy.createAuthoringPorts(f.cell.cellId);
  await source.resolveReferencedAtlas(request());
  const first = endpoint(native.start.mock.calls[0]![1]);
  expect(first.path.startsWith(path.join(f.root, "asset-stores-v1") + path.sep)).toBe(
    true,
  );
  expect(first.principal.toString()).toBe(
    `vivi2d.electron.local-asset-store.principal.v1\0${f.cell.scopeId}\0${f.cell.replicaId}`,
  );
  await f.copy.createAuthoringPorts(f.replica.cellId).resolveReferencedAtlas(request());
  expect(endpoint(native.start.mock.calls[1]![1]).path).not.toBe(first.path);
  expect(() => f.copy.createAuthoringPorts("0".repeat(64))).toThrow();
  f.host.close();
  const reopened = await LocalExchangeHost.open({
    root: path.join(f.root, "local-exchange-v1"),
    ownsProcessLock: true,
  });
  const copy = new LocalAssetCopyCoordinator({
    userData: f.root,
    host: reopened,
    native,
  });
  try {
    await copy.createAuthoringPorts(f.cell.cellId).resolveReferencedAtlas(request());
    expect(endpoint(native.start.mock.calls[2]![1])).toEqual(first);
    const cellFile = path.join(
      f.root,
      "local-exchange-v1/cells",
      `${f.cell.cellId}.json`,
    );
    fs.appendFileSync(cellFile, " ");
    expect(() => copy.createAuthoringPorts(f.cell.cellId)).toThrow();
    expect(native.start).toHaveBeenCalledTimes(3);
  } finally {
    await copy.close();
    reopened.close();
  }
});

it("copies closed EDH request data before await and rejects accessors, extra fields, and malformed base64", async () => {
  const native = module();
  const f = await fixture(native);
  const ports = f.copy.createAuthoringPorts(f.cell.cellId);
  const input = request();
  input.reference.objectAddress = input.reference.objectAddress.toUpperCase();
  const result = ports.resolveReferencedAtlas(input);
  input.reference.sizeBytes = 500;
  const transport = native.start.mock.calls[0]![3]!;
  expect(transport.readBigUInt64LE(72)).toBe(1n);
  expect(transport.subarray(8, 40).toString("hex")).toBe(asset.objectAddress);
  await expect(result).resolves.toEqual(ready);
  await expect(
    ports.resolveReferencedAtlas({ ...request(), path: "not-authority" } as never),
  ).rejects.toThrow();
  const accessor = {
    ...request(),
    reference: Object.defineProperty({ ...asset }, "sizeBytes", {
      get: () => {
        throw Error("private-canary");
      },
    }),
  };
  await expect(ports.resolveReferencedAtlas(accessor)).rejects.toThrow(
    "LOCAL_ASSET_INVALID_ARGUMENT",
  );
  const embedded = {
    kind: "embedded" as const,
    atlasId: "atlas",
    imageBase64: "YQ==",
    declaredWidth: 1,
    declaredHeight: 1,
  };
  await expect(
    ports.materializeEmbeddedAtlas({ ...embedded, imageBase64: "Y!==" }),
  ).rejects.toThrow();
  await expect(ports.materializeEmbeddedAtlas(embedded)).resolves.toEqual(ready.verified);
  expect(native.start.mock.calls[1]![4]).toEqual(Buffer.from("a"));
  expect(native.start).toHaveBeenCalledTimes(2);
});

it("keeps one physical slot through cancellation until actual settlement and never cancels a different binding", async () => {
  const native = module();
  let finish!: (value: typeof ready) => void;
  const token = {};
  native.start.mockImplementationOnce(() => ({
    token,
    result: new Promise((resolve) => {
      finish = resolve;
    }),
  }));
  const f = await fixture(native);
  const source = f.copy.createAuthoringPorts(f.cell.cellId);
  const receiver = f.copy.createAuthoringPorts(f.replica.cellId);
  const pending = source.resolveReferencedAtlas(request());
  await expect(receiver.resolveReferencedAtlas(request())).rejects.toThrow(
    "LOCAL_ASSET_BUSY",
  );
  receiver.dispose();
  expect(native.cancel).not.toHaveBeenCalled();
  source.dispose();
  expect(native.cancel).toHaveBeenCalledExactlyOnceWith(token);
  const replacement = f.copy.createAuthoringPorts(f.cell.cellId);
  await expect(replacement.resolveReferencedAtlas(request())).rejects.toThrow(
    "LOCAL_ASSET_BUSY",
  );
  finish(ready);
  await expect(pending).resolves.toEqual(ready);
  await expect(replacement.resolveReferencedAtlas(request())).resolves.toEqual(ready);
  await expect(source.resolveReferencedAtlas(request())).rejects.toThrow(
    "LOCAL_ASSET_UNAVAILABLE",
  );
  expect(native.start).toHaveBeenCalledTimes(2);
});

it("keeps referenced copy unavailable before real consumer binding and redacts lost mutating results", async () => {
  const native = module();
  const f = await fixture(native);
  const select = vi.fn(async () => "private-path-canary.vivi");
  await expect(
    f.copy.prepare({}, f.cell.cellId, f.replica.cellId, select),
  ).rejects.toThrow("LOCAL_ASSET_UNAVAILABLE");
  expect(select).not.toHaveBeenCalled();
  expect(native.start).not.toHaveBeenCalled();
  expect(fs.readdirSync(path.join(f.root, "asset-stores-v1"))).toEqual([]);
  native.start.mockImplementationOnce(() => ({
    token: {},
    result: Promise.reject(new Error("private-path-canary")),
  }));
  const ports = f.copy.createAuthoringPorts(f.cell.cellId);
  await expect(
    ports.materializeEmbeddedAtlas({
      kind: "embedded",
      atlasId: "atlas",
      imageBase64: "YQ==",
      declaredWidth: 1,
      declaredHeight: 1,
    }),
  ).rejects.toMatchObject({
    message: "LOCAL_ASSET_INTERNAL",
    outcomeMayHaveCommitted: true,
  });
  // A lost result cannot wedge the physical slot or falsely imply no publication.
  await expect(ports.resolveReferencedAtlas(request())).resolves.toEqual(ready);
});

function previewFile(root: string, embedded = false, count = 1, id = documentId) {
  const file = path.join(root, "selected.vivi");
  const bytes = Buffer.from(
    JSON.stringify({
      version: 11,
      assetMode: embedded ? "embedded" : "referenced",
      documentId: id,
      project: {
        name: "Preview boundary",
        width: 64,
        height: 64,
        layers: [],
        parameters: [],
        clips: [],
        scenes: [],
        physicsGroups: [],
        lipsyncConfig: {
          enabled: false,
          targetParameterId: null,
          source: "microphone",
          threshold: 0.02,
          smoothing: 0.7,
          gain: 2,
        },
        skins: {},
        parameterBindings: [],
        sceneBlends: [],
        ikControllers: [],
        offscreenTargets: [],
        expressionPresets: [],
        colliders: [],
        stateMachines: [],
      },
      atlases: Array.from({ length: count }, (_, index) => ({
        id: `atlas_${index}`,
        image: embedded ? "AA==" : asset,
        width: 1,
        height: 1,
        entries: [],
      })),
      ...(embedded
        ? {}
        : {
            requires: [
              { id: "vivi.cap.referencedAssets", minVersion: 1, requiredFor: ["render"] },
            ],
          }),
    }),
  );
  fs.writeFileSync(file, bytes);
  return { file, bytes };
}

it("captures the exact selected Project and deduplicated owned closure without publishing or exposing paths", async () => {
  const native = module(),
    f = await fixture(native, true);
  const selected = previewFile(f.root, false, 2);
  const payload = Buffer.from([7]);
  native.start.mockImplementation(() => ({
    token: {},
    result: Promise.resolve({
      ...ready,
      objects: [{ objectAddress: asset.objectAddress, bytes: payload }],
    }),
  }));
  const response = await f.copy.preview({}, f.cell.cellId, async () => selected.file);
  expect(response?.sourceBytes).toEqual(Uint8Array.from(selected.bytes));
  expect(response?.objects).toEqual([
    { objectAddress: asset.objectAddress, bytes: new Uint8Array([7]) },
  ]);
  expect(response?.atlasResolutions).toHaveLength(2);
  expect(native.start.mock.calls.map((call) => [call[0], call[2], call[4]])).toEqual([
    [4, null, null],
    [4, null, null],
  ]);
  payload[0] = 99;
  expect(response?.objects[0]?.bytes[0]).toBe(7);
  const text = JSON.stringify(response);
  expect(text).not.toContain(f.root);
  expect(text).not.toContain(f.cell.scopeId);
  expect(text).not.toContain(f.cell.replicaId);
  const embedded = previewFile(f.root, true);
  native.start.mockClear();
  expect(
    (await f.copy.preview({}, f.cell.cellId, async () => embedded.file))?.objects,
  ).toEqual([]);
  expect(native.start).not.toHaveBeenCalled();
});

it("rejects mismatched documents before native reads and a later hard error after Missing", async () => {
  const native = module(),
    f = await fixture(native, true);
  const mismatch = previewFile(f.root, false, 1, "123e4567-e89b-42d3-a456-426614174001");
  await expect(
    f.copy.preview({}, f.cell.cellId, async () => mismatch.file),
  ).rejects.toThrow("LOCAL_ASSET_BINDING");
  expect(native.start).not.toHaveBeenCalled();
  const selected = previewFile(f.root, false, 2);
  native.start.mockImplementationOnce(() => ({
    token: {},
    result: Promise.resolve({ status: "missing" }),
  }));
  native.start.mockImplementationOnce(() => ({
    token: {},
    result: Promise.resolve({
      status: "error",
      code: "LOCAL_ASSET_PNG_REJECTED",
      outcomeMayHaveCommitted: false,
    }),
  }));
  await expect(
    f.copy.preview({}, f.cell.cellId, async () => selected.file),
  ).rejects.toThrow("LOCAL_ASSET_PNG_REJECTED");
  expect(native.start).toHaveBeenCalledTimes(2);
});

it("keeps the preview slot until a cancelled dialog settles and drops a late native capture", async () => {
  const native = module(),
    f = await fixture(native, true),
    owner = {};
  const selected = previewFile(f.root);
  let choose!: (value: string) => void;
  const pending = f.copy.preview(
    owner,
    f.cell.cellId,
    () =>
      new Promise((resolve) => {
        choose = resolve;
      }),
  );
  f.copy.cancelPreview({}); // Other owner has no authority.
  f.copy.cancelPreview(owner);
  await expect(
    f.copy.preview({}, f.cell.cellId, async () => selected.file),
  ).rejects.toThrow("LOCAL_ASSET_BUSY");
  choose(selected.file);
  await expect(pending).rejects.toThrow("LOCAL_ASSET_CANCELLED");
  expect(native.start).not.toHaveBeenCalled();
  let finish!: (value: typeof ready) => void;
  native.start.mockImplementationOnce(() => ({
    token: {},
    result: new Promise((resolve) => {
      finish = resolve;
    }),
  }));
  const late = f.copy.preview(owner, f.cell.cellId, async () => selected.file);
  await vi.waitFor(() => expect(native.start).toHaveBeenCalledOnce());
  f.copy.rendererLost(owner);
  expect(native.cancel).toHaveBeenCalledOnce();
  finish(ready);
  await expect(late).rejects.toThrow("LOCAL_ASSET_CANCELLED");
});

it("rejects conflicting duplicate objects and treats lost export delivery as nonmutating", async () => {
  const native = module(),
    f = await fixture(native, true),
    selected = previewFile(f.root);
  native.start.mockImplementationOnce(() => ({
    token: {},
    result: Promise.resolve({
      ...ready,
      objects: [
        { objectAddress: asset.objectAddress, bytes: Buffer.from([1]) },
        { objectAddress: asset.objectAddress, bytes: Buffer.from([2]) },
      ],
    }),
  }));
  await expect(
    f.copy.preview({}, f.cell.cellId, async () => selected.file),
  ).rejects.toThrow("LOCAL_ASSET_INTERNAL");
  native.start.mockImplementationOnce(() => ({
    token: {},
    result: Promise.reject(new Error("private-path-canary")),
  }));
  await expect(
    f.copy.preview({}, f.cell.cellId, async () => selected.file),
  ).rejects.toMatchObject({
    code: "LOCAL_ASSET_INTERNAL",
    outcomeMayHaveCommitted: false,
  });
});

it("rejects a source-cell revision change while the selection dialog was open", async () => {
  const native = module(),
    f = await fixture(native, true);
  const selected = previewFile(f.root, true, 0);
  let choose!: (value: string) => void;
  const pending = f.copy.preview(
    {},
    f.cell.cellId,
    () =>
      new Promise((resolve) => {
        choose = resolve;
      }),
  );
  await f.host.publish(
    f.cell.cellId,
    "123e4567-e89b-42d3-a456-426614174002",
    f.cell.state.head,
    new TextEncoder().encode(embeddedFixture.documents[0]!.canonicalUtf8!),
  );
  choose(selected.file);
  await expect(pending).rejects.toThrow("LOCAL_ASSET_STALE");
  expect(native.start).not.toHaveBeenCalled();
});
