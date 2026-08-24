import { describe, expect, it } from "vitest";
import { ProjectFormatV11SemanticError } from "../project-format-v11/errors";
import { canonicalizeJsonV11 } from "../project-format-v11/json-contract";
import { validateProjectFormatV11Schema } from "../project-format-v11/schema";
import {
  deriveProjectFormatV11Requirements,
  validateProjectFormatV11Semantics,
} from "../project-format-v11/semantic";
import type {
  ExtensionRegistryV11,
  ProjectDataV11,
  ProjectFormatV11SemanticOptions,
  ProjectLayerV11,
  ViviAssetRefV11,
  ViviFileDataWireThroughV11,
  ViviFileDataWireV10,
  ViviFileDataWireV11,
  ViviFileDataWireV11Embedded,
  ViviFileDataWireV11Referenced,
  ViviRequiredCapabilityV11,
} from "../project-format-v11/types";

const EMPTY_OPTIONS: ProjectFormatV11SemanticOptions = {
  registry: new Map(),
  supportedCapabilities: new Map(),
  sha256: () => "ab".repeat(32),
};

const CAP_CLIP = "vivi.cap.clipPlayback";
const CAP_MASK_INVERT = "vivi.cap.maskInvert";
const CAP_REFERENCED = "vivi.cap.referencedAssets";
const CAP_STATE = "vivi.cap.stateMachinePlayback";
const CAP_ASSET = "vivi.cap.assetBlob";
const DIGEST_A = "ab".repeat(32);
const DIGEST_B = "cd".repeat(32);

function mesh(id: string, clipMaskIds?: string[]): ProjectLayerV11 {
  const layer: ProjectLayerV11 = {
    id,
    name: id,
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    blendMode: "normal",
    expanded: true,
    children: [],
    kind: "viviMesh",
    mesh: {
      vertices: [0, 0, 1, 0, 0, 1],
      uvs: [0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
      divisionsX: 1,
      divisionsY: 1,
    },
  };
  if (clipMaskIds !== undefined) layer.clipMaskIds = clipMaskIds;
  return layer;
}

function bone(id: string): ProjectLayerV11 {
  return {
    id,
    name: id,
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    blendMode: "normal",
    expanded: true,
    children: [],
    kind: "bone",
    bone: { angle: 0, length: 1, scaleX: 1, scaleY: 1 },
  };
}

function project(layers: ProjectLayerV11[] = []): ProjectDataV11 {
  return {
    name: "semantic-fixture",
    width: 64,
    height: 64,
    layers,
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
    colliders: [],
    stateMachines: [],
  };
}

function embeddedV11(layers: ProjectLayerV11[] = []): ViviFileDataWireV11Embedded {
  const meshLayers = layers.filter((layer) => layer.kind === "viviMesh");
  return {
    version: 11,
    assetMode: "embedded",
    project: project(layers),
    atlases:
      meshLayers.length === 0
        ? []
        : [
            {
              id: "atlas-main",
              image: "AA==",
              width: 1,
              height: 1,
              entries: meshLayers.map((layer) => ({
                layerId: layer.id,
                x: 0,
                y: 0,
                width: 1,
                height: 1,
              })),
            },
          ],
  };
}

function referencedV11(): ViviFileDataWireV11Referenced {
  return {
    version: 11,
    assetMode: "referenced",
    project: project(),
    atlases: [],
    requires: [{ id: CAP_REFERENCED, minVersion: 1, requiredFor: ["render"] }],
  };
}

function legacyV10WithDanglingAtlasEntry(): ViviFileDataWireV10 {
  return {
    version: 10,
    profile: "publicProfileV1",
    project: project(),
    atlases: [
      {
        image: "AA==",
        width: 1,
        height: 1,
        entries: [{ layerId: "mesh-a", x: 0, y: 0, width: 1, height: 1 }],
      },
    ],
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function assertSchemaPass(wire: ViviFileDataWireThroughV11): void {
  expect(validateProjectFormatV11Schema(wire)).toEqual([]);
}

async function expectSemanticFailure(
  wire: ViviFileDataWireThroughV11,
  code: ProjectFormatV11SemanticError["code"],
  path?: string,
  options: ProjectFormatV11SemanticOptions = EMPTY_OPTIONS,
): Promise<void> {
  try {
    await validateProjectFormatV11Semantics(wire, options);
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectFormatV11SemanticError);
    expect(error).toMatchObject({ stage: "semantic", code });
    if (path !== undefined) expect(error).toMatchObject({ path });
    return;
  }
  throw new Error(`Expected semantic error ${code}`);
}

function registryFor(
  extensionId: string,
  capabilityId: string,
  minVersion = 1,
): ExtensionRegistryV11 {
  return new Map([
    [
      extensionId,
      {
        id: extensionId,
        supportedSchemaVersions: [1],
        requiredCapability: {
          id: capabilityId,
          minVersionForSchema: { 1: minVersion },
        },
        affects: ["edit"] as const,
        validateEnvelope: () => true,
      },
    ],
  ]);
}

function assetRef(overrides: Partial<ViviAssetRefV11> = {}): ViviAssetRefV11 {
  return {
    objectAddress: DIGEST_A.toUpperCase(),
    storageKind: "blob",
    contentSha256: DIGEST_A.toUpperCase(),
    mediaType: "application/octet-stream",
    sizeBytes: 2,
    ...overrides,
  };
}

function attachKnownAssetExtension(
  wire: ViviFileDataWireV11,
  refs: ViviAssetRefV11[],
): ProjectFormatV11SemanticOptions {
  wire.extensions = {
    asset: {
      schemaVersion: 1,
      requiredCapabilityId: CAP_ASSET,
      data: {},
      blobRefs: refs,
    },
  };
  const requiredFor: ViviRequiredCapabilityV11[] = [
    { id: CAP_ASSET, minVersion: 1, requiredFor: ["edit"] },
  ];
  wire.requires =
    wire.assetMode === "referenced"
      ? [...requiredFor, { id: CAP_REFERENCED, minVersion: 1, requiredFor: ["render"] }]
      : [...requiredFor];
  return {
    registry: registryFor("asset", CAP_ASSET),
    supportedCapabilities: new Map([
      [CAP_ASSET, 1],
      [CAP_REFERENCED, 1],
    ]),
    sha256: () => DIGEST_A,
  };
}

describe("Project Format v11 versioned Stage 2 boundary", () => {
  it("accepts a schema-valid minimal v11 wire", async () => {
    const wire = embeddedV11();
    assertSchemaPass(wire);

    const result = await validateProjectFormatV11Semantics(wire, EMPTY_OPTIONS);

    expect(result).toMatchObject({
      compatibility: "full",
      derivedRequirements: [],
      classifiedExtensions: [],
      opaqueExtensions: [],
    });
    expect(result.normalized).toMatchObject({ version: 11, assetMode: "embedded" });
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    2 ** 53,
  ])("rejects an in-memory JSON number outside the canonical domain: %s", async (value) => {
    const invalid = embeddedV11();
    invalid.project.width = value;
    assertSchemaPass(invalid);
    await expectSemanticFailure(invalid, "invalidSemanticValue", "/project/width");
  });

  it("canonicalizes negative zero without mutating the wire", async () => {
    const negativeZero = embeddedV11();
    negativeZero.project.width = -0;
    assertSchemaPass(negativeZero);
    const result = await validateProjectFormatV11Semantics(negativeZero, EMPTY_OPTIONS);
    expect(Object.is(negativeZero.project.width, -0)).toBe(true);
    expect(Object.is(result.normalized.project.width, -0)).toBe(false);
    expect(result.normalized.project.width).toBe(0);
  });

  it("preserves the frozen v10 accepted set and only supplies synthetic normalized fields", async () => {
    const wire = legacyV10WithDanglingAtlasEntry();
    wire.project.layers = [mesh("mask"), mesh("target", ["mask"])];
    const original = clone(wire);
    assertSchemaPass(wire);

    const result = await validateProjectFormatV11Semantics(wire, EMPTY_OPTIONS);

    expect(wire).toEqual(original);
    expect(result.normalized.atlases[0]?.id).toBe("atlas-0");
    expect(result.normalized.assetMode).toBe("embedded");
    expect(result.normalized.project.layers[1]).toMatchObject({
      clipMasks: [{ layerId: "mask", invert: false }],
    });
    expect(result.normalized.project.layers[1]).not.toHaveProperty("clipMaskIds");
    expect(result.derivedRequirements).toEqual([]);
    expect(result.compatibility).toBe("full");

    const normalizedLayer = result.normalized.project.layers[0];
    const normalizedAtlas = result.normalized.atlases[0];
    if (normalizedLayer) normalizedLayer.name = "normalized-only";
    if (normalizedAtlas?.entries[0]) normalizedAtlas.entries[0].x = 99;
    expect(wire).toEqual(original);
  });

  it("rejects the same dangling atlas-to-layer reference in v11", async () => {
    const wire = embeddedV11();
    wire.atlases = [
      {
        id: "atlas-main",
        image: "AA==",
        width: 1,
        height: 1,
        entries: [{ layerId: "mesh-a", x: 0, y: 0, width: 1, height: 1 }],
      },
    ];
    assertSchemaPass(wire);

    await expectSemanticFailure(
      wire,
      "invalidSemanticValue",
      "/atlases/0/entries/0/layerId",
    );
  });

  it("normalizes v11 clipMaskIds into false edge objects without mutating raw wire", async () => {
    const wire = embeddedV11([mesh("mask"), mesh("target", ["mask"])]);
    const original = clone(wire);
    assertSchemaPass(wire);

    const result = await validateProjectFormatV11Semantics(wire, EMPTY_OPTIONS);
    expect(result.normalized.project.layers[1]).toMatchObject({
      clipMasks: [{ layerId: "mask", invert: false }],
    });
    expect(result.normalized.project.layers[1]).not.toHaveProperty("clipMaskIds");
    expect(wire).toEqual(original);
  });
});

describe("Project Format v11 projected uniqueness", () => {
  it("rejects duplicate atlas ids", async () => {
    const wire = embeddedV11();
    wire.atlases = [
      { id: "same", image: "AA==", width: 1, height: 1, entries: [] },
      { id: "same", image: "AQ==", width: 1, height: 1, entries: [] },
    ];
    assertSchemaPass(wire);
    await expectSemanticFailure(wire, "VIVI_FMT_DUPLICATE_ATLAS_ID", "/atlases/1/id");
  });

  it("defensively rejects an invalid atlas id", async () => {
    const wire = embeddedV11();
    wire.atlases = [{ id: "not valid", image: "AA==", width: 1, height: 1, entries: [] }];
    await expectSemanticFailure(wire, "VIVI_FMT_ATLAS_ID_INVALID", "/atlases/0/id");
  });

  it("rejects duplicate requires ids", async () => {
    const wire = embeddedV11();
    wire.requires = [
      { id: CAP_CLIP, minVersion: 1, requiredFor: ["render"] },
      { id: CAP_CLIP, minVersion: 1, requiredFor: ["render"] },
    ];
    assertSchemaPass(wire);
    await expectSemanticFailure(wire, "VIVI_FMT_DUPLICATE_REQUIRES_ID", "/requires/1/id");
  });

  it("enforces x-vivi-uniqueBy on clipMasks.layerId", async () => {
    const maskLayer = mesh("mask");
    const target = mesh("target");
    target.clipMasks = [
      { layerId: "mask", invert: false },
      { layerId: "mask", invert: true },
    ];
    const wire = embeddedV11([maskLayer, target]);
    wire.requires = [{ id: CAP_MASK_INVERT, minVersion: 1, requiredFor: ["render"] }];
    assertSchemaPass(wire);

    await expectSemanticFailure(
      wire,
      "invalidSemanticValue",
      "/project/layers/1/clipMasks/1/layerId",
    );
  });
});

function directMaskWire(count: number): ViviFileDataWireV11Embedded {
  const masks = Array.from({ length: count }, (_, index) => mesh(`mask-${index}`));
  return embeddedV11([
    ...masks,
    mesh(
      "target",
      masks.map(({ id }) => id),
    ),
  ]);
}

function branch(prefix: string, length: number): ProjectLayerV11[] {
  return Array.from({ length }, (_, index) =>
    mesh(
      `${prefix}-${index}`,
      index + 1 < length ? [`${prefix}-${index + 1}`] : undefined,
    ),
  );
}

function branchedMaskWire(
  leftLength: number,
  rightLength: number,
): ViviFileDataWireV11Embedded {
  const left = branch("left", leftLength);
  const right = branch("right", rightLength);
  return embeddedV11([
    ...left,
    ...right,
    mesh("target", [left[0]?.id ?? "", right[0]?.id ?? ""]),
  ]);
}

describe("Project Format v11 mask graph", () => {
  it("accepts exactly eight directly active masks", async () => {
    const wire = directMaskWire(8);
    assertSchemaPass(wire);
    await expect(
      validateProjectFormatV11Semantics(wire, EMPTY_OPTIONS),
    ).resolves.toMatchObject({
      compatibility: "full",
    });
  });

  it("rejects the ninth directly active mask", async () => {
    const wire = directMaskWire(9);
    assertSchemaPass(wire);
    await expectSemanticFailure(wire, "invalidSemanticValue", "/project/layers/9");
  });

  it("counts recursive branches cumulatively at the eight/nine boundary", async () => {
    const exactlyEight = branchedMaskWire(4, 4);
    const ninth = branchedMaskWire(4, 5);
    assertSchemaPass(exactlyEight);
    assertSchemaPass(ninth);

    await expect(
      validateProjectFormatV11Semantics(exactlyEight, EMPTY_OPTIONS),
    ).resolves.toBeDefined();
    await expectSemanticFailure(ninth, "invalidSemanticValue", "/project/layers/9");
  });

  it("allows a shared mask DAG while still counting each emitted branch", async () => {
    const shared = mesh("shared");
    const left = mesh("left", ["shared"]);
    const right = mesh("right", ["shared"]);
    const target = mesh("target", ["left", "right"]);
    const wire = embeddedV11([shared, left, right, target]);
    assertSchemaPass(wire);

    await expect(
      validateProjectFormatV11Semantics(wire, EMPTY_OPTIONS),
    ).resolves.toBeDefined();
  });

  it("rejects a mask cycle", async () => {
    const wire = embeddedV11([mesh("a", ["b"]), mesh("b", ["a"])]);
    assertSchemaPass(wire);
    await expectSemanticFailure(wire, "invalidSemanticValue", "/project/layers/0");
  });

  it("derives maskInvert only when an edge is inverted", () => {
    const normalTarget = mesh("target-normal");
    normalTarget.clipMasks = [{ layerId: "mask", invert: false }];
    const normal = embeddedV11([mesh("mask"), normalTarget]);

    const invertedTarget = mesh("target-inverted");
    invertedTarget.clipMasks = [{ layerId: "mask", invert: true }];
    const inverted = embeddedV11([mesh("mask"), invertedTarget]);
    inverted.requires = [{ id: CAP_MASK_INVERT, minVersion: 1, requiredFor: ["render"] }];

    expect(deriveProjectFormatV11Requirements(normal, EMPTY_OPTIONS)).toEqual([]);
    expect(deriveProjectFormatV11Requirements(inverted, EMPTY_OPTIONS)).toEqual([
      { id: CAP_MASK_INVERT, minVersion: 1, requiredFor: ["render"] },
    ]);
  });

  it("defensively rejects simultaneous clipMaskIds and clipMasks", async () => {
    const target = mesh("target", ["mask"]);
    target.clipMasks = [{ layerId: "mask", invert: false }];
    const wire = embeddedV11([mesh("mask"), target]);

    await expectSemanticFailure(wire, "invalidSemanticValue", "/project/layers/1");
  });
});

describe("Project Format v11 requirements and extension classification", () => {
  it("derives max/union and canonical UTF-8 output order", async () => {
    const wire = referencedV11();
    wire.project.clips = [{ id: "clip", name: "clip", duration: 1, fps: 30, tracks: [] }];
    wire.extensions = {
      merge: {
        schemaVersion: 1,
        requiredCapabilityId: CAP_CLIP,
        data: {},
      },
    };
    wire.requires = [
      { id: CAP_REFERENCED, minVersion: 1, requiredFor: ["render"] },
      { id: CAP_CLIP, minVersion: 3, requiredFor: ["edit", "render"] },
    ];
    const options: ProjectFormatV11SemanticOptions = {
      registry: registryFor("merge", CAP_CLIP, 3),
      supportedCapabilities: new Map([
        [CAP_CLIP, 3],
        [CAP_REFERENCED, 1],
      ]),
      sha256: () => DIGEST_A,
    };
    assertSchemaPass(wire);

    const expected = [
      { id: CAP_CLIP, minVersion: 3, requiredFor: ["render", "edit"] },
      { id: CAP_REFERENCED, minVersion: 1, requiredFor: ["render"] },
    ];
    expect(deriveProjectFormatV11Requirements(wire, options)).toEqual(expected);
    await expect(validateProjectFormatV11Semantics(wire, options)).resolves.toMatchObject(
      {
        compatibility: "full",
        derivedRequirements: expected,
        classifiedExtensions: [
          { extensionId: "merge", classification: "knownSupported" },
        ],
      },
    );
  });

  it("marks an unsupported edit-only extension opaque even when its capability is present", async () => {
    const wire = embeddedV11();
    wire.extensions = {
      future: {
        schemaVersion: 2,
        requiredCapabilityId: CAP_ASSET,
        data: { stable: true },
      },
    };
    wire.requires = [{ id: CAP_ASSET, minVersion: 4, requiredFor: ["edit"] }];
    const hashed: string[] = [];
    const options: ProjectFormatV11SemanticOptions = {
      registry: registryFor("future", CAP_ASSET),
      supportedCapabilities: new Map([[CAP_ASSET, 4]]),
      sha256: (bytes) => {
        hashed.push(new TextDecoder().decode(bytes));
        return DIGEST_B;
      },
    };
    const original = clone(wire);
    assertSchemaPass(wire);

    const result = await validateProjectFormatV11Semantics(wire, options);
    expect(result.compatibility).toBe("readOnly");
    expect(result.classifiedExtensions).toMatchObject([
      { extensionId: "future", classification: "opaque" },
    ]);
    expect(result.opaqueExtensions[0]).toMatchObject({
      extensionId: "future",
      loadedCanonicalHash: DIGEST_B,
      preservedRequirement: wire.requires[0],
    });
    expect(hashed).toEqual([
      canonicalizeJsonV11({
        extensionId: "future",
        envelope: wire.extensions.future,
        preservedRequirement: wire.requires[0],
      }),
    ]);
    const opaque = result.opaqueExtensions[0];
    if (opaque) {
      opaque.envelope.requiredCapabilityId = "vivi.cap.changed";
      opaque.preservedRequirement.minVersion = 99;
    }
    expect(wire).toEqual(original);
  });

  it("returns readOnly for a missing edit capability and invalid for a missing render capability", async () => {
    const editOnly = embeddedV11();
    editOnly.extensions = {
      edit: { schemaVersion: 1, requiredCapabilityId: CAP_ASSET, data: {} },
    };
    editOnly.requires = [{ id: CAP_ASSET, minVersion: 1, requiredFor: ["edit"] }];
    const editOptions: ProjectFormatV11SemanticOptions = {
      registry: registryFor("edit", CAP_ASSET),
      supportedCapabilities: new Map(),
      sha256: () => DIGEST_A,
    };

    const render = embeddedV11();
    render.project.clips = [
      { id: "clip", name: "clip", duration: 1, fps: 30, tracks: [] },
    ];
    render.requires = [{ id: CAP_CLIP, minVersion: 1, requiredFor: ["render"] }];

    await expect(
      validateProjectFormatV11Semantics(editOnly, editOptions),
    ).resolves.toMatchObject({
      compatibility: "readOnly",
    });
    await expect(
      validateProjectFormatV11Semantics(render, EMPTY_OPTIONS),
    ).resolves.toMatchObject({
      compatibility: "invalid",
    });
  });

  it("rejects registry capability disagreement and exact requires mismatch", async () => {
    const invalidRegistry = embeddedV11();
    invalidRegistry.extensions = {
      known: { schemaVersion: 1, requiredCapabilityId: CAP_ASSET, data: {} },
    };
    invalidRegistry.requires = [{ id: CAP_ASSET, minVersion: 1, requiredFor: ["edit"] }];
    const invalidOptions: ProjectFormatV11SemanticOptions = {
      registry: registryFor("known", "vivi.cap.other"),
      supportedCapabilities: new Map(),
      sha256: () => DIGEST_A,
    };
    await expectSemanticFailure(
      invalidRegistry,
      "VIVI_FMT_REQUIRES_MISMATCH",
      "/extensions/known/requiredCapabilityId",
      invalidOptions,
    );

    const mismatch = embeddedV11();
    mismatch.project.clips = [
      { id: "clip", name: "clip", duration: 1, fps: 30, tracks: [] },
    ];
    mismatch.requires = [{ id: CAP_CLIP, minVersion: 2, requiredFor: ["render"] }];
    await expectSemanticFailure(mismatch, "VIVI_FMT_REQUIRES_MISMATCH", "/requires/0");
  });

  it("rejects an extension without its declared capability entry", async () => {
    const wire = embeddedV11();
    wire.extensions = {
      orphan: { schemaVersion: 1, requiredCapabilityId: CAP_ASSET, data: {} },
    };
    assertSchemaPass(wire);

    await expectSemanticFailure(
      wire,
      "VIVI_FMT_EXTENSION_WITHOUT_CAPABILITY",
      "/extensions/orphan/requiredCapabilityId",
    );
  });

  it.each([
    ["missing", undefined],
    ["false", (): boolean => false],
    ["truthy non-boolean", () => ({ accepted: true })],
    [
      "throwing",
      (): boolean => {
        throw new Error("registry validator failure");
      },
    ],
  ] as const)("rejects a knownSupported extension with a %s registry validator", async (_label, validator) => {
    const wire = embeddedV11();
    wire.extensions = {
      known: { schemaVersion: 1, requiredCapabilityId: CAP_ASSET, data: {} },
    };
    wire.requires = [{ id: CAP_ASSET, minVersion: 1, requiredFor: ["edit"] }];
    const baseEntry = [...registryFor("known", CAP_ASSET).values()][0];
    if (!baseEntry) throw new Error("fixture registry entry missing");
    const registry = new Map([
      ["known", { ...baseEntry, validateEnvelope: validator }],
    ]) as unknown as ExtensionRegistryV11;
    assertSchemaPass(wire);

    await expectSemanticFailure(wire, "invalidSemanticValue", "/extensions/known", {
      registry,
      supportedCapabilities: new Map(),
      sha256: () => DIGEST_A,
    });
  });

  it("isolates raw and returned envelopes from a mutating successful registry validator", async () => {
    const wire = embeddedV11();
    wire.extensions = {
      known: {
        schemaVersion: 1,
        requiredCapabilityId: CAP_ASSET,
        data: { nested: { value: "original" } },
      },
    };
    wire.requires = [{ id: CAP_ASSET, minVersion: 1, requiredFor: ["edit"] }];
    const original = clone(wire);
    const baseEntry = [...registryFor("known", CAP_ASSET).values()][0];
    if (!baseEntry) throw new Error("fixture registry entry missing");
    const options: ProjectFormatV11SemanticOptions = {
      registry: new Map([
        [
          "known",
          {
            ...baseEntry,
            validateEnvelope: (envelope) => {
              envelope.requiredCapabilityId = "vivi.cap.mutated";
              const data = envelope.data as { nested: { value: string } };
              data.nested.value = "mutated";
              envelope.blobRefs = [assetRef()];
              return true;
            },
          },
        ],
      ]),
      supportedCapabilities: new Map([[CAP_ASSET, 1]]),
      sha256: () => DIGEST_A,
    };
    assertSchemaPass(wire);

    const result = await validateProjectFormatV11Semantics(wire, options);

    expect(wire).toEqual(original);
    expect(result.normalized.extensions?.known).toEqual(original.extensions?.known);
    expect(result.classifiedExtensions[0]?.envelope).toEqual(original.extensions?.known);
  });

  it("keeps raw input unchanged when a mutating registry validator throws", async () => {
    const wire = embeddedV11();
    wire.extensions = {
      known: {
        schemaVersion: 1,
        requiredCapabilityId: CAP_ASSET,
        data: { nested: { value: "original" } },
      },
    };
    wire.requires = [{ id: CAP_ASSET, minVersion: 1, requiredFor: ["edit"] }];
    const original = clone(wire);
    const baseEntry = [...registryFor("known", CAP_ASSET).values()][0];
    if (!baseEntry) throw new Error("fixture registry entry missing");
    const options: ProjectFormatV11SemanticOptions = {
      registry: new Map([
        [
          "known",
          {
            ...baseEntry,
            validateEnvelope: (envelope) => {
              envelope.requiredCapabilityId = "vivi.cap.mutated";
              const data = envelope.data as { nested: { value: string } };
              data.nested.value = "mutated";
              throw new Error("validator failure after mutation");
            },
          },
        ],
      ]),
      supportedCapabilities: new Map(),
      sha256: () => DIGEST_A,
    };
    assertSchemaPass(wire);

    await expectSemanticFailure(
      wire,
      "invalidSemanticValue",
      "/extensions/known",
      options,
    );
    expect(wire).toEqual(original);
  });
});

describe("Project Format v11 asset invariants", () => {
  it("accepts case-insensitive blob addresses and an exact embedded closure", async () => {
    const wire = embeddedV11();
    const options = attachKnownAssetExtension(wire, [assetRef()]);
    wire.embeddedAssets = {
      [`sha256:${DIGEST_A.toUpperCase()}`]: {
        contentSha256: DIGEST_A,
        sizeBytes: 2,
        encoding: "base64",
        data: "AQI=",
      },
    };
    const original = clone(wire);
    assertSchemaPass(wire);

    const result = await validateProjectFormatV11Semantics(wire, options);
    expect(result.compatibility).toBe("full");
    expect(result.normalized.extensions?.asset?.blobRefs?.[0]).toMatchObject({
      objectAddress: DIGEST_A,
      contentSha256: DIGEST_A,
    });
    expect(Object.keys(result.normalized.embeddedAssets ?? {})).toEqual([
      `sha256:${DIGEST_A}`,
    ]);
    expect(result.normalized.embeddedAssets?.[`sha256:${DIGEST_A}`]?.contentSha256).toBe(
      DIGEST_A,
    );

    const normalizedRef = result.normalized.extensions?.asset?.blobRefs?.[0];
    if (normalizedRef) normalizedRef.mediaType = "normalized-only";
    const classified = result.classifiedExtensions[0];
    if (classified) classified.envelope.requiredCapabilityId = "vivi.cap.changed";
    expect(wire).toEqual(original);
  });

  it("allows exact and hex-case variant refs to share one embedded entry", async () => {
    const wire = embeddedV11();
    const options = attachKnownAssetExtension(wire, [
      assetRef(),
      assetRef({
        objectAddress: DIGEST_A,
        contentSha256: DIGEST_A,
      }),
    ]);
    wire.embeddedAssets = {
      [`sha256:${DIGEST_A}`]: {
        contentSha256: DIGEST_A,
        sizeBytes: 2,
        encoding: "base64",
        data: "AQI=",
      },
    };
    assertSchemaPass(wire);

    await expect(validateProjectFormatV11Semantics(wire, options)).resolves.toBeDefined();
  });

  it("checks every ref sharing an embedded digest", async () => {
    const wire = embeddedV11();
    const options = attachKnownAssetExtension(wire, [
      assetRef(),
      assetRef({ sizeBytes: 3 }),
    ]);
    wire.embeddedAssets = {
      [`sha256:${DIGEST_A}`]: {
        contentSha256: DIGEST_A,
        sizeBytes: 2,
        encoding: "base64",
        data: "AQI=",
      },
    };
    assertSchemaPass(wire);

    await expectSemanticFailure(
      wire,
      "VIVI_FMT_ASSET_HASH_MISMATCH",
      "/extensions/asset/blobRefs/1",
      options,
    );
  });

  it("rejects dangling and orphan embedded assets", async () => {
    const dangling = embeddedV11();
    const danglingOptions = attachKnownAssetExtension(dangling, [assetRef()]);
    assertSchemaPass(dangling);
    await expectSemanticFailure(
      dangling,
      "VIVI_FMT_DANGLING_BLOB_REF",
      "/extensions/asset/blobRefs/0",
      danglingOptions,
    );

    const orphan = embeddedV11();
    orphan.embeddedAssets = {
      [`sha256:${DIGEST_A}`]: {
        contentSha256: DIGEST_A,
        sizeBytes: 2,
        encoding: "base64",
        data: "AQI=",
      },
    };
    assertSchemaPass(orphan);
    await expectSemanticFailure(
      orphan,
      "VIVI_FMT_ORPHAN_EMBEDDED_ASSET",
      `/embeddedAssets/sha256:${DIGEST_A}`,
      { ...EMPTY_OPTIONS, sha256: () => DIGEST_A },
    );
  });

  it("rejects decoded hash mismatch and lowercase-normalized map collisions", async () => {
    const hashMismatch = embeddedV11();
    const mismatchOptions = attachKnownAssetExtension(hashMismatch, [assetRef()]);
    hashMismatch.embeddedAssets = {
      [`sha256:${DIGEST_A}`]: {
        contentSha256: DIGEST_A,
        sizeBytes: 2,
        encoding: "base64",
        data: "AQI=",
      },
    };
    await expectSemanticFailure(
      hashMismatch,
      "VIVI_FMT_ASSET_HASH_MISMATCH",
      `/embeddedAssets/sha256:${DIGEST_A}`,
      { ...mismatchOptions, sha256: () => DIGEST_B },
    );

    const collision = embeddedV11();
    collision.embeddedAssets = {
      [`sha256:${DIGEST_A}`]: {
        contentSha256: DIGEST_A,
        sizeBytes: 2,
        encoding: "base64",
        data: "AQI=",
      },
      [`sha256:${DIGEST_A.toUpperCase()}`]: {
        contentSha256: DIGEST_A.toUpperCase(),
        sizeBytes: 2,
        encoding: "base64",
        data: "AQI=",
      },
    };
    assertSchemaPass(collision);
    await expectSemanticFailure(
      collision,
      "VIVI_FMT_DUPLICATE_MAP_KEY",
      `/embeddedAssets/sha256:${DIGEST_A.toUpperCase()}`,
      { ...EMPTY_OPTIONS, sha256: () => DIGEST_A },
    );
  });

  it.each([
    ["UTF-8 byte ceiling", "😀".repeat(64)],
    ["well-formed Unicode", String.fromCharCode(0xd800)],
  ])("rejects mediaType violating %s", async (_label, mediaType) => {
    const wire = referencedV11();
    const options = attachKnownAssetExtension(wire, [assetRef({ mediaType })]);
    await expectSemanticFailure(
      wire,
      "VIVI_FMT_ASSET_REF_INVALID",
      "/extensions/asset/blobRefs/0/mediaType",
      options,
    );
  });

  it("rejects embedded assets in referenced mode", async () => {
    const wire = referencedV11();
    (wire as unknown as ViviFileDataWireV11Embedded).embeddedAssets = {
      [`sha256:${DIGEST_A}`]: {
        contentSha256: DIGEST_A,
        sizeBytes: 2,
        encoding: "base64",
        data: "AQI=",
      },
    };

    await expectSemanticFailure(wire, "VIVI_FMT_MIXED_ASSET_MODE", "/embeddedAssets");
  });

  it("enforces embedded blob kind, size, and address invariants", async () => {
    const manifest = embeddedV11();
    const manifestOptions = attachKnownAssetExtension(manifest, [
      assetRef({
        storageKind: "chunk_manifest",
        sizeBytes: 16 * 1024 * 1024 + 1,
      }),
    ]);
    await expectSemanticFailure(
      manifest,
      "VIVI_ASSET_TOO_LARGE_FOR_EMBED",
      "/extensions/asset/blobRefs/0",
      manifestOptions,
    );

    const wrongAddress = embeddedV11();
    const addressOptions = attachKnownAssetExtension(wrongAddress, [
      assetRef({ objectAddress: DIGEST_B }),
    ]);
    await expectSemanticFailure(
      wrongAddress,
      "VIVI_FMT_ASSET_REF_INVALID",
      "/extensions/asset/blobRefs/0/objectAddress",
      addressOptions,
    );
  });

  it("enforces the 16 MiB JCS extensions ceiling", async () => {
    const wire = embeddedV11();
    const options = attachKnownAssetExtension(wire, []);
    if (!wire.extensions) throw new Error("fixture extension missing");
    wire.extensions.asset.data = "x".repeat(16 * 1024 * 1024);

    await expectSemanticFailure(
      wire,
      "VIVI_FMT_EXTENSION_CANONICAL_SIZE_EXCEEDED",
      "/extensions",
      options,
    );
  });
});

function richWire(): ViviFileDataWireV11Embedded {
  const wire = embeddedV11([bone("bone"), mesh("mesh")]);
  wire.project.parameters = [
    { id: "p1", name: "p1", minValue: -1, maxValue: 1, defaultValue: 0 },
    { id: "p2", name: "p2", minValue: 0, maxValue: 1, defaultValue: 0 },
  ];
  wire.project.ikControllers = [
    {
      id: "ik",
      name: "ik",
      solverType: "twoBone",
      boneChain: [{ boneId: "bone", minAngle: -1, maxAngle: 1 }],
      targetX: 0,
      targetY: 0,
      influence: 1,
      parameterMappings: [
        {
          boneId: "bone",
          parameterId: "p1",
          angleMin: -1,
          angleMax: 1,
          paramMin: -1,
          paramMax: 1,
        },
      ],
    },
  ];
  wire.project.parameterBindings = [
    {
      id: "binding",
      parameterId: "p1",
      target: { type: "ikController", controllerId: "ik", property: "influence" },
      bindingPoints: [],
    },
  ];
  wire.project.skins = {
    mesh: {
      weights: Array.from({ length: 3 }, () => [{ boneId: "bone", weight: 1 }]),
      bindPoseInverse: { bone: [1, 0, 0, 1, 0, 0] },
    },
  };
  wire.project.physicsGroups = [
    {
      id: "physics",
      name: "physics",
      enabled: true,
      pendulums: [{ length: 1, mass: 1, damping: 0.5 }],
      inputs: [{ parameterId: "p1", weight: 1, type: "angle" }],
      outputs: [{ boneId: "bone", pendulumIndex: 0, weight: 1, type: "boneAngle" }],
      gravityDirection: 0,
      gravityStrength: 1,
      wind: 0,
    },
  ];
  wire.project.clips = [
    {
      id: "clip",
      name: "clip",
      duration: 1,
      fps: 30,
      tracks: [{ parameterId: "p1", keyframes: [] }],
      boneTracks: [{ boneId: "bone", property: "angle", keyframes: [] }],
      imageSequenceTracks: [
        { targetMeshId: "mesh", entries: [{ startFrame: 0, imageId: "image" }] },
      ],
      audioTracks: [
        {
          id: "audio",
          name: "audio",
          sourcePath: "audio.wav",
          startFrame: 0,
          sourceDurationSeconds: 1,
          gain: 1,
          muted: false,
        },
      ],
      lipSyncTracks: [
        {
          id: "lip",
          name: "lip",
          sourceAudioTrackId: "audio",
          analysisType: "rms",
          analysisFps: 30,
          samples: [],
          targetParameterId: "p2",
          sourcePathAtBake: "audio.wav",
          sourceDurationSecondsAtBake: 1,
          gain: 1,
          muted: false,
        },
      ],
      ikControllerTracks: [
        { controllerId: "ik", targetXKeyframes: [], targetYKeyframes: [] },
      ],
    },
  ];
  wire.project.stateMachines = [
    {
      id: "machine",
      name: "machine",
      states: [{ id: "state", name: "state", clipId: "clip", loop: true }],
      transitions: [
        {
          id: "transition",
          fromStateId: "state",
          toStateId: "state",
          conditions: [{ parameterId: "p1", operator: ">", threshold: 0 }],
          transitionDuration: 0,
          priority: 0,
        },
      ],
      initialStateId: "state",
      enabled: true,
    },
  ];
  wire.project.colliders = [
    {
      id: "collider",
      name: "collider",
      shape: { type: "mesh", meshId: "mesh" },
      enabled: true,
    },
  ];
  wire.project.offscreenTargets = [
    { id: "offscreen", width: 1, height: 1, sourceLayerIds: ["mesh"] },
  ];
  wire.project.lipsyncConfig.targetParameterId = "p1";
  wire.project.lipsyncConfig.visemeMappings = [
    { viseme: "aa", target: { type: "parameter", parameterId: "p2", value: 1 } },
  ];
  wire.project.expressionPresets = [
    { id: "expression", name: "expression", values: { p1: 0 } },
  ];
  wire.requires = [
    { id: CAP_CLIP, minVersion: 1, requiredFor: ["render"] },
    { id: CAP_STATE, minVersion: 1, requiredFor: ["render"] },
  ];
  return wire;
}

describe("Project Format v11 project graph and references", () => {
  it("accepts a fully connected mesh/skin/parameter/clip/state/IK/physics graph", async () => {
    const wire = richWire();
    assertSchemaPass(wire);
    await expect(
      validateProjectFormatV11Semantics(wire, {
        registry: new Map(),
        supportedCapabilities: new Map([
          [CAP_CLIP, 1],
          [CAP_STATE, 1],
        ]),
        sha256: () => DIGEST_A,
      }),
    ).resolves.toMatchObject({ compatibility: "full" });
  });

  it.each([
    [
      "parameter",
      (wire: ViviFileDataWireV11Embedded) => {
        const parameter = wire.project.parameters[0];
        if (parameter) parameter.pairedParameterId = "missing";
      },
      "/project/parameters/0/pairedParameterId",
    ],
    [
      "IK bone",
      (wire: ViviFileDataWireV11Embedded) => {
        const constraint = wire.project.ikControllers?.[0]?.boneChain[0];
        if (constraint) constraint.boneId = "missing";
      },
      "/project/ikControllers/0/boneChain/0/boneId",
    ],
    [
      "physics input",
      (wire: ViviFileDataWireV11Embedded) => {
        const input = wire.project.physicsGroups[0]?.inputs[0];
        if (input) input.parameterId = "missing";
      },
      "/project/physicsGroups/0/inputs/0/parameterId",
    ],
    [
      "clip track",
      (wire: ViviFileDataWireV11Embedded) => {
        const track = wire.project.clips[0]?.tracks[0];
        if (track) track.parameterId = "missing";
      },
      "/project/clips/0/tracks/0/parameterId",
    ],
    [
      "state clip",
      (wire: ViviFileDataWireV11Embedded) => {
        const state = wire.project.stateMachines[0]?.states[0];
        if (state) state.clipId = "missing";
      },
      "/project/stateMachines/0/states/0/clipId",
    ],
    [
      "skin weight bone",
      (wire: ViviFileDataWireV11Embedded) => {
        const weight = wire.project.skins.mesh?.weights[0]?.[0];
        if (weight) weight.boneId = "missing";
      },
      "/project/skins/mesh/weights/0/0/boneId",
    ],
  ] as const)("rejects a single dangling %s reference", async (_label, mutate, path) => {
    const wire = richWire();
    mutate(wire);
    assertSchemaPass(wire);
    await expectSemanticFailure(wire, "invalidSemanticValue", path);
  });

  it("rejects malformed mesh and skin coverage", async () => {
    const meshFault = richWire();
    const meshLayer = meshFault.project.layers[1];
    if (meshLayer?.kind === "viviMesh") meshLayer.mesh.uvs.pop();
    await expectSemanticFailure(
      meshFault,
      "invalidSemanticValue",
      "/project/layers/1/mesh",
    );

    const skinFault = richWire();
    skinFault.project.skins.mesh?.weights.pop();
    await expectSemanticFailure(
      skinFault,
      "invalidSemanticValue",
      "/project/skins/mesh/weights",
    );

    const weightSumFault = richWire();
    const weight = weightSumFault.project.skins.mesh?.weights[0]?.[0];
    if (weight) weight.weight = 0.5;
    assertSchemaPass(weightSumFault);
    await expectSemanticFailure(
      weightSumFault,
      "invalidSemanticValue",
      "/project/skins/mesh/weights/0",
    );
  });
});

describe("Project Format v11 path-aware forbidden scan", () => {
  it("does not interpret extension data or approved domain-map keys as structural markers", async () => {
    const wire = embeddedV11();
    wire.project.parameters = [
      {
        id: "blendShapes",
        name: "opaque id",
        minValue: 0,
        maxValue: 1,
        defaultValue: 0,
      },
    ];
    wire.project.expressionPresets = [
      { id: "expression", name: "expression", values: { blendShapes: 0 } },
    ];
    wire.extensions = {
      opaque: {
        schemaVersion: 1,
        requiredCapabilityId: CAP_ASSET,
        data: { blendShapes: { kind: "blendShape" } },
      },
    };
    wire.requires = [{ id: CAP_ASSET, minVersion: 1, requiredFor: ["edit"] }];
    assertSchemaPass(wire);

    await expect(
      validateProjectFormatV11Semantics(wire, {
        registry: new Map(),
        supportedCapabilities: new Map(),
        sha256: () => DIGEST_A,
      }),
    ).resolves.toMatchObject({ compatibility: "readOnly" });
  });

  it("reports the exact core path for a forbidden structural key", async () => {
    const wire = embeddedV11();
    (wire.project as ProjectDataV11 & { blendShapes: object }).blendShapes = {};

    await expectSemanticFailure(wire, "forbiddenPublicFeature", "/project/blendShapes");
  });
});
