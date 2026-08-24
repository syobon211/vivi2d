// @vitest-environment node

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createReadOnlyAuthoringHost,
  ReadOnlyAuthoringHostError,
  type ReadOnlyAuthoringHostOptions,
  type ReferencedAtlasResolutionV1,
  type VerifiedAtlasAssetV1,
} from "../index";

const ZERO_BYTE_SHA256 =
  "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d";
const REFERENCED_CAPABILITY = "vivi.cap.referencedAssets";
const OPAQUE_CAPABILITY = "vivi.cap.opaqueTest";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function project(): Record<string, unknown> {
  return {
    name: "W7a",
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
  };
}

function embeddedWire(): Record<string, unknown> {
  return {
    version: 11,
    assetMode: "embedded",
    project: project(),
    atlases: [
      {
        id: "atlas_main",
        image: "AA==",
        width: 1,
        height: 1,
        entries: [],
      },
    ],
  };
}

function assetRef(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    objectAddress: ZERO_BYTE_SHA256,
    storageKind: "blob",
    contentSha256: ZERO_BYTE_SHA256,
    mediaType: "image/png",
    sizeBytes: 1,
    ...overrides,
  };
}

function referencedWire(): Record<string, unknown> {
  return {
    version: 11,
    assetMode: "referenced",
    project: project(),
    atlases: [
      {
        id: "atlas_main",
        image: assetRef(),
        width: 1,
        height: 1,
        entries: [],
      },
    ],
    requires: [
      {
        id: REFERENCED_CAPABILITY,
        minVersion: 1,
        requiredFor: ["render"],
      },
    ],
  };
}

function opaqueWire(data: Record<string, unknown> = { preserved: "wire-value" }) {
  const wire = embeddedWire();
  wire.requires = [{ id: OPAQUE_CAPABILITY, minVersion: 1, requiredFor: ["edit"] }];
  wire.extensions = {
    "opaque.test": {
      schemaVersion: 1,
      requiredCapabilityId: OPAQUE_CAPABILITY,
      data,
    },
  };
  return wire;
}

function verified(reference = assetRef(), width = 1, height = 1): VerifiedAtlasAssetV1 {
  return {
    asset: reference as unknown as VerifiedAtlasAssetV1["asset"],
    png: { profile: "vivi2d.png.rgba8.v1", width, height },
  };
}

function harness(
  overrides: Partial<
    Pick<
      ReadOnlyAuthoringHostOptions,
      | "materializeEmbeddedAtlas"
      | "resolveReferencedAtlas"
      | "supportedCapabilities"
      | "sha256"
    >
  > = {},
) {
  const materializeEmbeddedAtlas =
    overrides.materializeEmbeddedAtlas ?? vi.fn(async () => verified());
  const resolveReferencedAtlas =
    overrides.resolveReferencedAtlas ??
    vi.fn(async (request) => ({
      status: "ready" as const,
      verified: verified(
        request.reference,
        request.declaredWidth,
        request.declaredHeight,
      ),
    }));
  const supportedCapabilities =
    overrides.supportedCapabilities ??
    new Map([
      [REFERENCED_CAPABILITY, 1],
      [OPAQUE_CAPABILITY, 1],
    ]);
  return {
    materializeEmbeddedAtlas,
    resolveReferencedAtlas,
    host: createReadOnlyAuthoringHost({
      registry: new Map(),
      supportedCapabilities,
      sha256: overrides.sha256 ?? sha256,
      materializeEmbeddedAtlas,
      resolveReferencedAtlas,
    }),
  };
}

async function rejected(
  promise: Promise<unknown>,
  code: ReadOnlyAuthoringHostError["code"],
): Promise<ReadOnlyAuthoringHostError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ReadOnlyAuthoringHostError);
    expect(error).toMatchObject({ code });
    return error as ReadOnlyAuthoringHostError;
  }
  throw new Error(`Expected ${code}`);
}

function rejectedSync(
  operation: () => unknown,
  code: ReadOnlyAuthoringHostError["code"],
): ReadOnlyAuthoringHostError {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(ReadOnlyAuthoringHostError);
    expect(error).toMatchObject({ code });
    return error as ReadOnlyAuthoringHostError;
  }
  throw new Error(`Expected ${code}`);
}

describe("read-only authoring host W7a", () => {
  it("publishes a full embedded session only after preflight and caches an owned generation", async () => {
    const shared = verified();
    const materializeEmbeddedAtlas = vi.fn(async (request) => {
      request.imageBase64 = "mutated-port-copy";
      return shared;
    });
    const { host } = harness({ materializeEmbeddedAtlas });
    const source = JSON.stringify(embeddedWire());

    const initialized = await host.initJson(source);
    expect(materializeEmbeddedAtlas).toHaveBeenCalledOnce();
    expect(initialized.snapshot).toMatchObject({
      requestGeneration: 1,
      sourceVersion: 11,
      compatibility: "full",
      assetMode: "embedded",
      assetReadiness: { state: "ready", missingAtlasIds: [] },
      runtimeState: "ready",
      runtimeFailure: null,
      guards: {
        canRuntime: true,
        canLocalDuplicate: true,
        canEdit: false,
        canUndo: false,
        canRedo: false,
        canOrdinarySave: false,
        canPublicExport: false,
      },
    });
    expect(initialized.snapshot).not.toHaveProperty("normalizedDocument");
    expect(initialized.snapshot).not.toHaveProperty("project");
    expect(initialized.snapshot).not.toHaveProperty("extensions");
    expect(JSON.parse(host.serializeLocalDuplicate(initialized.sessionId))).toEqual(
      JSON.parse(source),
    );

    shared.asset.objectAddress = "f".repeat(64);
    const first = host.buildRuntimePayload(initialized.sessionId);
    expect(first.requestGeneration).toBe(1);
    expect(first.payload).toMatchObject({ schema: "vivi2d.evaluationPayload.v1" });
    expect(first.texturePlan).toMatchObject({
      textures: [{ asset: { objectAddress: ZERO_BYTE_SHA256 } }],
    });
    (first.payload as { canvas: { width: number } }).canvas.width = 999;
    expect(
      (
        host.buildRuntimePayload(initialized.sessionId).payload as {
          canvas: { width: number };
        }
      ).canvas.width,
    ).toBe(64);

    shared.asset.objectAddress = ZERO_BYTE_SHA256;
    const second = await host.initUtf8(
      Uint8Array.from([...source].map((character) => character.charCodeAt(0))),
    );
    expect(second.snapshot.requestGeneration).toBe(2);
    expect(Object.keys(host).sort()).toEqual([
      "buildRuntimePayload",
      "dispose",
      "getSnapshot",
      "initJson",
      "initUtf8",
      "serializeLocalDuplicate",
    ]);
    for (const forbidden of [
      "applyCommand",
      "undo",
      "redo",
      "ordinarySave",
      "publicExport",
      "save",
    ]) {
      expect(host).not.toHaveProperty(forbidden);
    }
  });

  it("allows readOnly runtime/local duplicate and keeps diagnostic snapshots defensive", async () => {
    const { host } = harness();
    const source = JSON.stringify(opaqueWire());
    const initialized = await host.initJson(source);

    expect(initialized.snapshot).toMatchObject({
      compatibility: "readOnly",
      derivedRequirements: [
        { id: OPAQUE_CAPABILITY, minVersion: 1, requiredFor: ["edit"] },
      ],
      missingRequirements: [],
      opaqueExtensionIds: ["opaque.test"],
      guards: { canRuntime: true, canLocalDuplicate: true, canEdit: false },
    });
    initialized.snapshot.derivedRequirements[0]!.id = "mutated";
    initialized.snapshot.opaqueExtensionIds.push("mutated");
    initialized.snapshot.assetReadiness.missingAtlasIds.push("mutated");
    expect(host.getSnapshot(initialized.sessionId)).toMatchObject({
      derivedRequirements: [{ id: OPAQUE_CAPABILITY }],
      opaqueExtensionIds: ["opaque.test"],
      assetReadiness: { missingAtlasIds: [] },
    });
    expect(JSON.parse(host.serializeLocalDuplicate(initialized.sessionId))).toEqual(
      JSON.parse(source),
    );
    expect(host.buildRuntimePayload(initialized.sessionId).payload).toBeDefined();
  });

  it("represents invalid render compatibility as metadata-only and calls no asset port", async () => {
    const materializeEmbeddedAtlas = vi.fn(async () => verified());
    const resolveReferencedAtlas = vi.fn(async () => {
      throw new Error("must not run");
    });
    const { host } = harness({
      materializeEmbeddedAtlas,
      resolveReferencedAtlas,
      supportedCapabilities: new Map(),
    });
    const initialized = await host.initJson(JSON.stringify(referencedWire()));

    expect(materializeEmbeddedAtlas).not.toHaveBeenCalled();
    expect(resolveReferencedAtlas).not.toHaveBeenCalled();
    expect(initialized.snapshot).toMatchObject({
      compatibility: "invalid",
      assetReadiness: { state: "notChecked", missingAtlasIds: [] },
      runtimeState: "forbidden",
      missingRequirements: [
        {
          id: REFERENCED_CAPABILITY,
          minVersion: 1,
          supportedVersion: null,
          requiredFor: ["render"],
        },
      ],
      guards: { canRuntime: false, canLocalDuplicate: false },
    });
    expect(initialized.snapshot).not.toHaveProperty("normalizedDocument");
    rejectedSync(
      () => host.serializeLocalDuplicate(initialized.sessionId),
      "VIVI_EDITOR_HOST_LOCAL_DUPLICATE_FORBIDDEN",
    );
    expect(
      rejectedSync(
        () => host.buildRuntimePayload(initialized.sessionId),
        "VIVI_EDITOR_HOST_RUNTIME_PAYLOAD_FAILED",
      ).causeCode,
    ).toBe("VIVI_ERR_EVALUATION_FORBIDDEN_STATE");
  });

  it("keeps v1-10 metadata/localDuplicate-only without inventing migration defaults", async () => {
    const materializeEmbeddedAtlas = vi.fn(async () => verified());
    const resolveReferencedAtlas = vi.fn(async () => ({ status: "missing" as const }));
    const { host } = harness({ materializeEmbeddedAtlas, resolveReferencedAtlas });
    const legacy = {
      version: 10,
      profile: "publicProfileV1",
      project: { layers: [], parameters: [] },
      atlases: [{ image: "AA==", width: 1, height: 1, entries: [] }],
    };
    const initialized = await host.initJson(JSON.stringify(legacy));

    expect(materializeEmbeddedAtlas).not.toHaveBeenCalled();
    expect(resolveReferencedAtlas).not.toHaveBeenCalled();
    expect(initialized.snapshot).toMatchObject({
      requestGeneration: 1,
      sourceVersion: 10,
      profile: "publicProfileV1",
      compatibility: "full",
      assetReadiness: { state: "notChecked", missingAtlasIds: [] },
      runtimeState: "unsupported",
      guards: { canRuntime: false, canLocalDuplicate: true },
    });
    expect(JSON.parse(host.serializeLocalDuplicate(initialized.sessionId))).toEqual(
      legacy,
    );
    rejectedSync(
      () => host.buildRuntimePayload(initialized.sessionId),
      "VIVI_EDITOR_HOST_LEGACY_RUNTIME_UNSUPPORTED",
    );
  });

  it("keeps referenced readiness independent from format compatibility", async () => {
    const readyHarness = harness();
    const ready = await readyHarness.host.initJson(JSON.stringify(referencedWire()));
    expect(ready.snapshot).toMatchObject({
      compatibility: "full",
      assetReadiness: { state: "ready", missingAtlasIds: [] },
      guards: { canRuntime: true },
    });
    expect(readyHarness.host.buildRuntimePayload(ready.sessionId).payload).toBeDefined();

    const missingHarness = harness({
      resolveReferencedAtlas: vi.fn(async () => ({ status: "missing" as const })),
    });
    const missing = await missingHarness.host.initJson(JSON.stringify(referencedWire()));
    expect(missing.snapshot).toMatchObject({
      compatibility: "full",
      assetReadiness: { state: "missing", missingAtlasIds: ["atlas_main"] },
      runtimeState: "blockedAssets",
      guards: { canRuntime: false, canLocalDuplicate: true },
    });
    rejectedSync(
      () => missingHarness.host.buildRuntimePayload(missing.sessionId),
      "VIVI_EDITOR_HOST_ASSETS_NOT_READY",
    );
    expect(() =>
      missingHarness.host.serializeLocalDuplicate(missing.sessionId),
    ).not.toThrow();
  });

  it.each([
    "VIVI_ASSET_DELETED_OBJECT_REF",
    "VIVI_ASSET_CHUNK_MISSING",
  ])("treats %s as a hard resolver error rather than readiness missing", async (causeCode) => {
    const { host } = harness({
      resolveReferencedAtlas: vi.fn(async () => {
        throw Object.freeze({ code: causeCode });
      }),
    });
    const error = await rejected(
      host.initJson(JSON.stringify(referencedWire())),
      "VIVI_EDITOR_HOST_ASSET_RESOLUTION_FAILED",
    );
    expect(error).toMatchObject({ causeCode, atlasId: "atlas_main" });
  });

  it("fails initialization atomically for materializer errors and hostile thrown proxies", async () => {
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    let calls = 0;
    const materializeEmbeddedAtlas = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw revoked.proxy;
      return verified();
    });
    const { host } = harness({ materializeEmbeddedAtlas });
    const firstError = await rejected(
      host.initJson(JSON.stringify(embeddedWire())),
      "VIVI_EDITOR_HOST_ASSET_MATERIALIZATION_FAILED",
    );
    expect(firstError).toMatchObject({
      causeCode: null,
      path: null,
      atlasId: "atlas_main",
    });

    const initialized = await host.initJson(JSON.stringify(embeddedWire()));
    expect(initialized.sessionId).toMatch(/-session-1$/);
    expect(initialized.snapshot.requestGeneration).toBe(2);
  });

  it("normalizes hostile port results into a stable asset-result error", async () => {
    const hostile = new Proxy(
      {},
      {
        get(_target, property) {
          if (property === "then") return undefined;
          return undefined;
        },
        getPrototypeOf() {
          throw new Error("hostile getPrototypeOf");
        },
      },
    );
    const { host } = harness({
      materializeEmbeddedAtlas: () => hostile as unknown as VerifiedAtlasAssetV1,
    });
    const error = await rejected(
      host.initJson(JSON.stringify(embeddedWire())),
      "VIVI_EDITOR_HOST_ASSET_RESULT_INVALID",
    );
    expect(error).toMatchObject({ causeCode: null, atlasId: "atlas_main" });
  });

  it("scans extension envelopes before projection without rejecting opaque ID maps", async () => {
    const forbiddenHarness = harness();
    const forbiddenSource = JSON.stringify(opaqueWire({ solver: "editor-private" }));
    const forbidden = await forbiddenHarness.host.initJson(forbiddenSource);
    expect(forbidden.snapshot).toMatchObject({
      compatibility: "readOnly",
      assetReadiness: { state: "ready" },
      runtimeState: "failed",
      runtimeFailure: { causeCode: "VIVI_ERR_EVALUATION_FORBIDDEN" },
      guards: { canRuntime: false, canLocalDuplicate: true },
    });
    expect(
      JSON.parse(forbiddenHarness.host.serializeLocalDuplicate(forbidden.sessionId)),
    ).toEqual(JSON.parse(forbiddenSource));
    const error = rejectedSync(
      () => forbiddenHarness.host.buildRuntimePayload(forbidden.sessionId),
      "VIVI_EDITOR_HOST_RUNTIME_PAYLOAD_FAILED",
    );
    expect(error.causeCode).toBe("VIVI_ERR_EVALUATION_FORBIDDEN");

    const allowedWire = opaqueWire({ safe: true });
    const allowedProject = allowedWire.project as Record<string, unknown>;
    allowedProject.parameters = [
      {
        id: "solver",
        name: "Opaque identifier",
        minValue: 0,
        maxValue: 1,
        defaultValue: 0,
      },
    ];
    allowedProject.expressionPresets = [
      { id: "preset-a", name: "A", values: { solver: 0 } },
    ];
    const allowed = await harness().host.initJson(JSON.stringify(allowedWire));
    expect(allowed.snapshot.compatibility).toBe("readOnly");
    expect(allowed.snapshot.guards.canRuntime).toBe(true);
  });

  it("rejects oversized referenced PNG descriptors before resolver I/O", async () => {
    const wire = referencedWire();
    const atlas = (wire.atlases as Array<Record<string, unknown>>)[0]!;
    atlas.image = assetRef({
      objectAddress: "1".repeat(64),
      storageKind: "chunk_manifest",
      sizeBytes: 64 * 1024 * 1024 + 1,
    });
    const resolveReferencedAtlas = vi.fn(
      async (): Promise<ReferencedAtlasResolutionV1> => ({ status: "missing" }),
    );
    const { host } = harness({ resolveReferencedAtlas });
    const source = JSON.stringify(wire);
    const initialized = await host.initJson(source);
    expect(initialized.snapshot).toMatchObject({
      compatibility: "full",
      assetReadiness: { state: "notChecked" },
      runtimeState: "failed",
      runtimeFailure: { causeCode: "VIVI_ASSET_LIMIT_EXCEEDED" },
      guards: { canRuntime: false, canLocalDuplicate: true },
    });
    expect(JSON.parse(host.serializeLocalDuplicate(initialized.sessionId))).toEqual(
      JSON.parse(source),
    );
    expect(
      rejectedSync(
        () => host.buildRuntimePayload(initialized.sessionId),
        "VIVI_EDITOR_HOST_RUNTIME_PAYLOAD_FAILED",
      ).causeCode,
    ).toBe("VIVI_ASSET_LIMIT_EXCEEDED");
    expect(resolveReferencedAtlas).not.toHaveBeenCalled();
  });

  it("rejects wrong verified dimensions with a sanitized Asset cause", async () => {
    const { host } = harness({
      materializeEmbeddedAtlas: vi.fn(async () => verified(assetRef(), 2, 1)),
    });
    const error = await rejected(
      host.initJson(JSON.stringify(embeddedWire())),
      "VIVI_EDITOR_HOST_ASSET_RESULT_INVALID",
    );
    expect(error).toMatchObject({
      causeCode: "VIVI_ASSET_DIMENSION_MISMATCH",
      atlasId: "atlas_main",
    });
  });

  it("rejects wrong verified profiles with the frozen Asset code", async () => {
    const invalid = verified() as VerifiedAtlasAssetV1 & {
      png: { profile: string; width: number; height: number };
    };
    invalid.png.profile = "image/png";
    const { host } = harness({ materializeEmbeddedAtlas: () => invalid });
    const error = await rejected(
      host.initJson(JSON.stringify(embeddedWire())),
      "VIVI_EDITOR_HOST_ASSET_RESULT_INVALID",
    );
    expect(error.causeCode).toBe("VIVI_ASSET_DECODING_PROFILE_UNSUPPORTED");
  });

  it.each([
    "extra",
    "symbol",
    "accessor",
  ] as const)("rejects %s fields in the exact verified DTO without invoking accessors", async (variant) => {
    let getterRan = false;
    const value = verified() as VerifiedAtlasAssetV1 & Record<PropertyKey, unknown>;
    if (variant === "extra") value.extra = true;
    if (variant === "symbol") value[Symbol("private")] = true;
    if (variant === "accessor") {
      Object.defineProperty(value, "asset", {
        enumerable: true,
        get() {
          getterRan = true;
          return assetRef();
        },
      });
    }
    const { host } = harness({ materializeEmbeddedAtlas: () => value });
    await rejected(
      host.initJson(JSON.stringify(embeddedWire())),
      "VIVI_EDITOR_HOST_ASSET_RESULT_INVALID",
    );
    expect(getterRan).toBe(false);
  });

  it("rejects a resolver that rewrites the approved reference", async () => {
    const other = "a".repeat(64);
    const { host } = harness({
      resolveReferencedAtlas: (request) => ({
        status: "ready",
        verified: verified(
          assetRef({ objectAddress: other, contentSha256: other }),
          request.declaredWidth,
          request.declaredHeight,
        ),
      }),
    });
    const error = await rejected(
      host.initJson(JSON.stringify(referencedWire())),
      "VIVI_EDITOR_HOST_ASSET_RESULT_INVALID",
    );
    expect(error).toMatchObject({
      causeCode: "VIVI_ASSET_DESCRIPTOR_MISMATCH",
      atlasId: "atlas_main",
    });
  });

  it.each([
    {
      name: "atlas count",
      mutate(wire: Record<string, unknown>) {
        wire.atlases = Array.from({ length: 33 }, (_, index) => ({
          id: `atlas_${index}`,
          image: "AA==",
          width: 1,
          height: 1,
          entries: [],
        }));
      },
    },
    {
      name: "atlas axis",
      mutate(wire: Record<string, unknown>) {
        (wire.atlases as Array<Record<string, unknown>>)[0]!.width = 8193;
      },
    },
    {
      name: "aggregate texture bytes",
      mutate(wire: Record<string, unknown>) {
        wire.atlases = [
          { id: "atlas_a", image: "AA==", width: 8192, height: 4096, entries: [] },
          { id: "atlas_b", image: "AA==", width: 8192, height: 4097, entries: [] },
        ];
      },
    },
  ])("caches $name Evaluation failure before asset-port I/O", async ({ mutate }) => {
    const wire = embeddedWire();
    mutate(wire);
    const materializeEmbeddedAtlas = vi.fn(async () => verified());
    const { host } = harness({ materializeEmbeddedAtlas });
    const source = JSON.stringify(wire);
    const initialized = await host.initJson(source);
    expect(materializeEmbeddedAtlas).not.toHaveBeenCalled();
    expect(initialized.snapshot).toMatchObject({
      assetReadiness: { state: "notChecked" },
      runtimeState: "failed",
      runtimeFailure: { causeCode: "VIVI_ERR_LIMIT_EXCEEDED" },
      guards: { canRuntime: false, canLocalDuplicate: true },
    });
    expect(JSON.parse(host.serializeLocalDuplicate(initialized.sessionId))).toEqual(
      JSON.parse(source),
    );
    expect(
      rejectedSync(
        () => host.buildRuntimePayload(initialized.sessionId),
        "VIVI_EDITOR_HOST_RUNTIME_PAYLOAD_FAILED",
      ).causeCode,
    ).toBe("VIVI_ERR_LIMIT_EXCEEDED");
  });

  it.each([1, 4])("keeps sparse v%s legacy input duplicate-only", async (version) => {
    const materializeEmbeddedAtlas = vi.fn(async () => verified());
    const { host } = harness({ materializeEmbeddedAtlas });
    const legacy = {
      version,
      project: { layers: [], parameters: [] },
      atlases: [{ image: "AA==", width: 1, height: 1, entries: [] }],
    };
    const initialized = await host.initJson(JSON.stringify(legacy));
    expect(materializeEmbeddedAtlas).not.toHaveBeenCalled();
    expect(initialized.snapshot).toMatchObject({
      sourceVersion: version,
      assetReadiness: { state: "notChecked" },
      runtimeState: "unsupported",
      guards: { canRuntime: false, canLocalDuplicate: true },
    });
    expect(JSON.parse(host.serializeLocalDuplicate(initialized.sessionId))).toEqual(
      legacy,
    );
  });

  it("preserves missing atlas order and aborts atomically on a later hard error", async () => {
    const wire = referencedWire();
    wire.atlases = [
      ...(wire.atlases as Array<Record<string, unknown>>),
      {
        id: "atlas_second",
        image: assetRef(),
        width: 1,
        height: 1,
        entries: [],
      },
    ];
    const missingHost = harness({
      resolveReferencedAtlas: () => ({ status: "missing" }),
    }).host;
    const missing = await missingHost.initJson(JSON.stringify(wire));
    expect(missing.snapshot.assetReadiness).toEqual({
      state: "missing",
      missingAtlasIds: ["atlas_main", "atlas_second"],
    });

    let failHard = true;
    let calls = 0;
    const hardHarness = harness({
      resolveReferencedAtlas: () => {
        calls += 1;
        if (failHard && calls % 2 === 0) {
          throw Object.freeze({ code: "VIVI_ASSET_CHUNK_MISSING" });
        }
        return failHard
          ? { status: "missing" }
          : {
              status: "ready",
              verified: verified(),
            };
      },
    });
    await rejected(
      hardHarness.host.initJson(JSON.stringify(wire)),
      "VIVI_EDITOR_HOST_ASSET_RESOLUTION_FAILED",
    );
    failHard = false;
    const recovered = await hardHarness.host.initJson(JSON.stringify(referencedWire()));
    expect(recovered.snapshot.requestGeneration).toBe(2);
  });

  it("drops fake and oversized port diagnostics at the bridge boundary", async () => {
    const fake = harness({
      resolveReferencedAtlas: () => {
        throw {
          code: "VIVI_ASSET_FAKE",
          path: `/${"x".repeat(5000)}`,
          stage: "asset".repeat(1000),
          offset: -1,
        };
      },
    });
    const fakeError = await rejected(
      fake.host.initJson(JSON.stringify(referencedWire())),
      "VIVI_EDITOR_HOST_ASSET_RESOLUTION_FAILED",
    );
    expect(fakeError).toMatchObject({
      causeCode: null,
      causePath: null,
      causeStage: null,
      causeOffset: null,
    });

    const oversized = harness({
      resolveReferencedAtlas: () => {
        throw {
          code: "VIVI_ASSET_DELETED_OBJECT_REF",
          path: `/${"x".repeat(5000)}`,
          stage: "semantic".repeat(1000),
        };
      },
    });
    const oversizedError = await rejected(
      oversized.host.initJson(JSON.stringify(referencedWire())),
      "VIVI_EDITOR_HOST_ASSET_RESOLUTION_FAILED",
    );
    expect(oversizedError).toMatchObject({
      causeCode: "VIVI_ASSET_DELETED_OBJECT_REF",
      causePath: null,
      causeStage: null,
    });
  });

  it("rejects malformed capability and registry configuration", () => {
    let capabilityIdCoerced = false;
    const hostileCapabilityId = {
      toString() {
        capabilityIdCoerced = true;
        return OPAQUE_CAPABILITY;
      },
    };
    expect(() =>
      createReadOnlyAuthoringHost({
        registry: new Map(),
        supportedCapabilities: new Map([[hostileCapabilityId as unknown as string, 1]]),
        sha256,
        materializeEmbeddedAtlas: () => verified(),
        resolveReferencedAtlas: () => ({ status: "missing" }),
      }),
    ).toThrowError(
      expect.objectContaining({ code: "VIVI_EDITOR_HOST_CONFIGURATION_INVALID" }),
    );
    expect(capabilityIdCoerced).toBe(false);

    expect(() =>
      createReadOnlyAuthoringHost({
        registry: new Map(),
        supportedCapabilities: new Map([
          [REFERENCED_CAPABILITY, Number.POSITIVE_INFINITY],
        ]),
        sha256,
        materializeEmbeddedAtlas: () => verified(),
        resolveReferencedAtlas: () => ({ status: "missing" }),
      }),
    ).toThrowError(
      expect.objectContaining({ code: "VIVI_EDITOR_HOST_CONFIGURATION_INVALID" }),
    );

    expect(() =>
      createReadOnlyAuthoringHost({
        registry: new Map([
          [
            "known.test",
            {
              id: "different.test",
              supportedSchemaVersions: [1],
              requiredCapability: {
                id: OPAQUE_CAPABILITY,
                minVersionForSchema: { 1: 1 },
              },
              affects: ["edit"],
              validateEnvelope: () => true,
            },
          ],
        ]),
        supportedCapabilities: new Map(),
        sha256,
        materializeEmbeddedAtlas: () => verified(),
        resolveReferencedAtlas: () => ({ status: "missing" }),
      }),
    ).toThrowError(
      expect.objectContaining({ code: "VIVI_EDITOR_HOST_CONFIGURATION_INVALID" }),
    );

    expect(() =>
      createReadOnlyAuthoringHost({
        registry: new Map([
          [
            "known.test",
            {
              id: "known.test",
              supportedSchemaVersions: [1],
              requiredCapability: {
                id: OPAQUE_CAPABILITY,
                minVersionForSchema: { "01": 1 },
              },
              affects: ["edit"],
              validateEnvelope: () => true,
            },
          ],
        ]),
        supportedCapabilities: new Map(),
        sha256,
        materializeEmbeddedAtlas: () => verified(),
        resolveReferencedAtlas: () => ({ status: "missing" }),
      }),
    ).toThrowError(
      expect.objectContaining({ code: "VIVI_EDITOR_HOST_CONFIGURATION_INVALID" }),
    );
  });

  it.each([
    4 * 1024 * 1024,
    16 * 1024 * 1024,
  ])("passes an embedded atlas of %i bytes through codec and materializer", async (byteLength) => {
    const bytes = Buffer.alloc(byteLength);
    const digest = sha256(bytes);
    const wire = embeddedWire();
    (wire.atlases as Array<Record<string, unknown>>)[0]!.image = bytes.toString("base64");
    const materializeEmbeddedAtlas = vi.fn(async () =>
      verified(
        assetRef({
          objectAddress: digest,
          contentSha256: digest,
          sizeBytes: byteLength,
        }),
      ),
    );
    const { host } = harness({ materializeEmbeddedAtlas });

    const initialized = await host.initJson(JSON.stringify(wire));

    expect(initialized.snapshot.runtimeState).toBe("ready");
    expect(materializeEmbeddedAtlas).toHaveBeenCalledOnce();
  });

  it("rejects an embedded atlas over 16 MiB before allocation or materializer I-O", async () => {
    const wire = embeddedWire();
    (wire.atlases as Array<Record<string, unknown>>)[0]!.image = Buffer.alloc(
      16 * 1024 * 1024 + 1,
    ).toString("base64");
    const materializeEmbeddedAtlas = vi.fn(async () => verified());
    const sha256Provider = vi.fn(sha256);
    const { host } = harness({ materializeEmbeddedAtlas, sha256: sha256Provider });
    const error = await rejected(
      host.initJson(JSON.stringify(wire)),
      "VIVI_EDITOR_HOST_ASSET_MATERIALIZATION_FAILED",
    );
    expect(error).toMatchObject({
      causeCode: "VIVI_ASSET_TOO_LARGE_FOR_EMBED",
      causePath: "/atlases/0/image",
      atlasId: "atlas_main",
    });
    expect(sha256Provider).not.toHaveBeenCalled();
    expect(materializeEmbeddedAtlas).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "size",
      reference: assetRef({ sizeBytes: 0 }),
      causeCode: "VIVI_ASSET_SIZE_MISMATCH",
    },
    {
      name: "content hash",
      reference: assetRef({
        objectAddress: "a".repeat(64),
        contentSha256: "a".repeat(64),
      }),
      causeCode: "VIVI_ASSET_CONTENT_HASH_MISMATCH",
    },
    {
      name: "object address",
      reference: assetRef({ objectAddress: "a".repeat(64) }),
      causeCode: "VIVI_ASSET_HASH_MISMATCH",
    },
  ])("rejects embedded materializer $name mismatch", async ({ reference, causeCode }) => {
    const { host } = harness({
      materializeEmbeddedAtlas: () => verified(reference),
    });
    const error = await rejected(
      host.initJson(JSON.stringify(embeddedWire())),
      "VIVI_EDITOR_HOST_ASSET_RESULT_INVALID",
    );
    expect(error.causeCode).toBe(causeCode);
  });

  it("accepts the referenced chunk boundary and normalizes mixed-case returned refs", async () => {
    const wire = referencedWire();
    const objectAddress = "a".repeat(64);
    const contentSha256 = "b".repeat(64);
    (wire.atlases as Array<Record<string, unknown>>)[0]!.image = assetRef({
      objectAddress: objectAddress.toUpperCase(),
      contentSha256: contentSha256.toUpperCase(),
      storageKind: "chunk_manifest",
      sizeBytes: 16 * 1024 * 1024 + 1,
    });
    const { host } = harness({
      resolveReferencedAtlas: (request) => ({
        status: "ready",
        verified: verified(
          {
            ...request.reference,
            objectAddress: request.reference.objectAddress.toUpperCase(),
            contentSha256: request.reference.contentSha256.toUpperCase(),
          },
          request.declaredWidth,
          request.declaredHeight,
        ),
      }),
    });
    const initialized = await host.initJson(JSON.stringify(wire));
    expect(initialized.snapshot.runtimeState).toBe("ready");
    expect(host.buildRuntimePayload(initialized.sessionId).texturePlan).toMatchObject({
      textures: [
        {
          asset: {
            objectAddress,
            contentSha256,
            storageKind: "chunk_manifest",
          },
        },
      ],
    });
  });

  it("rejects wrong-host, hostile, and disposed session identifiers deterministically", async () => {
    const left = harness().host;
    const right = harness().host;
    const leftSession = await left.initJson(JSON.stringify(embeddedWire()));
    const rightSession = await right.initJson(JSON.stringify(embeddedWire()));

    rejectedSync(
      () => left.getSnapshot(rightSession.sessionId),
      "VIVI_EDITOR_HOST_SESSION_UNKNOWN",
    );
    const hostileId = {
      toString() {
        throw new Error("must not coerce");
      },
    };
    rejectedSync(
      () => left.getSnapshot(hostileId as unknown as string),
      "VIVI_EDITOR_HOST_SESSION_UNKNOWN",
    );
    left.dispose(leftSession.sessionId);
    rejectedSync(
      () => left.getSnapshot(leftSession.sessionId),
      "VIVI_EDITOR_HOST_SESSION_DISPOSED",
    );
    rejectedSync(
      () => left.dispose(leftSession.sessionId),
      "VIVI_EDITOR_HOST_SESSION_DISPOSED",
    );
  });

  it("allocates generations at request start so older async completions stay older", async () => {
    let releaseSlow: (() => void) | undefined;
    let reportSlowStarted: (() => void) | undefined;
    const slowStarted = new Promise<void>((resolve) => {
      reportSlowStarted = resolve;
    });
    const slowRelease = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    const materializeEmbeddedAtlas = vi.fn(async (request) => {
      if (request.atlasId === "atlas_slow") {
        reportSlowStarted?.();
        await slowRelease;
      }
      const bytes = Buffer.from(request.imageBase64, "base64");
      const digest = sha256(bytes);
      return verified(
        assetRef({
          objectAddress: digest,
          contentSha256: digest,
          sizeBytes: bytes.byteLength,
        }),
        request.declaredWidth,
        request.declaredHeight,
      );
    });
    const { host } = harness({ materializeEmbeddedAtlas });
    const slowWire = embeddedWire();
    (slowWire.atlases as Array<Record<string, unknown>>)[0]!.id = "atlas_slow";
    const fastWire = embeddedWire();
    (fastWire.atlases as Array<Record<string, unknown>>)[0]!.id = "atlas_fast";

    const slowInit = host.initJson(JSON.stringify(slowWire));
    await slowStarted;
    const fast = await host.initJson(JSON.stringify(fastWire));
    expect(fast.snapshot.requestGeneration).toBe(2);
    releaseSlow?.();
    const slow = await slowInit;
    expect(slow.snapshot.requestGeneration).toBe(1);
  });

  it("sanitizes parse causes and consumes the failed request generation", async () => {
    const { host } = harness();
    const error = await rejected(host.initJson("{"), "VIVI_EDITOR_HOST_INIT_FAILED");
    expect(error).toMatchObject({
      causeCode: "VIVI_FMT_INVALID_JSON",
      causeOffset: 1,
    });
    const initialized = await host.initJson(JSON.stringify(embeddedWire()));
    expect(initialized.snapshot.requestGeneration).toBe(2);
  });

  it("runs without browser, Node, encoding, crypto, or clone ambient globals", async () => {
    const names = [
      "TextEncoder",
      "TextDecoder",
      "atob",
      "btoa",
      "crypto",
      "process",
      "window",
      "document",
      "structuredClone",
    ] as const;
    const descriptors = new Map<string, PropertyDescriptor | undefined>();
    const source = JSON.stringify(embeddedWire());
    try {
      for (const name of names) {
        descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, {
          configurable: true,
          writable: true,
          value: undefined,
        });
      }
      const host = createReadOnlyAuthoringHost({
        registry: new Map(),
        supportedCapabilities: new Map(),
        sha256: () => ZERO_BYTE_SHA256,
        materializeEmbeddedAtlas: () => verified(),
        resolveReferencedAtlas: () => ({ status: "missing" }),
      });
      const initialized = await host.initJson(source);
      host.buildRuntimePayload(initialized.sessionId);
    } finally {
      for (const [name, descriptor] of descriptors) {
        if (descriptor === undefined)
          delete (globalThis as Record<string, unknown>)[name];
        else Object.defineProperty(globalThis, name, descriptor);
      }
    }
  });
});
