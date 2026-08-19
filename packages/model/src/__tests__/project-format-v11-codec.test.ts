import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  type ProjectFormatV11CodecOptions,
  type ProjectFormatV11SchemaError,
  ProjectFormatV11SerializationError,
  parseProjectFormatV11Json,
  parseProjectFormatV11Utf8,
  serializeProjectFormatV11LocalDuplicate,
  serializeProjectFormatV11Ordinary,
} from "../project-format-v11/codec";
import type { ProjectFormatV11SemanticError } from "../project-format-v11/errors";
import type { ProjectFormatV11JsonError } from "../project-format-v11/json-contract";
import type {
  ExtensionRegistryEntryV11,
  ExtensionRegistryV11,
  Sha256V11,
} from "../project-format-v11/types";
import { parseViviFile } from "../project-parser";
import { VIVI_RUNTIME_PROJECT_FILE_VERSION } from "../runtime-spec";
import goldenFixture from "./fixtures/project-format-v11-golden.json";

const ZERO_BYTE_SHA256 =
  "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d";
const OTHER_SHA256 = "1".repeat(64);
const DOCUMENT_ID = "123e4567-e89b-42d3-a456-426614174000";
const MASK_INVERT_CAPABILITY = "vivi.cap.maskInvert";
const REFERENCED_ASSETS_CAPABILITY = "vivi.cap.referencedAssets";
const CLIP_PLAYBACK_CAPABILITY = "vivi.cap.clipPlayback";
const STATE_MACHINE_CAPABILITY = "vivi.cap.stateMachinePlayback";
const EXTENDED_BLEND_CAPABILITY = "vivi.cap.extendedBlendModes";
const CANONICAL_V11_PROJECT_KEYS = [
  "name",
  "width",
  "height",
  "layers",
  "parameters",
  "clips",
  "scenes",
  "physicsGroups",
  "lipsyncConfig",
  "skins",
  "parameterBindings",
  "sceneBlends",
  "ikControllers",
  "offscreenTargets",
  "expressionPresets",
  "colliders",
  "stateMachines",
] as const;

const fixture = goldenFixture as {
  v10RoundTrip: {
    input: Record<string, unknown>;
    expectedVersion: number;
    expectedRootKeySet: string[];
    expectedProjectKeySet: string[];
    expectedAtlasKeySets: string[][];
    expectedAtlasEntryKeySets: string[][];
  };
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function codecOptions(
  overrides: {
    registry?: ExtensionRegistryV11;
    supportedCapabilities?: ReadonlyMap<string, number>;
    sha256?: Sha256V11;
    testLimits?: ProjectFormatV11CodecOptions["testLimits"];
  } = {},
): ProjectFormatV11CodecOptions {
  const options: ProjectFormatV11CodecOptions = {
    registry: overrides.registry ?? new Map(),
    supportedCapabilities: overrides.supportedCapabilities ?? new Map(),
    sha256: overrides.sha256 ?? sha256,
  };
  if (overrides.testLimits !== undefined) options.testLimits = overrides.testLimits;
  return options;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function makeV11Embedded(): Record<string, unknown> {
  const wire = clone(fixture.v10RoundTrip.input);
  wire.version = 11;
  delete wire.profile;
  wire.assetMode = "embedded";
  wire.atlases = [];
  return wire;
}

function makeSparseV10(profile = false): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    version: 10,
    project: { layers: [], parameters: [] },
    atlases: [],
  };
  if (profile) wire.profile = "publicProfileV1";
  return wire;
}

function makeCommonLayer(id: string, name: string): Record<string, unknown> {
  return {
    id,
    name,
    kind: "group",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    blendMode: "normal",
    expanded: true,
    children: [],
  };
}

function makeMeshLayer(id: string): Record<string, unknown> {
  return {
    ...makeCommonLayer(id, id),
    kind: "viviMesh",
    mesh: {
      vertices: [0, 0, 1, 0, 0, 1],
      uvs: [0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
      divisionsX: 1,
      divisionsY: 1,
    },
  };
}

function makeMaskWire(invert: boolean): Record<string, unknown> {
  const wire = makeV11Embedded();
  const project = wire.project as Record<string, unknown>;
  project.layers = [
    makeMeshLayer("mask"),
    {
      ...makeCommonLayer("body", "body"),
      clipMasks: [{ layerId: "mask", invert }],
    },
  ];
  wire.atlases = [
    {
      id: "mask_atlas",
      image: "AA==",
      width: 1,
      height: 1,
      entries: [{ layerId: "mask", x: 0, y: 0, width: 1, height: 1 }],
    },
  ];
  if (invert) {
    wire.requires = [
      {
        id: MASK_INVERT_CAPABILITY,
        minVersion: 1,
        requiredFor: ["render"],
      },
    ];
  }
  return wire;
}

function makeReferencedWire(digest = ZERO_BYTE_SHA256): Record<string, unknown> {
  const wire = makeV11Embedded();
  wire.assetMode = "referenced";
  wire.atlases = [
    {
      id: "atlas_main",
      image: {
        objectAddress: digest,
        storageKind: "blob",
        contentSha256: digest,
        mediaType: "image/png",
        sizeBytes: 1,
      },
      width: 1,
      height: 1,
      entries: [],
    },
  ];
  wire.requires = [
    {
      id: REFERENCED_ASSETS_CAPABILITY,
      minVersion: 1,
      requiredFor: ["render"],
    },
  ];
  return wire;
}

function makeOpaqueWire(): Record<string, unknown> {
  const wire = makeV11Embedded();
  wire.documentId = DOCUMENT_ID;
  wire.requires = [
    {
      id: "vivi.cap.opaqueTest",
      minVersion: 1,
      requiredFor: ["edit"],
    },
  ];
  wire.extensions = {
    "opaque.test": {
      schemaVersion: 1,
      requiredCapabilityId: "vivi.cap.opaqueTest",
      data: { preserved: "wire-value" },
    },
  };
  return wire;
}

function makeKnownEmbeddedWire(): Record<string, unknown> {
  const digest = ZERO_BYTE_SHA256.toUpperCase();
  const wire = makeV11Embedded();
  wire.extensions = {
    "known.test": {
      schemaVersion: 1,
      requiredCapabilityId: "vivi.cap.knownTest",
      data: { digestLikeApplicationData: digest },
      blobRefs: [
        {
          objectAddress: digest,
          storageKind: "blob",
          contentSha256: digest,
          mediaType: "application/octet-stream",
          sizeBytes: 1,
        },
      ],
    },
  };
  wire.requires = [
    {
      id: "vivi.cap.knownTest",
      minVersion: 1,
      requiredFor: ["edit"],
    },
  ];
  wire.embeddedAssets = {
    [`sha256:${digest}`]: {
      contentSha256: digest,
      sizeBytes: 1,
      encoding: "base64",
      data: "AA==",
    },
  };
  return wire;
}

function knownRegistry(): ExtensionRegistryV11 {
  const entry: ExtensionRegistryEntryV11 = {
    id: "known.test",
    supportedSchemaVersions: [1],
    requiredCapability: {
      id: "vivi.cap.knownTest",
      minVersionForSchema: { 1: 1 },
    },
    affects: ["edit"],
    validateEnvelope: () => true,
  };
  return new Map([[entry.id, entry]]);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe("Project Format v11 production codec", () => {
  it("round-trips the frozen v10 wire through production parse and projection", async () => {
    const input = clone(fixture.v10RoundTrip.input);
    const legacyParsed = parseViviFile(JSON.stringify(input));
    expect(legacyParsed).toEqual(input);
    const loaded = await parseProjectFormatV11Json(
      JSON.stringify(legacyParsed),
      codecOptions(),
    );
    const serialized = await serializeProjectFormatV11Ordinary(loaded);
    const output = JSON.parse(serialized) as Record<string, unknown>;
    const reparsed = await parseProjectFormatV11Json(serialized, codecOptions());

    expect(output).toEqual(input);
    expect(reparsed.wire).toEqual(input);
    expect(output.version).toBe(fixture.v10RoundTrip.expectedVersion);
    expect(Object.keys(output).sort()).toEqual(
      [...fixture.v10RoundTrip.expectedRootKeySet].sort(),
    );
    expect(Object.keys(asRecord(output.project)).sort()).toEqual(
      [...fixture.v10RoundTrip.expectedProjectKeySet].sort(),
    );
    const atlases = output.atlases as Array<Record<string, unknown>>;
    expect(atlases.map((atlas) => Object.keys(atlas).sort())).toEqual(
      fixture.v10RoundTrip.expectedAtlasKeySets.map((keys) => [...keys].sort()),
    );
    expect(
      atlases.flatMap((atlas) =>
        (atlas.entries as Array<Record<string, unknown>>).map((entry) =>
          Object.keys(entry).sort(),
        ),
      ),
    ).toEqual(
      fixture.v10RoundTrip.expectedAtlasEntryKeySets.map((keys) => [...keys].sort()),
    );
  });

  it("keeps the legacy parser/runtime at version 10 while the internal codec owns v11", async () => {
    expect(VIVI_RUNTIME_PROJECT_FILE_VERSION).toBe(10);
    const loaded = await parseProjectFormatV11Json(
      JSON.stringify(makeMaskWire(true)),
      codecOptions({
        supportedCapabilities: new Map([[MASK_INVERT_CAPABILITY, 1]]),
      }),
    );
    const serialized = await serializeProjectFormatV11Ordinary(loaded);
    expect(JSON.parse(serialized)).toMatchObject({ version: 11 });
    expect(() => parseViviFile(serialized)).toThrow("Invalid .vivi file version: 11");
  });

  it("uses normalized mask edges for ordinary output and the raw snapshot for duplicate", async () => {
    const input = makeMaskWire(false);
    const original = clone(input);
    const loaded = await parseProjectFormatV11Json(JSON.stringify(input), codecOptions());
    const normalizedLayers = loaded.normalized.project.layers;
    expect(normalizedLayers[1]).toMatchObject({
      clipMasks: [{ layerId: "mask", invert: false }],
    });

    asRecord(loaded.wire.project).name = "raw-wire-mutation";
    loaded.normalized.project.name = "ordinary-edit";
    const duplicate = serializeProjectFormatV11LocalDuplicate(loaded);
    expect(JSON.parse(duplicate)).toEqual(original);

    const serialized = await serializeProjectFormatV11Ordinary(loaded);
    const output = JSON.parse(serialized) as Record<string, unknown>;
    expect(output.version).toBe(10);
    expect(output).not.toHaveProperty("assetMode");
    expect((output.atlases as Array<Record<string, unknown>>)[0]).not.toHaveProperty(
      "id",
    );
    const project = asRecord(output.project);
    expect(project.name).toBe("ordinary-edit");
    expect((project.layers as Array<Record<string, unknown>>)[1]).toMatchObject({
      clipMaskIds: ["mask"],
    });
    expect((project.layers as Array<Record<string, unknown>>)[1]).not.toHaveProperty(
      "clipMasks",
    );
  });

  it("keeps inverted edges in v11 and derives maskInvert", async () => {
    const loaded = await parseProjectFormatV11Json(
      JSON.stringify(makeMaskWire(true)),
      codecOptions({
        supportedCapabilities: new Map([[MASK_INVERT_CAPABILITY, 1]]),
      }),
    );
    const output = JSON.parse(await serializeProjectFormatV11Ordinary(loaded)) as Record<
      string,
      unknown
    >;
    const project = asRecord(output.project);

    expect(output.version).toBe(11);
    expect((project.layers as Array<Record<string, unknown>>)[1]).toMatchObject({
      clipMasks: [{ layerId: "mask", invert: true }],
    });
    expect(output.requires).toContainEqual({
      id: MASK_INVERT_CAPABILITY,
      minVersion: 1,
      requiredFor: ["render"],
    });
  });

  it("gates bytes before BOM and fatal UTF-8 decoding", async () => {
    const validBytes = new TextEncoder().encode(
      JSON.stringify(fixture.v10RoundTrip.input),
    );
    await expect(
      parseProjectFormatV11Utf8(validBytes, codecOptions()),
    ).resolves.toMatchObject({
      compatibility: "full",
    });

    await expect(
      parseProjectFormatV11Utf8(
        new Uint8Array([0xef, 0xbb, 0xbf]),
        codecOptions({ testLimits: { maxInputUtf8Bytes: 2 } }),
      ),
    ).rejects.toMatchObject<ProjectFormatV11JsonError>({
      code: "VIVI_FMT_JSON_TOO_LARGE",
    });
    await expect(
      parseProjectFormatV11Utf8(
        new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]),
        codecOptions(),
      ),
    ).rejects.toMatchObject<ProjectFormatV11JsonError>({ code: "VIVI_FMT_INVALID_JSON" });
    await expect(
      parseProjectFormatV11Utf8(new Uint8Array([0xc3, 0x28]), codecOptions()),
    ).rejects.toMatchObject<ProjectFormatV11JsonError>({
      code: "VIVI_FMT_UNICODE_SCALAR_INVALID",
    });
  });

  it("never enters Stage 2 after a Stage 1 schema failure", async () => {
    const input = makeOpaqueWire();
    input.unexpected = true;
    const digest = vi.fn(sha256);

    await expect(
      parseProjectFormatV11Json(JSON.stringify(input), codecOptions({ sha256: digest })),
    ).rejects.toMatchObject<ProjectFormatV11SchemaError>({
      stage: "schema",
      code: "unknownPublicField",
      path: "/unexpected",
    });
    expect(digest).not.toHaveBeenCalled();

    delete input.unexpected;
    const loaded = await parseProjectFormatV11Json(
      JSON.stringify(input),
      codecOptions({ sha256: digest }),
    );
    expect(loaded.compatibility).toBe("readOnly");
    expect(digest).toHaveBeenCalledTimes(2);
  });

  it("maps nested additional properties to unknownPublicField with an exact pointer", async () => {
    const wire = makeV11Embedded();
    asRecord(wire.project).unexpected = true;

    await expect(
      parseProjectFormatV11Json(JSON.stringify(wire), codecOptions()),
    ).rejects.toMatchObject<ProjectFormatV11SchemaError>({
      stage: "schema",
      code: "unknownPublicField",
      path: "/project/unexpected",
    });
  });

  it.each([
    {
      name: "legacy v11 field",
      mutate(wire: Record<string, unknown>) {
        wire.version = 10;
        wire.assetMode = "embedded";
      },
      code: "unknownPublicField",
      path: "/assetMode",
    },
    {
      name: "profile with v11",
      mutate(wire: Record<string, unknown>) {
        wire.profile = "publicProfileV1";
      },
      code: "forbiddenPublicFeature",
      path: "/profile",
    },
    {
      name: "embedded carrier reversal",
      mutate(wire: Record<string, unknown>) {
        wire.atlases = makeReferencedWire().atlases;
      },
      code: "VIVI_FMT_MIXED_ASSET_MODE",
      path: "/atlases/0/image",
    },
    {
      name: "bad atlas id",
      mutate(wire: Record<string, unknown>) {
        wire.atlases = [
          { id: "bad id", image: "AA==", width: 1, height: 1, entries: [] },
        ];
      },
      code: "VIVI_FMT_ATLAS_ID_INVALID",
      path: "/atlases/0/id",
    },
    {
      name: "embedded chunk manifest",
      mutate(wire: Record<string, unknown>) {
        wire.extensions = {
          test: {
            schemaVersion: 1,
            requiredCapabilityId: "vivi.cap.test",
            data: null,
            blobRefs: [
              {
                objectAddress: ZERO_BYTE_SHA256,
                storageKind: "chunk_manifest",
                contentSha256: ZERO_BYTE_SHA256,
                mediaType: "application/octet-stream",
                sizeBytes: 16 * 1024 * 1024 + 1,
              },
            ],
          },
        };
      },
      code: "VIVI_ASSET_TOO_LARGE_FOR_EMBED",
      path: "/extensions/test/blobRefs/0/storageKind",
    },
    {
      name: "malformed blob digest",
      mutate(wire: Record<string, unknown>) {
        wire.assetMode = "referenced";
        wire.atlases = makeReferencedWire("bad").atlases;
      },
      code: "VIVI_FMT_ASSET_REF_INVALID",
      path: "/atlases/0/image/objectAddress",
    },
  ])("maps Stage 1 $name to a stable code and path", async ({ mutate, code, path }) => {
    const wire = makeV11Embedded();
    mutate(wire);
    await expect(
      parseProjectFormatV11Json(JSON.stringify(wire), codecOptions()),
    ).rejects.toMatchObject({
      stage: "schema",
      code,
      path,
    });
  });

  it.each([
    {
      name: "non-object extension ref",
      ref: null,
      path: "/extensions/test/blobRefs/0",
    },
    {
      name: "extension ref with a missing field",
      ref: {
        objectAddress: ZERO_BYTE_SHA256,
        storageKind: "blob",
        contentSha256: ZERO_BYTE_SHA256,
        sizeBytes: 1,
      },
      path: "/extensions/test/blobRefs/0/mediaType",
    },
  ])("maps $name to ASSET_REF_INVALID", async ({ ref, path }) => {
    const wire = makeV11Embedded();
    wire.extensions = {
      test: {
        schemaVersion: 1,
        requiredCapabilityId: "vivi.cap.test",
        data: null,
        blobRefs: [ref],
      },
    };

    await expect(
      parseProjectFormatV11Json(JSON.stringify(wire), codecOptions()),
    ).rejects.toMatchObject<ProjectFormatV11SchemaError>({
      stage: "schema",
      code: "VIVI_FMT_ASSET_REF_INVALID",
      path,
    });
  });

  it("maps referenced embeddedAssets and blob equality to their invariant codes", async () => {
    const mixed = makeReferencedWire();
    mixed.embeddedAssets = {
      [`sha256:${ZERO_BYTE_SHA256}`]: {
        contentSha256: ZERO_BYTE_SHA256,
        sizeBytes: 1,
        encoding: "base64",
        data: "AA==",
      },
    };
    await expect(
      parseProjectFormatV11Json(JSON.stringify(mixed), codecOptions()),
    ).rejects.toMatchObject<ProjectFormatV11SchemaError>({
      code: "VIVI_FMT_MIXED_ASSET_MODE",
      path: "/embeddedAssets",
    });

    const unequal = makeReferencedWire();
    asRecord(
      (unequal.atlases as Array<Record<string, unknown>>)[0]?.image,
    ).contentSha256 = OTHER_SHA256;
    await expect(
      parseProjectFormatV11Json(JSON.stringify(unequal), codecOptions()),
    ).rejects.toMatchObject<ProjectFormatV11SemanticError>({
      code: "VIVI_FMT_ASSET_REF_INVALID",
      path: "/atlases/0/image/objectAddress",
    });
  });

  it.each([
    {
      name: "embedded asset address",
      mutate(wire: Record<string, unknown>) {
        wire.embeddedAssets = {
          "sha256:bad": {
            contentSha256: ZERO_BYTE_SHA256,
            sizeBytes: 1,
            encoding: "base64",
            data: "AA==",
          },
        };
      },
      path: "/embeddedAssets/sha256:bad",
    },
    {
      name: "embedded asset content digest",
      mutate(wire: Record<string, unknown>) {
        wire.embeddedAssets = {
          [`sha256:${ZERO_BYTE_SHA256}`]: {
            contentSha256: "bad",
            sizeBytes: 1,
            encoding: "base64",
            data: "AA==",
          },
        };
      },
      path: `/embeddedAssets/sha256:${ZERO_BYTE_SHA256}/contentSha256`,
    },
    {
      name: "embedded asset data",
      mutate(wire: Record<string, unknown>) {
        wire.embeddedAssets = {
          [`sha256:${ZERO_BYTE_SHA256}`]: {
            contentSha256: ZERO_BYTE_SHA256,
            sizeBytes: 1,
            encoding: "base64",
            data: "A===",
          },
        };
      },
      path: `/embeddedAssets/sha256:${ZERO_BYTE_SHA256}/data`,
    },
  ])("maps invalid $name to ASSET_HASH_MISMATCH", async ({ mutate, path }) => {
    const wire = makeV11Embedded();
    mutate(wire);
    await expect(
      parseProjectFormatV11Json(JSON.stringify(wire), codecOptions()),
    ).rejects.toMatchObject<ProjectFormatV11SchemaError>({
      stage: "schema",
      code: "VIVI_FMT_ASSET_HASH_MISMATCH",
      path,
    });
  });

  it.each([
    ["storage kind", "storageKind", "not-a-carrier"],
    ["size", "sizeBytes", -1],
    ["media type", "mediaType", "image/png\u0000"],
    ["PNG media type", "mediaType", "image/jpeg"],
  ] as const)("maps invalid referenced AssetRef $name to ASSET_REF_INVALID", async (_name, property, value) => {
    const wire = makeReferencedWire();
    const image = asRecord((wire.atlases as Array<Record<string, unknown>>)[0]?.image);
    image[property] = value;

    await expect(
      parseProjectFormatV11Json(JSON.stringify(wire), codecOptions()),
    ).rejects.toMatchObject<ProjectFormatV11SchemaError>({
      stage: "schema",
      code: "VIVI_FMT_ASSET_REF_INVALID",
      path: `/atlases/0/image/${property}`,
    });
  });

  it.each([
    [
      "oversized blob",
      "blob",
      16 * 1024 * 1024 + 1,
      "VIVI_ASSET_TOO_LARGE_FOR_EMBED",
      "/atlases/0/image/sizeBytes",
    ],
    [
      "undersized chunk manifest",
      "chunk_manifest",
      16 * 1024 * 1024,
      "VIVI_FMT_ASSET_REF_INVALID",
      "/atlases/0/image",
    ],
  ] as const)("maps a referenced $name before Stage 2", async (_name, storageKind, sizeBytes, code, path) => {
    const wire = makeReferencedWire();
    const image = asRecord((wire.atlases as Array<Record<string, unknown>>)[0]?.image);
    image.storageKind = storageKind;
    image.sizeBytes = sizeBytes;

    await expect(
      parseProjectFormatV11Json(JSON.stringify(wire), codecOptions()),
    ).rejects.toMatchObject<ProjectFormatV11SchemaError>({
      stage: "schema",
      code,
      path,
    });
  });

  it("maps oversized embedded asset metadata before Stage 2", async () => {
    const wire = makeV11Embedded();
    wire.embeddedAssets = {
      [`sha256:${ZERO_BYTE_SHA256}`]: {
        contentSha256: ZERO_BYTE_SHA256,
        sizeBytes: 16 * 1024 * 1024 + 1,
        encoding: "base64",
        data: "AA==",
      },
    };
    await expect(
      parseProjectFormatV11Json(JSON.stringify(wire), codecOptions()),
    ).rejects.toMatchObject<ProjectFormatV11SchemaError>({
      stage: "schema",
      code: "VIVI_ASSET_TOO_LARGE_FOR_EMBED",
      path: `/embeddedAssets/sha256:${ZERO_BYTE_SHA256}/sizeBytes`,
    });
  });

  it("materializes every canonical v11 project key when a sparse v10 edit promotes", async () => {
    const loaded = await parseProjectFormatV11Json(
      JSON.stringify(makeSparseV10()),
      codecOptions(),
    );
    loaded.normalized.documentId = DOCUMENT_ID;

    const output = JSON.parse(await serializeProjectFormatV11Ordinary(loaded)) as Record<
      string,
      unknown
    >;
    expect(output).toMatchObject({ version: 11, documentId: DOCUMENT_ID });
    expect(Object.keys(asRecord(output.project)).sort()).toEqual(
      [...CANONICAL_V11_PROJECT_KEYS].sort(),
    );
  });

  it("derives a known extension requirement added to a v10 document", async () => {
    const loaded = await parseProjectFormatV11Json(
      JSON.stringify(makeSparseV10()),
      codecOptions({
        registry: knownRegistry(),
        supportedCapabilities: new Map([["vivi.cap.knownTest", 1]]),
      }),
    );
    loaded.normalized.extensions = {
      "known.test": {
        schemaVersion: 1,
        requiredCapabilityId: "vivi.cap.knownTest",
        data: { added: true },
      },
    };

    const output = JSON.parse(await serializeProjectFormatV11Ordinary(loaded)) as Record<
      string,
      unknown
    >;
    expect(output.version).toBe(11);
    expect(output.requires).toContainEqual({
      id: "vivi.cap.knownTest",
      minVersion: 1,
      requiredFor: ["edit"],
    });
  });

  it.each([
    {
      name: "clip playback",
      capability: CLIP_PLAYBACK_CAPABILITY,
      mutate(project: Record<string, unknown>) {
        project.clips = [{ id: "clip", name: "clip", duration: 1, fps: 30, tracks: [] }];
      },
    },
    {
      name: "state machine playback",
      capability: STATE_MACHINE_CAPABILITY,
      mutate(project: Record<string, unknown>) {
        project.stateMachines = [
          {
            id: "machine",
            name: "machine",
            states: [{ id: "idle", name: "idle", loop: true }],
            transitions: [],
            initialStateId: "idle",
            enabled: true,
          },
        ];
      },
    },
    {
      name: "extended blend",
      capability: EXTENDED_BLEND_CAPABILITY,
      mutate(project: Record<string, unknown>) {
        project.layers = [
          { ...makeCommonLayer("overlay", "overlay"), blendMode: "overlay" },
        ];
      },
    },
  ])("derives $name from v10 content and promotes to v11", async ({
    capability,
    mutate,
  }) => {
    const loaded = await parseProjectFormatV11Json(
      JSON.stringify(makeSparseV10()),
      codecOptions({ supportedCapabilities: new Map([[capability, 1]]) }),
    );
    mutate(loaded.normalized.project as unknown as Record<string, unknown>);

    const output = JSON.parse(await serializeProjectFormatV11Ordinary(loaded)) as Record<
      string,
      unknown
    >;
    expect(output.version).toBe(11);
    expect(output.requires).toContainEqual({
      id: capability,
      minVersion: 1,
      requiredFor: ["render"],
    });
  });

  it("promotes a non-profile v10 inverted mask and rejects the public profile", async () => {
    const layers = [
      makeMeshLayer("mask"),
      {
        ...makeCommonLayer("body", "body"),
        clipMasks: [{ layerId: "mask", invert: true }],
      },
    ];
    const options = codecOptions({
      supportedCapabilities: new Map([[MASK_INVERT_CAPABILITY, 1]]),
    });
    const normalWire = makeSparseV10();
    asRecord(normalWire.project).layers = layers;
    normalWire.atlases = [
      {
        image: "AA==",
        width: 1,
        height: 1,
        entries: [{ layerId: "mask", x: 0, y: 0, width: 1, height: 1 }],
      },
    ];
    const loaded = await parseProjectFormatV11Json(JSON.stringify(normalWire), options);
    const output = JSON.parse(await serializeProjectFormatV11Ordinary(loaded)) as Record<
      string,
      unknown
    >;
    expect(output.version).toBe(11);
    expect(output.requires).toContainEqual({
      id: MASK_INVERT_CAPABILITY,
      minVersion: 1,
      requiredFor: ["render"],
    });

    const profileWire = makeSparseV10(true);
    asRecord(profileWire.project).layers = layers;
    profileWire.atlases = clone(normalWire.atlases);
    const profile = await parseProjectFormatV11Json(JSON.stringify(profileWire), options);
    await expect(serializeProjectFormatV11Ordinary(profile)).rejects.toMatchObject({
      code: "forbiddenPublicFeature",
      path: "/profile",
    });
  });

  it("normalizes referenced producer digests but preserves duplicate wire case", async () => {
    const input = makeReferencedWire(ZERO_BYTE_SHA256.toUpperCase());
    const loaded = await parseProjectFormatV11Json(
      JSON.stringify(input),
      codecOptions({
        supportedCapabilities: new Map([[REFERENCED_ASSETS_CAPABILITY, 1]]),
      }),
    );
    expect(JSON.parse(serializeProjectFormatV11LocalDuplicate(loaded))).toEqual(input);

    const output = JSON.parse(await serializeProjectFormatV11Ordinary(loaded)) as Record<
      string,
      unknown
    >;
    const image = asRecord((output.atlases as Array<Record<string, unknown>>)[0]?.image);
    expect(image.objectAddress).toBe(ZERO_BYTE_SHA256);
    expect(image.contentSha256).toBe(ZERO_BYTE_SHA256);
  });

  it("normalizes embedded producer digests without rewriting extension data", async () => {
    const input = makeKnownEmbeddedWire();
    const loaded = await parseProjectFormatV11Json(
      JSON.stringify(input),
      codecOptions({
        registry: knownRegistry(),
        supportedCapabilities: new Map([["vivi.cap.knownTest", 1]]),
      }),
    );
    expect(JSON.parse(serializeProjectFormatV11LocalDuplicate(loaded))).toEqual(input);

    const output = JSON.parse(await serializeProjectFormatV11Ordinary(loaded)) as Record<
      string,
      unknown
    >;
    const extensions = asRecord(output.extensions);
    const envelope = asRecord(extensions["known.test"]);
    const ref = asRecord((envelope.blobRefs as Array<Record<string, unknown>>)[0]);
    expect(ref.objectAddress).toBe(ZERO_BYTE_SHA256);
    expect(ref.contentSha256).toBe(ZERO_BYTE_SHA256);
    expect(asRecord(envelope.data).digestLikeApplicationData).toBe(
      ZERO_BYTE_SHA256.toUpperCase(),
    );
    expect(Object.keys(asRecord(output.embeddedAssets))).toEqual([
      `sha256:${ZERO_BYTE_SHA256}`,
    ]);
    expect(
      asRecord(asRecord(output.embeddedAssets)[`sha256:${ZERO_BYTE_SHA256}`])
        .contentSha256,
    ).toBe(ZERO_BYTE_SHA256);
  });

  it("snapshots the duplicate wire before registry validation callbacks run", async () => {
    const input = makeV11Embedded();
    input.requires = [{ id: "vivi.cap.knownTest", minVersion: 1, requiredFor: ["edit"] }];
    input.extensions = {
      "known.test": {
        schemaVersion: 1,
        requiredCapabilityId: "vivi.cap.knownTest",
        data: { preserved: "source" },
      },
    };
    const original = clone(input);
    const validateEnvelope = vi.fn((candidate: unknown) => {
      const envelope = asRecord(candidate);
      asRecord(envelope.data).preserved = "callback-mutation";
      return true;
    });
    const entry = [...knownRegistry().values()][0];
    if (!entry) throw new Error("known registry fixture missing");
    const registry: ExtensionRegistryV11 = new Map([
      ["known.test", { ...entry, validateEnvelope }],
    ]);

    const loaded = await parseProjectFormatV11Json(
      JSON.stringify(input),
      codecOptions({
        registry,
        supportedCapabilities: new Map([["vivi.cap.knownTest", 1]]),
      }),
    );

    expect(validateEnvelope).toHaveBeenCalledOnce();
    expect(JSON.parse(serializeProjectFormatV11LocalDuplicate(loaded))).toEqual(original);
  });

  it("deep-snapshots registry metadata before callbacks and caller mutations", async () => {
    const input = makeV11Embedded();
    input.requires = [{ id: "vivi.cap.knownTest", minVersion: 1, requiredFor: ["edit"] }];
    input.extensions = {
      "known.test": {
        schemaVersion: 1,
        requiredCapabilityId: "vivi.cap.knownTest",
        data: { preserved: true },
      },
    };
    const baseEntry = [...knownRegistry().values()][0];
    if (!baseEntry) throw new Error("known registry fixture missing");
    const mutableVersions = [...baseEntry.supportedSchemaVersions];
    const mutableAffects: string[] = ["edit"];
    const mutableMinVersions = { ...baseEntry.requiredCapability.minVersionForSchema };
    const registry: ExtensionRegistryV11 = new Map([
      [
        "known.test",
        {
          ...baseEntry,
          supportedSchemaVersions: mutableVersions,
          requiredCapability: {
            ...baseEntry.requiredCapability,
            minVersionForSchema: mutableMinVersions,
          },
          affects: mutableAffects as unknown as readonly "edit"[],
          validateEnvelope: () => {
            mutableAffects[0] = "render";
            return true;
          },
        },
      ],
    ]);
    const loaded = await parseProjectFormatV11Json(
      JSON.stringify(input),
      codecOptions({
        registry,
        supportedCapabilities: new Map([["vivi.cap.knownTest", 1]]),
      }),
    );

    expect(loaded.compatibility).toBe("full");
    expect(loaded.derivedRequirements).toContainEqual({
      id: "vivi.cap.knownTest",
      minVersion: 1,
      requiredFor: ["edit"],
    });

    mutableVersions.length = 0;
    mutableMinVersions[1] = 99;
    const output = JSON.parse(await serializeProjectFormatV11Ordinary(loaded)) as Record<
      string,
      unknown
    >;
    expect(output.requires).toContainEqual({
      id: "vivi.cap.knownTest",
      minVersion: 1,
      requiredFor: ["edit"],
    });
  });

  it("allows readOnly local duplicate and detects opaque mutation before ordinary save", async () => {
    const input = makeOpaqueWire();
    const loaded = await parseProjectFormatV11Json(
      JSON.stringify(input),
      codecOptions({
        supportedCapabilities: new Map([["vivi.cap.opaqueTest", 1]]),
      }),
    );
    expect(loaded.compatibility).toBe("readOnly");
    expect(JSON.parse(serializeProjectFormatV11LocalDuplicate(loaded))).toEqual(input);
    await expect(serializeProjectFormatV11Ordinary(loaded)).rejects.toBeInstanceOf(
      ProjectFormatV11SerializationError,
    );

    const rawEnvelope = asRecord(asRecord(loaded.wire).extensions)["opaque.test"];
    asRecord(asRecord(rawEnvelope).data).preserved = "raw-mutated";
    await expect(serializeProjectFormatV11Ordinary(loaded)).rejects.toMatchObject({
      code: "VIVI_FMT_UNREGISTERED_EXTENSION",
      path: "/extensions/opaque.test",
    });
    asRecord(asRecord(rawEnvelope).data).preserved = "wire-value";

    const envelope = loaded.normalized.extensions?.["opaque.test"];
    expect(envelope).toBeDefined();
    asRecord(envelope?.data).preserved = "mutated";
    await expect(serializeProjectFormatV11Ordinary(loaded)).rejects.toMatchObject({
      code: "VIVI_FMT_UNREGISTERED_EXTENSION",
      path: "/extensions/opaque.test",
    });
    expect(JSON.parse(serializeProjectFormatV11LocalDuplicate(loaded))).toEqual(input);
  });

  it("does not mistake normalized digest case for an opaque extension mutation", async () => {
    const digest = ZERO_BYTE_SHA256.toUpperCase();
    const input = makeOpaqueWire();
    const extensions = asRecord(input.extensions);
    const envelope = asRecord(extensions["opaque.test"]);
    envelope.blobRefs = [
      {
        objectAddress: digest,
        storageKind: "blob",
        contentSha256: digest,
        mediaType: "application/octet-stream",
        sizeBytes: 1,
      },
    ];
    input.embeddedAssets = {
      [`sha256:${digest}`]: {
        contentSha256: digest,
        sizeBytes: 1,
        encoding: "base64",
        data: "AA==",
      },
    };
    const loaded = await parseProjectFormatV11Json(
      JSON.stringify(input),
      codecOptions({
        supportedCapabilities: new Map([["vivi.cap.opaqueTest", 1]]),
      }),
    );

    expect(JSON.parse(serializeProjectFormatV11LocalDuplicate(loaded))).toEqual(input);
    await expect(serializeProjectFormatV11Ordinary(loaded)).rejects.toMatchObject({
      code: "VIVI_FMT_SERIALIZE_FORBIDDEN",
    });

    const normalizedEnvelope = loaded.normalized.extensions?.["opaque.test"];
    expect(normalizedEnvelope?.blobRefs?.[0]).toMatchObject({
      objectAddress: ZERO_BYTE_SHA256,
      contentSha256: ZERO_BYTE_SHA256,
    });
    asRecord(normalizedEnvelope?.data).preserved = "changed";
    await expect(serializeProjectFormatV11Ordinary(loaded)).rejects.toMatchObject({
      code: "VIVI_FMT_UNREGISTERED_EXTENSION",
      path: "/extensions/opaque.test",
    });
  });

  it("rejects local duplicate when render compatibility is invalid", async () => {
    const loaded = await parseProjectFormatV11Json(
      JSON.stringify(makeReferencedWire()),
      codecOptions(),
    );
    expect(loaded.compatibility).toBe("invalid");
    expect(() => serializeProjectFormatV11LocalDuplicate(loaded)).toThrow(
      ProjectFormatV11SerializationError,
    );
  });
});
