import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildEvaluationPayload,
  EvaluationPayloadError,
  type ResolvedAuthoringProjectV1,
  type ViviAssetRefV1,
  type ViviClipMaskEdgeV1,
} from "@vivi2d/model/internal/evaluation-payload-v1";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it, vi } from "vitest";
import { VIVI_RUNTIME_LIMITS } from "../runtime-spec";
import type { LayerNode, ProjectData } from "../types";

const HASH_A = "a".repeat(64);
const PAYLOAD_SCHEMA_BYTES = 33_961;
const PAYLOAD_SCHEMA_SHA256 =
  "8d65b5ddea137a71894e57ba6e14c94576aad63b2b7586728fa2bcca5bb125a3";
const TEXTURE_PLAN_SCHEMA_BYTES = 4_155;
const TEXTURE_PLAN_SCHEMA_SHA256 =
  "90e36afd066cc6f58eb134796779013caf13e9de184b1031b7d834b89fadf055";
const payloadSchemaSource = readFileSync(
  path.join(
    process.cwd(),
    "packages/model/src/evaluation-payload-v1/evaluation-payload-v1.schema.json",
  ),
);
const texturePlanSchemaSource = readFileSync(
  path.join(
    process.cwd(),
    "packages/model/src/evaluation-payload-v1/evaluation-texture-plan-v1.schema.json",
  ),
);
const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
const validatePayloadSchema = ajv.compile(
  JSON.parse(payloadSchemaSource.toString("utf8")),
);
const validateTexturePlanSchema = ajv.compile(
  JSON.parse(texturePlanSchemaSource.toString("utf8")),
);

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function mesh(id: string, drawOrder: number, clipMaskIds?: string[]): LayerNode {
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
    kind: "viviMesh",
    drawOrder,
    clipMaskIds,
    semanticRole: "head",
    managedTag: "must-not-cross",
    mesh: {
      vertices: [0, 0, 1, 0, 0, 1],
      uvs: [0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
      divisionsX: 1,
      divisionsY: 1,
    },
  };
}

function bone(id: string): LayerNode {
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

function project(layers: LayerNode[] = [mesh("mesh-body", 10)]): ProjectData {
  return {
    name: "Evaluation spike",
    width: 16,
    height: 16,
    layers,
    parameters: [
      {
        id: "vivi.head.yaw",
        name: "Yaw",
        minValue: -1,
        maxValue: 1,
        defaultValue: 0,
        managedTag: "must-not-cross",
      },
    ],
    clips: [],
    scenes: [],
    physicsGroups: [],
    lipsyncConfig: {
      enabled: false,
      targetParameterId: null,
      source: "microphone",
      threshold: 0,
      smoothing: 0,
      gain: 1,
    },
    skins: {},
    colliders: [],
    stateMachines: [],
  };
}

function asset(hash = HASH_A): ViviAssetRefV1 {
  return {
    objectAddress: hash,
    storageKind: "blob",
    contentSha256: hash,
    mediaType: "image/png",
    sizeBytes: 123,
  };
}

function resolved(
  source = project(),
  atlasIds = ["z-atlas"],
): ResolvedAuthoringProjectV1 {
  return {
    project: source,
    compatibility: "full",
    atlases: atlasIds.map((id, index) => ({
      id,
      image: asset("abcdef0123456789"[index % 16]!.repeat(64)),
      width: 16,
      height: 16,
      entries: [
        {
          layerId: source.layers[index]?.id ?? source.layers[0]!.id,
          x: 0,
          y: 0,
          width: 16,
          height: 16,
        },
      ],
    })),
  };
}

function semanticResolved(): ResolvedAuthoringProjectV1 {
  const source = project([
    mesh("mesh-body", 10),
    bone("bone-root"),
    { ...bone("bone-child"), parentBoneId: "bone-root" },
  ]);
  source.parameters.push({
    id: "vivi.head.pitch",
    name: "Pitch",
    minValue: -1,
    maxValue: 1,
    defaultValue: 0,
  });
  source.parameters[0]!.pairedParameterId = "vivi.head.pitch";
  source.parameterBindings = [
    {
      id: "binding-a",
      parameterId: "vivi.head.yaw",
      target: { type: "bone", boneId: "bone-root", property: "angle" },
      bindingPoints: [{ paramValue: 0, targetValue: 0 }],
    },
  ];
  source.skins = {
    "mesh-body": {
      weights: Array.from({ length: 3 }, () => [{ boneId: "bone-root", weight: 1 }]),
      bindPoseInverse: { "bone-root": [1, 0, 0, 1, 0, 0] },
    },
  };
  source.ikControllers = [
    {
      id: "ik-a",
      name: "IK",
      solverType: "ccd",
      boneChain: [{ boneId: "bone-child", minAngle: -1, maxAngle: 1 }],
      targetX: 0,
      targetY: 0,
      influence: 1,
      parameterMappings: [
        {
          boneId: "bone-child",
          parameterId: "vivi.head.yaw",
          angleMin: -1,
          angleMax: 1,
          paramMin: -1,
          paramMax: 1,
        },
      ],
    },
  ];
  source.physicsGroups = [
    {
      id: "physics-a",
      name: "Physics",
      enabled: true,
      pendulums: [{ length: 1, mass: 1, damping: 0.5 }],
      inputs: [{ parameterId: "vivi.head.yaw", weight: 1, type: "angle" }],
      outputs: [
        {
          parameterId: "vivi.head.yaw",
          pendulumIndex: 0,
          weight: 1,
          type: "angle",
        },
      ],
      gravityDirection: 0,
      gravityStrength: 1,
      wind: 0,
    },
  ];
  source.colliders = [
    {
      id: "collider-a",
      name: "Collider",
      shape: { type: "mesh", meshId: "mesh-body" },
      enabled: true,
    },
  ];
  source.expressionPresets = [
    {
      id: "expression-a",
      name: "Expression",
      values: { "vivi.head.yaw": 0, "vivi.head.pitch": 0 },
    },
  ];
  source.clips = [
    {
      id: "clip-a",
      name: "Clip",
      duration: 1,
      fps: 30,
      tracks: [
        {
          parameterId: "vivi.head.yaw",
          keyframes: [{ frame: 0, value: 0, interpolation: "linear" }],
        },
      ],
      boneTracks: [
        {
          boneId: "bone-root",
          property: "angle",
          keyframes: [{ frame: 0, value: 0, interpolation: "linear" }],
        },
      ],
      imageSequenceTracks: [
        {
          targetMeshId: "mesh-body",
          entries: [{ startFrame: 0, imageId: "image-a" }],
        },
      ],
      audioTracks: [
        {
          id: "audio-a",
          name: "Audio",
          sourcePath: "audio.wav",
          startFrame: 0,
          sourceDurationSeconds: null,
          gain: 1,
          muted: false,
        },
      ],
      lipSyncTracks: [
        {
          id: "lip-a",
          name: "Lip",
          sourceAudioTrackId: "audio-a",
          analysisType: "rms",
          analysisFps: 30,
          samples: [0],
          targetParameterId: "vivi.head.yaw",
          sourcePathAtBake: "audio.wav",
          sourceDurationSecondsAtBake: null,
          gain: 1,
          muted: false,
        },
      ],
      ikControllerTracks: [
        {
          controllerId: "ik-a",
          targetXKeyframes: [{ frame: 0, value: 0, interpolation: "linear" }],
          targetYKeyframes: [{ frame: 0, value: 0, interpolation: "linear" }],
        },
      ],
    },
  ];
  source.stateMachines = [
    {
      id: "machine-a",
      name: "Machine",
      states: [
        { id: "state-a", name: "State A", clipId: "clip-a", loop: true },
        {
          id: "state-b",
          name: "State B",
          blendTree: {
            parameterId: "vivi.head.yaw",
            entries: [{ threshold: 0, clipId: "clip-a" }],
          },
          loop: true,
        },
      ],
      transitions: [
        {
          id: "transition-a",
          fromStateId: "state-a",
          toStateId: "state-b",
          conditions: [{ parameterId: "vivi.head.yaw", operator: ">", threshold: 0 }],
          transitionDuration: 0,
          priority: 0,
        },
      ],
      initialStateId: "state-a",
      enabled: true,
    },
  ];
  return resolved(source, ["atlas-body"]);
}

function expectEvaluationPayloadError(
  action: () => unknown,
  message: RegExp,
  code: EvaluationPayloadError["code"] = "VIVI_ERR_EVALUATION_PAYLOAD",
): void {
  try {
    action();
    throw new Error("expected evaluation payload rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(EvaluationPayloadError);
    expect((error as EvaluationPayloadError).code).toBe(code);
    expect((error as Error).message).toMatch(message);
  }
}

function findNegativeZeroPaths(value: unknown, path = "$"): string[] {
  if (typeof value === "number") return Object.is(value, -0) ? [path] : [];
  if (Array.isArray(value)) {
    return value.flatMap((child, index) =>
      findNegativeZeroPaths(child, `${path}[${index}]`),
    );
  }
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    findNegativeZeroPaths(child, `${path}.${key}`),
  );
}

function jsonTokenCount(value: unknown): number {
  if (typeof value !== "object" || value === null) return 1;
  const children = Array.isArray(value) ? value : Object.values(value);
  const separators = Math.max(0, children.length - 1);
  const containerTokens = Array.isArray(value)
    ? 2 + separators
    : 2 + children.length * 2 + separators;
  return (
    containerTokens + children.reduce((sum, child) => sum + jsonTokenCount(child), 0)
  );
}

function jsonContainerDepth(value: unknown): number {
  if (typeof value !== "object" || value === null) return 0;
  const children = Array.isArray(value) ? value : Object.values(value);
  return (
    1 +
    children.reduce((maximum, child) => {
      return Math.max(maximum, jsonContainerDepth(child));
    }, 0)
  );
}

function replaceZeroWithNegativeZero(value: unknown): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] === 0) value[index] = -0;
      else replaceZeroWithNegativeZero(value[index]);
    }
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    if (child === 0) record[key] = -0;
    else replaceZeroWithNegativeZero(child);
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function collectObjectIdentities(
  value: unknown,
  identities = new Set<object>(),
): Set<object> {
  if (typeof value !== "object" || value === null || identities.has(value)) {
    return identities;
  }
  identities.add(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    collectObjectIdentities(child, identities);
  }
  return identities;
}

describe("Evaluation Payload v1 Amendment 1 builder", () => {
  it("pins the package-local schemas to the approved artifacts", () => {
    expect(payloadSchemaSource.byteLength).toBe(PAYLOAD_SCHEMA_BYTES);
    expect(sha256Hex(payloadSchemaSource)).toBe(PAYLOAD_SCHEMA_SHA256);
    expect(texturePlanSchemaSource.byteLength).toBe(TEXTURE_PLAN_SCHEMA_BYTES);
    expect(sha256Hex(texturePlanSchemaSource)).toBe(TEXTURE_PLAN_SCHEMA_SHA256);
  });

  it("creates an owned snapshot and keeps sourceAtlasId separate from textureBindingId", () => {
    const source = project();
    const result = buildEvaluationPayload(resolved(source));

    expect(result.payload.schema).toBe("vivi2d.evaluationPayload.v1");
    expect(result.payload.atlases[0]?.id).toBe("z-atlas");
    expect(result.texturePlan.textures[0]?.id).toBe("atlas:z-atlas");
    expect(result.payload.layers[0]).not.toHaveProperty("semanticRole");
    expect(result.payload.layers[0]).not.toHaveProperty("managedTag");
    expect(result.payload.parameters[0]).not.toHaveProperty("managedTag");
    expect(result.payload).not.toHaveProperty("generation");

    source.layers[0]!.name = "mutated after build";
    source.parameters[0]!.defaultValue = 1;
    expect(result.payload.layers[0]?.name).toBe("mesh-body");
    expect(result.payload.parameters[0]?.defaultValue).toBe(0);
  });

  it("treats forbidden spellings as data in every ID-keyed map", () => {
    const source = project([mesh("solver", 10), bone("previewOnly")]);
    source.parameters.push({
      id: "blendShapes",
      name: "Opaque spelling",
      minValue: -1,
      maxValue: 1,
      defaultValue: 0,
    });
    source.expressionPresets = [
      { id: "expression-a", name: "Expression", values: { blendShapes: 0 } },
    ];
    source.skins = {
      solver: {
        weights: [
          [{ boneId: "previewOnly", weight: 1 }],
          [{ boneId: "previewOnly", weight: 1 }],
          [{ boneId: "previewOnly", weight: 1 }],
        ],
        bindPoseInverse: { previewOnly: [1, 0, 0, 1, 0, 0] },
      },
    };

    const result = buildEvaluationPayload(resolved(source));
    expect(
      validatePayloadSchema(result.payload),
      validatePayloadSchema.errors ?? [],
    ).toBe(true);
    expect(result.payload.expressionPresets[0]?.values.blendShapes).toBe(0);
    expect(result.payload.skins.solver?.bindPoseInverse.previewOnly).toEqual([
      1, 0, 0, 1, 0, 0,
    ]);
  });

  it("rejects an input forbidden field before whitelist projection", () => {
    const source = project();
    source.width = 0;
    (source.layers[0] as unknown as Record<string, unknown>).solver = "editor-only";

    try {
      buildEvaluationPayload(resolved(source));
      throw new Error("expected forbidden authoring field rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(EvaluationPayloadError);
      expect((error as EvaluationPayloadError).code).toBe(
        "VIVI_ERR_EVALUATION_FORBIDDEN",
      );
      expect((error as Error).message).toContain(
        "forbidden marker solver at resolved.project.layers[0]",
      );
    }
  });

  it("projects every nested value through the v1 whitelist and validates both schemas", () => {
    const source = project();
    source.layers.push(bone("bone-a"));
    source.parameterBindings = [
      {
        id: "binding-a",
        parameterId: "vivi.head.yaw",
        target: { type: "bone", boneId: "bone-a", property: "angle" },
        bindingPoints: [{ paramValue: 0, targetValue: 0 }],
      },
    ];
    source.skins = {
      "mesh-body": {
        weights: Array.from({ length: 3 }, () => [{ boneId: "bone-a", weight: 1 }]),
        bindPoseInverse: { "bone-a": [1, 0, 0, 1, 0, 0] },
      },
    };
    source.ikControllers = [
      {
        id: "ik-a",
        name: "IK",
        solverType: "ccd",
        boneChain: [],
        targetX: 0,
        targetY: 0,
        influence: 1,
        parameterMappings: [],
      },
    ];
    source.physicsGroups = [
      {
        id: "physics-a",
        name: "Physics",
        enabled: true,
        pendulums: [{ length: 1, mass: 1, damping: 0.5 }],
        inputs: [{ parameterId: "vivi.head.yaw", weight: 1, type: "angle" }],
        outputs: [
          { parameterId: "vivi.head.yaw", pendulumIndex: 0, weight: 1, type: "angle" },
        ],
        gravityDirection: 0,
        gravityStrength: 1,
        wind: 0,
      },
    ];
    source.colliders = [
      {
        id: "collider-a",
        name: "Collider",
        shape: { type: "circle", x: 0, y: 0, radius: 1 },
        enabled: true,
      },
    ];
    source.expressionPresets = [
      { id: "expression-a", name: "Expression", values: { "vivi.head.yaw": 0 } },
    ];
    source.clips = [
      {
        id: "clip-a",
        name: "Clip",
        duration: 1,
        fps: 30,
        tracks: [
          {
            parameterId: "vivi.head.yaw",
            keyframes: [{ frame: 0, value: 0, interpolation: "linear" }],
          },
        ],
        boneTracks: [
          {
            boneId: "bone-a",
            property: "angle",
            keyframes: [{ frame: 0, value: 0, interpolation: "linear" }],
          },
        ],
        imageSequenceTracks: [
          { targetMeshId: "mesh-body", entries: [{ startFrame: 0, imageId: "image-a" }] },
        ],
        audioTracks: [
          {
            id: "audio-a",
            name: "Audio",
            sourcePath: "audio.wav",
            startFrame: 0,
            sourceDurationSeconds: null,
            gain: 1,
            muted: false,
          },
        ],
        lipSyncTracks: [
          {
            id: "lip-a",
            name: "Lip",
            sourceAudioTrackId: "audio-a",
            analysisType: "rms",
            analysisFps: 30,
            samples: [0],
            targetParameterId: "vivi.head.yaw",
            sourcePathAtBake: "audio.wav",
            sourceDurationSecondsAtBake: null,
            gain: 1,
            muted: false,
          },
        ],
        ikControllerTracks: [
          {
            controllerId: "ik-a",
            targetXKeyframes: [{ frame: 0, value: 0, interpolation: "linear" }],
            targetYKeyframes: [{ frame: 0, value: 0, interpolation: "linear" }],
          },
        ],
      },
    ];
    source.stateMachines = [
      {
        id: "machine-a",
        name: "Machine",
        states: [{ id: "state-a", name: "State", clipId: "clip-a", loop: true }],
        transitions: [],
        initialStateId: "state-a",
        enabled: true,
      },
    ];

    const input = resolved(source);
    const injectedObjects: object[] = [
      source.layers[0]!,
      (source.layers[0] as Extract<LayerNode, { kind: "viviMesh" }>).mesh,
      source.parameters[0]!,
      source.parameterBindings[0]!,
      source.parameterBindings[0]!.target,
      source.parameterBindings[0]!.bindingPoints[0]!,
      source.skins["mesh-body"]!,
      source.ikControllers[0]!,
      source.physicsGroups[0]!,
      source.physicsGroups[0]!.pendulums[0]!,
      source.colliders[0]!,
      source.colliders[0]!.shape,
      source.expressionPresets[0]!,
      source.clips[0]!,
      source.clips[0]!.tracks[0]!,
      source.clips[0]!.tracks[0]!.keyframes[0]!,
      source.stateMachines[0]!,
      source.stateMachines[0]!.states[0]!,
      input.atlases[0]!,
      input.atlases[0]!.entries[0]!,
    ];
    for (const value of injectedObjects) {
      Object.assign(value, { futurePrivate: "must-not-cross" });
    }

    const result = buildEvaluationPayload(input);
    expect(JSON.stringify(result)).not.toContain("futurePrivate");
    expect(
      validatePayloadSchema(result.payload),
      JSON.stringify(validatePayloadSchema.errors),
    ).toBe(true);
    expect(
      validateTexturePlanSchema(result.texturePlan),
      JSON.stringify(validateTexturePlanSchema.errors),
    ).toBe(true);
  });

  it("sorts texture bindings by UTF-8 id without changing payload atlas identity", () => {
    const source = project([mesh("mesh-z", 20), mesh("mesh-a", 10)]);
    const input = resolved(source, ["z", "a"]);
    const result = buildEvaluationPayload(input);

    expect(result.payload.atlases.map(({ id }) => id)).toEqual(["z", "a"]);
    expect(result.texturePlan.textures.map(({ id }) => id)).toEqual([
      "atlas:a",
      "atlas:z",
    ]);
  });

  it("uses host-independent UTF-8 byte accounting", () => {
    vi.stubGlobal("TextEncoder", undefined);
    try {
      expect(buildEvaluationPayload(resolved()).payload.schema).toBe(
        "vivi2d.evaluationPayload.v1",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("accepts mixed-case blob digests and emits lowercase texture-plan hashes", () => {
    const input = resolved();
    input.atlases[0]!.image.objectAddress = HASH_A.toUpperCase();
    input.atlases[0]!.image.contentSha256 = HASH_A;

    const result = buildEvaluationPayload(input);

    expect(result.texturePlan.textures[0]?.asset).toMatchObject({
      objectAddress: HASH_A,
      contentSha256: HASH_A,
    });
    expect(validateTexturePlanSchema(result.texturePlan)).toBe(true);
  });

  it("rejects a chunk-manifest PNG above the per-image input-byte ceiling", () => {
    const input = resolved();
    input.atlases[0]!.image = {
      objectAddress: "b".repeat(64),
      storageKind: "chunk_manifest",
      contentSha256: "c".repeat(64),
      mediaType: "image/png",
      sizeBytes: 67_108_865,
    };

    expect(() => buildEvaluationPayload(input)).toThrow(/sizeBytes.*keyword maximum/);
  });

  it("enforces the evaluation-plan aggregate texture-byte ceiling", () => {
    const source = project([mesh("mesh-a", 1), mesh("mesh-b", 2)]);
    const input = resolved(source, ["atlas-a", "atlas-b"]);
    for (const atlas of input.atlases) {
      atlas.width = 8192;
      atlas.height = 8192;
    }
    expect(() => buildEvaluationPayload(input)).toThrow(
      /evaluation plan total texture bytes exceeds 268435456/,
    );
  });

  it("accepts the dotted parameter IDs already used by Runtime Spec v1", () => {
    const result = buildEvaluationPayload(resolved());
    expect(result.payload.parameters[0]?.id).toBe("vivi.head.yaw");
    expect(validatePayloadSchema(result.payload)).toBe(true);
  });

  it("canonicalizes non-inverted mask edges and preserves INVERT edges losslessly", () => {
    type AmendmentLayer = LayerNode & { clipMasks?: ViviClipMaskEdgeV1[] };
    const mask = mesh("mask", 1);
    const body = mesh("body", 2) as AmendmentLayer;
    body.clipMasks = [{ layerId: "mask", invert: false }];
    const nonInverted = buildEvaluationPayload(
      resolved(project([mask, body]), ["mask-atlas", "body-atlas"]),
    );
    expect(nonInverted.payload.layers[1]).toMatchObject({ clipMaskIds: ["mask"] });
    expect(nonInverted.payload.layers[1]).not.toHaveProperty("clipMasks");

    body.clipMasks = [{ layerId: "mask", invert: true }];
    const inverted = buildEvaluationPayload(
      resolved(project([mask, body]), ["mask-atlas", "body-atlas"]),
    );
    expect(inverted.payload.layers[1]).toMatchObject({
      clipMasks: [{ layerId: "mask", invert: true }],
    });
    expect(inverted.payload.layers[1]).not.toHaveProperty("clipMaskIds");
    expect(validatePayloadSchema(inverted.payload)).toBe(true);

    body.clipMaskIds = ["mask"];
    expect(() =>
      buildEvaluationPayload(
        resolved(project([mask, body]), ["mask-atlas", "body-atlas"]),
      ),
    ).toThrow(/both clipMaskIds and clipMasks/);
  });

  it("enforces the Amendment 1 integer and non-negative numeric domains", () => {
    const fractionalDrawOrder = project();
    fractionalDrawOrder.layers[0]!.drawOrder = 0.5;
    expect(() => buildEvaluationPayload(resolved(fractionalDrawOrder))).toThrow(
      /drawOrder.*integer/,
    );

    const fractionalDivisions = project();
    (
      fractionalDivisions.layers[0] as Extract<LayerNode, { kind: "viviMesh" }>
    ).mesh.divisionsX = 0.5;
    expect(() => buildEvaluationPayload(resolved(fractionalDivisions))).toThrow(
      /divisionsX.*integer/,
    );

    const numeric = project();
    numeric.ikControllers = [
      {
        id: "ik-a",
        name: "IK",
        solverType: "ccd",
        boneChain: [],
        targetX: 0,
        targetY: 0,
        influence: 1,
        maxIterations: 0,
        parameterMappings: [],
      },
    ];
    expect(() => buildEvaluationPayload(resolved(numeric))).toThrow(
      /maxIterations.*keyword minimum/,
    );

    numeric.ikControllers[0]!.maxIterations = 10;
    numeric.expressionPresets = [
      { id: "expression-a", name: "Expression", values: {}, hotkey: -1 },
    ];
    expect(() => buildEvaluationPayload(resolved(numeric))).toThrow(
      /hotkey.*keyword minimum/,
    );

    numeric.expressionPresets[0]!.hotkey = 0;
    numeric.clips = [{ id: "clip-a", name: "Clip", duration: 0, fps: 0, tracks: [] }];
    expect(() => buildEvaluationPayload(resolved(numeric))).toThrow(
      /fps.*keyword exclusiveMinimum/,
    );

    numeric.clips[0]!.fps = 30;
    numeric.clips[0]!.duration = -1;
    expect(() => buildEvaluationPayload(resolved(numeric))).toThrow(
      /duration.*keyword minimum/,
    );

    numeric.clips[0]!.duration = 0;
    numeric.stateMachines = [
      {
        id: "machine-a",
        name: "Machine",
        states: [{ id: "state-a", name: "State", loop: false }],
        transitions: [
          {
            id: "transition-a",
            fromStateId: "state-a",
            toStateId: "state-a",
            conditions: [],
            transitionDuration: 0,
            priority: 2_147_483_648,
          },
        ],
        initialStateId: "state-a",
        enabled: true,
      },
    ];
    expect(() => buildEvaluationPayload(resolved(numeric))).toThrow(
      /priority.*keyword maximum/,
    );
  });

  it("rejects non-finite numbers before JSON serialization", () => {
    const source = project();
    source.layers[0]!.opacity = Number.NaN;
    expect(() => buildEvaluationPayload(resolved(source))).toThrow(/must be finite/);
  });

  it("fails closed for raw base64 that reaches the pure builder", () => {
    const input = resolved() as unknown as {
      project: ProjectData;
      compatibility: "full";
      atlases: Array<Record<string, unknown>>;
    };
    input.atlases[0]!.image = "iVBORw0KGgo=";

    expect(() =>
      buildEvaluationPayload(input as unknown as ResolvedAuthoringProjectV1),
    ).toThrowError(EvaluationPayloadError);
  });

  it("rejects mask cycles and cumulative mask depths above the canonical limit", () => {
    const cyclic = project([mesh("a", 0, ["b"]), mesh("b", 1, ["a"])]);
    const cyclicInput = resolved(cyclic, ["a-atlas", "b-atlas"]);
    expect(() => buildEvaluationPayload(cyclicInput)).toThrow(/clip mask cycle/);

    const directMasks = Array.from(
      { length: VIVI_RUNTIME_LIMITS.maxMaskDepth + 1 },
      (_, index) => mesh(`direct-mask-${index}`, index + 1),
    );
    const directEightTarget = mesh(
      "direct-target",
      0,
      directMasks.slice(0, VIVI_RUNTIME_LIMITS.maxMaskDepth).map((layer) => layer.id),
    );
    const directEight = [
      directEightTarget,
      ...directMasks.slice(0, VIVI_RUNTIME_LIMITS.maxMaskDepth),
    ];
    expect(() =>
      buildEvaluationPayload(
        resolved(
          project(directEight),
          directEight.map((_, index) => `direct-eight-atlas-${index}`),
        ),
      ),
    ).not.toThrow();
    const directNineTarget = mesh("direct-target", 0) as LayerNode & {
      clipMasks?: ViviClipMaskEdgeV1[];
    };
    directNineTarget.clipMasks = directMasks.map(({ id: layerId }) => ({
      layerId,
      invert: false,
    }));
    const directNine = [directNineTarget, ...directMasks];
    expect(() =>
      buildEvaluationPayload(
        resolved(
          project(directNine),
          directNine.map((_, index) => `direct-nine-atlas-${index}`),
        ),
      ),
    ).toThrow(/mask depth exceeds 8/);

    const branchAChildren = Array.from({ length: 4 }, (_, index) =>
      mesh(`branch-a-child-${index}`, index + 3),
    );
    const branchBChildren = Array.from({ length: 3 }, (_, index) =>
      mesh(`branch-b-child-${index}`, index + 7),
    );
    const branchB = mesh("branch-b", 2) as LayerNode & {
      clipMasks?: ViviClipMaskEdgeV1[];
    };
    branchB.clipMasks = branchBChildren.map(({ id: layerId }) => ({
      layerId,
      invert: false,
    }));
    const branching = [
      mesh("branch-target", 0, ["branch-a", "branch-b"]),
      mesh(
        "branch-a",
        1,
        branchAChildren.map((layer) => layer.id),
      ),
      branchB,
      ...branchAChildren,
      ...branchBChildren,
    ];
    expect(() =>
      buildEvaluationPayload(
        resolved(
          project(branching),
          branching.map((_, index) => `branch-atlas-${index}`),
        ),
      ),
    ).toThrow(/mask depth exceeds 8/);

    const shared = [
      mesh("shared-target", 0, ["shared-a", "shared-b"]),
      mesh("shared-a", 1, ["shared-leaf"]),
      mesh("shared-b", 2, ["shared-leaf"]),
      mesh("shared-leaf", 3),
    ];
    expect(() =>
      buildEvaluationPayload(
        resolved(
          project(shared),
          shared.map((_, index) => `shared-atlas-${index}`),
        ),
      ),
    ).not.toThrow();

    const chain = Array.from({ length: 10 }, (_, index) =>
      mesh(`m${index}`, index, index < 9 ? [`m${index + 1}`] : undefined),
    );
    const deepInput = resolved(
      project(chain),
      chain.map((_, index) => `atlas-${index}`),
    );
    expect(() => buildEvaluationPayload(deepInput)).toThrow(/mask depth exceeds 8/);
  });

  it("accepts full and readOnly compatibility and rejects forged states", () => {
    const full = semanticResolved();
    expect(buildEvaluationPayload(full).payload.schema).toBe(
      "vivi2d.evaluationPayload.v1",
    );

    const readOnly = semanticResolved();
    readOnly.compatibility = "readOnly";
    expect(buildEvaluationPayload(readOnly).payload.schema).toBe(
      "vivi2d.evaluationPayload.v1",
    );

    for (const compatibility of ["invalid", "future"] as const) {
      const forged = semanticResolved() as ResolvedAuthoringProjectV1 & {
        compatibility: string;
      };
      forged.compatibility = compatibility;
      expectEvaluationPayloadError(
        () => buildEvaluationPayload(forged as ResolvedAuthoringProjectV1),
        /requires full or render-capable readOnly compatibility/,
        "VIVI_ERR_EVALUATION_FORBIDDEN_STATE",
      );
    }
  });

  it("requires an exact plain resolved asset-ref envelope", () => {
    const extra = semanticResolved();
    (extra.atlases[0]!.image as ViviAssetRefV1 & { base64: string }).base64 = "RAW";
    expectEvaluationPayloadError(
      () => buildEvaluationPayload(extra),
      /asset ref keys must match v1.*unexpected: base64/,
    );

    const inherited = semanticResolved();
    Object.setPrototypeOf(inherited.atlases[0]!.image, { base64: "RAW" });
    expectEvaluationPayloadError(
      () => buildEvaluationPayload(inherited),
      /resolved\.atlases\[0\]\.image must have a plain object prototype/,
    );

    const missing = semanticResolved();
    delete (missing.atlases[0]!.image as Partial<ViviAssetRefV1>).mediaType;
    expectEvaluationPayloadError(
      () => buildEvaluationPayload(missing),
      /asset ref keys must match v1.*missing: mediaType/,
    );

    const hidden = semanticResolved();
    Object.defineProperty(hidden.atlases[0]!.image, "base64", {
      configurable: true,
      value: "RAW",
    });
    expectEvaluationPayloadError(
      () => buildEvaluationPayload(hidden),
      /resolved\.atlases\[0\]\.image\.base64 must be an enumerable own data property/,
    );

    const accessor = semanticResolved();
    Object.defineProperty(accessor.atlases[0]!.image, "mediaType", {
      configurable: true,
      enumerable: true,
      get: () => "image/png",
    });
    expectEvaluationPayloadError(
      () => buildEvaluationPayload(accessor),
      /mediaType must be an enumerable own data property/,
    );

    const throwingAccessor = semanticResolved();
    let getterRan = false;
    Object.defineProperty(throwingAccessor.atlases[0]!.image, "objectAddress", {
      configurable: true,
      enumerable: true,
      get: () => {
        getterRan = true;
        throw new Error("GETTER_RAN");
      },
    });
    expectEvaluationPayloadError(
      () => buildEvaluationPayload(throwingAccessor),
      /objectAddress must be an enumerable own data property/,
    );
    expect(getterRan).toBe(false);

    const forbidden = semanticResolved();
    (forbidden.atlases[0]!.image as ViviAssetRefV1 & { solver: string }).solver =
      "private";
    expectEvaluationPayloadError(
      () => buildEvaluationPayload(forbidden),
      /forbidden marker solver/,
      "VIVI_ERR_EVALUATION_FORBIDDEN",
    );

    const symbol = semanticResolved();
    Object.defineProperty(symbol.atlases[0]!.image, Symbol("raw"), { value: "RAW" });
    expectEvaluationPayloadError(
      () => buildEvaluationPayload(symbol),
      /resolved\.atlases\[0\]\.image must not contain symbol properties/,
    );

    const nullPrototype = semanticResolved();
    Object.setPrototypeOf(nullPrototype.atlases[0]!.image, null);
    expect(() => buildEvaluationPayload(nullPrototype)).not.toThrow();
  });

  it("rejects source graph accessors without invoking them", () => {
    const rootAccessor = semanticResolved();
    let rootGetterRan = false;
    Object.defineProperty(rootAccessor, "atlases", {
      configurable: true,
      enumerable: true,
      get: () => {
        rootGetterRan = true;
        throw new Error("ROOT_GETTER_RAN");
      },
    });
    expectEvaluationPayloadError(
      () => buildEvaluationPayload(rootAccessor),
      /resolved\.atlases must be an enumerable own data property/,
    );
    expect(rootGetterRan).toBe(false);

    const atlasAccessor = semanticResolved();
    let atlasGetterRan = false;
    Object.defineProperty(atlasAccessor.atlases[0]!, "image", {
      configurable: true,
      enumerable: true,
      get: () => {
        atlasGetterRan = true;
        throw new Error("ATLAS_GETTER_RAN");
      },
    });
    expectEvaluationPayloadError(
      () => buildEvaluationPayload(atlasAccessor),
      /resolved\.atlases\[0\]\.image must be an enumerable own data property/,
    );
    expect(atlasGetterRan).toBe(false);

    const inheritedAtlasAccessor = semanticResolved();
    const inheritedAtlas = inheritedAtlasAccessor.atlases[0]!;
    let inheritedAtlasGetterRan = false;
    delete (inheritedAtlas as Partial<typeof inheritedAtlas>).image;
    Object.setPrototypeOf(
      inheritedAtlas,
      Object.create(Object.prototype, {
        image: {
          enumerable: true,
          get: () => {
            inheritedAtlasGetterRan = true;
            throw new Error("INHERITED_ATLAS_GETTER_RAN");
          },
        },
      }),
    );
    expectEvaluationPayloadError(
      () => buildEvaluationPayload(inheritedAtlasAccessor),
      /resolved\.atlases\[0\] must have a plain object prototype/,
    );
    expect(inheritedAtlasGetterRan).toBe(false);

    const objectAccessor = semanticResolved();
    let objectGetterRan = false;
    Object.defineProperty(objectAccessor.project.layers[0]!, "name", {
      configurable: true,
      enumerable: true,
      get: () => {
        objectGetterRan = true;
        throw new Error("OBJECT_GETTER_RAN");
      },
    });
    expectEvaluationPayloadError(
      () => buildEvaluationPayload(objectAccessor),
      /resolved\.project\.layers\[0\]\.name must be an enumerable own data property/,
    );
    expect(objectGetterRan).toBe(false);

    const arrayAccessor = semanticResolved();
    const firstLayer = arrayAccessor.project.layers[0]!;
    let arrayGetterRan = false;
    Object.defineProperty(arrayAccessor.project.layers, "0", {
      configurable: true,
      enumerable: true,
      get: () => {
        arrayGetterRan = true;
        throw new Error("ARRAY_GETTER_RAN");
      },
      set: () => undefined,
    });
    expectEvaluationPayloadError(
      () => buildEvaluationPayload(arrayAccessor),
      /resolved\.project\.layers\[0\] must be an enumerable own data property/,
    );
    expect(arrayGetterRan).toBe(false);
    Object.defineProperty(arrayAccessor.project.layers, "0", {
      configurable: true,
      enumerable: true,
      value: firstLayer,
      writable: true,
    });
  });

  it("runs generated Stage 1 before Stage 2", () => {
    const input = semanticResolved();
    input.project.ikControllers![0]!.id = ".";
    input.project.parameters[0]!.minValue = 2;

    expectEvaluationPayloadError(
      () => buildEvaluationPayload(input),
      /payload schema validation failed at \/ikControllers\/0\/id \(keyword pattern\)/,
    );
  });

  it("rejects every Stage 2 reference and uniqueness fault", () => {
    type Vector = {
      name: string;
      mutate: (input: ResolvedAuthoringProjectV1) => void;
      message: RegExp;
    };
    const vectors: Vector[] = [
      {
        name: "parameter range",
        mutate: ({ project }) => {
          project.parameters[0]!.minValue = 2;
        },
        message: /\/payload\/parameters\/0.*parameter range/,
      },
      {
        name: "paired parameter",
        mutate: ({ project }) => {
          project.parameters[0]!.pairedParameterId = "missing-param";
        },
        message: /pairedParameterId.*missing parameter/,
      },
      {
        name: "missing bone parent",
        mutate: ({ project }) => {
          (project.layers[2] as Extract<LayerNode, { kind: "bone" }>).parentBoneId =
            "missing-bone";
        },
        message: /parentBoneId.*missing bone/,
      },
      {
        name: "bone parent cycle",
        mutate: ({ project }) => {
          (project.layers[1] as Extract<LayerNode, { kind: "bone" }>).parentBoneId =
            "bone-child";
        },
        message: /bone parent cycle/,
      },
      {
        name: "duplicate binding",
        mutate: ({ project }) => {
          project.parameterBindings!.push(cloneJson(project.parameterBindings![0]!));
        },
        message: /parameterBindings\/1\/id.*duplicate binding id/,
      },
      {
        name: "binding parameter",
        mutate: ({ project }) => {
          project.parameterBindings![0]!.parameterId = "missing-param";
        },
        message: /parameterBindings\/0\/parameterId.*missing parameter/,
      },
      {
        name: "binding bone",
        mutate: ({ project }) => {
          const target = project.parameterBindings![0]!.target;
          if (target.type === "bone") target.boneId = "missing-bone";
        },
        message: /parameterBindings\/0\/target\/boneId.*missing bone/,
      },
      {
        name: "binding IK controller",
        mutate: ({ project }) => {
          project.parameterBindings![0]!.target = {
            type: "ikController",
            controllerId: "missing-ik",
            property: "targetX",
          };
        },
        message: /parameterBindings\/0\/target\/controllerId.*missing IK controller/,
      },
      {
        name: "duplicate IK",
        mutate: ({ project }) => {
          project.ikControllers!.push(cloneJson(project.ikControllers![0]!));
        },
        message: /ikControllers\/1\/id.*duplicate IK controller id/,
      },
      {
        name: "IK chain bone",
        mutate: ({ project }) => {
          project.ikControllers![0]!.boneChain[0]!.boneId = "missing-bone";
        },
        message: /boneChain\/0\/boneId.*missing bone/,
      },
      {
        name: "IK mapping bone",
        mutate: ({ project }) => {
          project.ikControllers![0]!.parameterMappings[0]!.boneId = "missing-bone";
        },
        message: /parameterMappings\/0\/boneId.*missing bone/,
      },
      {
        name: "IK mapping parameter",
        mutate: ({ project }) => {
          project.ikControllers![0]!.parameterMappings[0]!.parameterId = "missing-param";
        },
        message: /parameterMappings\/0\/parameterId.*missing parameter/,
      },
      {
        name: "skin mesh",
        mutate: ({ project }) => {
          project.skins["ghost-mesh"] = cloneJson(project.skins["mesh-body"]!);
          delete project.skins["mesh-body"];
        },
        message: /skins\/ghost-mesh.*missing mesh/,
      },
      {
        name: "skin row count",
        mutate: ({ project }) => {
          project.skins["mesh-body"]!.weights = [];
        },
        message: /skins\/mesh-body\/weights.*row count/,
      },
      {
        name: "empty skin row",
        mutate: ({ project }) => {
          project.skins["mesh-body"]!.weights[0] = [];
        },
        message: /skins\/mesh-body\/weights\/0.*must not be empty/,
      },
      {
        name: "skin weight range",
        mutate: ({ project }) => {
          project.skins["mesh-body"]!.weights[0]![0]!.weight = 2;
        },
        message: /weights\/0\/0\/weight.*within 0\.\.1/,
      },
      {
        name: "skin weight sum",
        mutate: ({ project }) => {
          project.skins["mesh-body"]!.weights[0]![0]!.weight = 0.5;
        },
        message: /weights\/0.*sum to 1 within 0\.000001/,
      },
      {
        name: "dangling bind pose",
        mutate: ({ project }) => {
          project.skins["mesh-body"]!.bindPoseInverse["missing-bone"] = [
            1, 0, 0, 1, 0, 0,
          ];
        },
        message: /bindPoseInverse\/missing-bone.*missing bone/,
      },
      {
        name: "duplicate physics",
        mutate: ({ project }) => {
          project.physicsGroups.push(cloneJson(project.physicsGroups[0]!));
        },
        message: /physicsGroups\/1\/id.*duplicate physics group id/,
      },
      {
        name: "physics input parameter",
        mutate: ({ project }) => {
          project.physicsGroups[0]!.inputs[0]!.parameterId = "missing-param";
        },
        message: /inputs\/0\/parameterId.*missing parameter/,
      },
      {
        name: "physics output parameter",
        mutate: ({ project }) => {
          project.physicsGroups[0]!.outputs[0]!.parameterId = "missing-param";
        },
        message: /outputs\/0\/parameterId.*missing parameter/,
      },
      {
        name: "physics output bone",
        mutate: ({ project }) => {
          project.physicsGroups[0]!.outputs[0] = {
            boneId: "missing-bone",
            pendulumIndex: 0,
            weight: 1,
            type: "boneAngle",
          };
        },
        message: /outputs\/0\/boneId.*missing bone/,
      },
      {
        name: "duplicate collider",
        mutate: ({ project }) => {
          project.colliders.push(cloneJson(project.colliders[0]!));
        },
        message: /colliders\/1\/id.*duplicate collider id/,
      },
      {
        name: "collider mesh",
        mutate: ({ project }) => {
          const shape = project.colliders[0]!.shape;
          if (shape.type === "mesh") shape.meshId = "missing-mesh";
        },
        message: /colliders\/0\/shape\/meshId.*missing mesh/,
      },
      {
        name: "duplicate expression",
        mutate: ({ project }) => {
          project.expressionPresets!.push(cloneJson(project.expressionPresets![0]!));
        },
        message: /expressionPresets\/1\/id.*duplicate expression preset id/,
      },
      {
        name: "expression parameter",
        mutate: ({ project }) => {
          project.expressionPresets![0]!.values["missing-param"] = 0;
        },
        message: /values\/missing-param.*missing parameter/,
      },
      {
        name: "duplicate clip",
        mutate: ({ project }) => {
          project.clips.push(cloneJson(project.clips[0]!));
        },
        message: /clips\/1\/id.*duplicate clip id/,
      },
      {
        name: "clip parameter",
        mutate: ({ project }) => {
          project.clips[0]!.tracks[0]!.parameterId = "missing-param";
        },
        message: /tracks\/0\/parameterId.*missing parameter/,
      },
      {
        name: "bone track",
        mutate: ({ project }) => {
          project.clips[0]!.boneTracks![0]!.boneId = "missing-bone";
        },
        message: /boneTracks\/0\/boneId.*missing bone/,
      },
      {
        name: "image sequence mesh",
        mutate: ({ project }) => {
          project.clips[0]!.imageSequenceTracks![0]!.targetMeshId = "missing-mesh";
        },
        message: /imageSequenceTracks\/0\/targetMeshId.*missing mesh/,
      },
      {
        name: "duplicate audio",
        mutate: ({ project }) => {
          project.clips[0]!.audioTracks!.push(
            cloneJson(project.clips[0]!.audioTracks![0]!),
          );
        },
        message: /audioTracks\/1\/id.*duplicate audio track id/,
      },
      {
        name: "lip audio",
        mutate: ({ project }) => {
          project.clips[0]!.lipSyncTracks![0]!.sourceAudioTrackId = "missing-audio";
        },
        message: /sourceAudioTrackId.*missing audio track/,
      },
      {
        name: "lip parameter",
        mutate: ({ project }) => {
          project.clips[0]!.lipSyncTracks![0]!.targetParameterId = "missing-param";
        },
        message: /targetParameterId.*missing parameter/,
      },
      {
        name: "IK track controller",
        mutate: ({ project }) => {
          project.clips[0]!.ikControllerTracks![0]!.controllerId = "missing-ik";
        },
        message: /ikControllerTracks\/0\/controllerId.*missing IK controller/,
      },
      {
        name: "duplicate state machine",
        mutate: ({ project }) => {
          project.stateMachines.push(cloneJson(project.stateMachines[0]!));
        },
        message: /stateMachines\/1\/id.*duplicate state machine id/,
      },
      {
        name: "duplicate state",
        mutate: ({ project }) => {
          project.stateMachines[0]!.states.push(
            cloneJson(project.stateMachines[0]!.states[0]!),
          );
        },
        message: /states\/2\/id.*duplicate state id/,
      },
      {
        name: "initial state",
        mutate: ({ project }) => {
          project.stateMachines[0]!.initialStateId = "missing-state";
        },
        message: /initialStateId.*missing state/,
      },
      {
        name: "state clip",
        mutate: ({ project }) => {
          project.stateMachines[0]!.states[0]!.clipId = "missing-clip";
        },
        message: /states\/0\/clipId.*missing clip/,
      },
      {
        name: "blend-tree parameter",
        mutate: ({ project }) => {
          project.stateMachines[0]!.states[1]!.blendTree!.parameterId = "missing-param";
        },
        message: /blendTree\/parameterId.*missing parameter/,
      },
      {
        name: "blend entry clip",
        mutate: ({ project }) => {
          project.stateMachines[0]!.states[1]!.blendTree!.entries[0]!.clipId =
            "missing-clip";
        },
        message: /blendTree\/entries\/0\/clipId.*missing clip/,
      },
      {
        name: "duplicate transition",
        mutate: ({ project }) => {
          project.stateMachines[0]!.transitions.push(
            cloneJson(project.stateMachines[0]!.transitions[0]!),
          );
        },
        message: /transitions\/1\/id.*duplicate transition id/,
      },
      {
        name: "transition from state",
        mutate: ({ project }) => {
          project.stateMachines[0]!.transitions[0]!.fromStateId = "missing-state";
        },
        message: /fromStateId.*missing state/,
      },
      {
        name: "transition to state",
        mutate: ({ project }) => {
          project.stateMachines[0]!.transitions[0]!.toStateId = "missing-state";
        },
        message: /toStateId.*missing state/,
      },
      {
        name: "transition condition parameter",
        mutate: ({ project }) => {
          project.stateMachines[0]!.transitions[0]!.conditions[0]!.parameterId =
            "missing-param";
        },
        message: /conditions\/0\/parameterId.*missing parameter/,
      },
    ];

    expect(vectors).toHaveLength(44);
    for (const vector of vectors) {
      const input = semanticResolved();
      vector.mutate(input);
      expectEvaluationPayloadError(() => buildEvaluationPayload(input), vector.message);
    }
  });

  it("preserves approved sparse bind poses and duplicate lip-sync IDs", () => {
    const input = semanticResolved();
    input.project.skins["mesh-body"]!.bindPoseInverse = {};
    input.project.clips[0]!.lipSyncTracks!.push(
      cloneJson(input.project.clips[0]!.lipSyncTracks![0]!),
    );
    expect(() => buildEvaluationPayload(input)).not.toThrow();
  });

  it("canonicalizes every owned negative zero and emits deterministic map order", () => {
    const negativeZero = semanticResolved();
    replaceZeroWithNegativeZero(negativeZero.project);
    negativeZero.atlases[0]!.entries[0]!.x = -0;
    negativeZero.atlases[0]!.image.sizeBytes = -0;
    expect(Object.is(negativeZero.project.layers[0]!.x, -0)).toBe(true);

    const normalized = buildEvaluationPayload(negativeZero);
    expect(findNegativeZeroPaths(normalized)).toEqual([]);
    expect(validatePayloadSchema(normalized.payload)).toBe(true);
    expect(validateTexturePlanSchema(normalized.texturePlan)).toBe(true);
    expect(Object.is(negativeZero.project.layers[0]!.x, -0)).toBe(true);

    const left = semanticResolved();
    const right = semanticResolved();
    for (const input of [left, right]) {
      input.project.layers.push(mesh("mesh-face", 20));
      input.project.skins["mesh-face"] = {
        weights: Array.from({ length: 3 }, () => [{ boneId: "bone-child", weight: 1 }]),
        bindPoseInverse: {
          "bone-root": [1, 0, 0, 1, 0, 0],
          "bone-child": [1, 0, 0, 1, 0, 0],
        },
      };
      input.project.skins["mesh-body"]!.bindPoseInverse["bone-child"] = [
        1, 0, 0, 1, 0, 0,
      ];
      input.atlases.push({
        id: "atlas-face",
        image: asset("b".repeat(64)),
        width: 16,
        height: 16,
        entries: [{ layerId: "mesh-face", x: 0, y: 0, width: 16, height: 16 }],
      });
    }
    right.project.skins = Object.fromEntries(
      Object.entries(right.project.skins).reverse(),
    );
    for (const skin of Object.values(right.project.skins)) {
      skin.bindPoseInverse = Object.fromEntries(
        Object.entries(skin.bindPoseInverse).reverse(),
      );
    }
    right.project.expressionPresets![0]!.values = Object.fromEntries(
      Object.entries(right.project.expressionPresets![0]!.values).reverse(),
    );

    const leftResult = buildEvaluationPayload(left);
    const rightResult = buildEvaluationPayload(right);
    expect(JSON.stringify(leftResult.payload)).toBe(JSON.stringify(rightResult.payload));
    expect(JSON.stringify(leftResult.texturePlan)).toBe(
      JSON.stringify(rightResult.texturePlan),
    );
    const sourceIdentities = collectObjectIdentities(left);
    const resultIdentities = collectObjectIdentities(leftResult);
    expect(
      [...resultIdentities].filter((identity) => sourceIdentities.has(identity)),
    ).toEqual([]);
    left.project.layers[0]!.name = "mutated";
    expect(leftResult.payload.layers[0]!.name).toBe("mesh-body");
  });

  it("preflights cycles, depth, and generated-output token ceilings", () => {
    const cyclic = semanticResolved();
    const group: LayerNode = {
      id: "group-cycle",
      name: "Cycle",
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      blendMode: "normal",
      expanded: true,
      children: [],
      kind: "group",
    };
    group.children.push(group);
    cyclic.project.layers.push(group);
    expectEvaluationPayloadError(
      () => buildEvaluationPayload(cyclic),
      /object graph cycle/,
    );

    const wrapGroups = (leaf: LayerNode, count: number): LayerNode => {
      let child = leaf;
      for (let index = count - 1; index >= 0; index -= 1) {
        child = {
          id: `depth-group-${index}`,
          name: `Depth ${index}`,
          visible: true,
          opacity: 1,
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          blendMode: "normal",
          expanded: true,
          children: [child],
          kind: "group",
        };
      }
      return child;
    };
    const depthInput = (leaf: LayerNode, outerGroups: number) => {
      const source = project([
        wrapGroups(leaf, outerGroups),
        mesh("depth-mesh", outerGroups + 10),
      ]);
      const input = resolved(source, ["depth-atlas"]);
      input.atlases[0]!.entries[0]!.layerId = "depth-mesh";
      return input;
    };
    const depth64Leaf = {
      ...({
        id: "depth-leaf",
        name: "Depth leaf",
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        blendMode: "normal",
        expanded: true,
        children: [],
        kind: "group",
      } satisfies LayerNode),
      multiplyColor: { r: 1, g: 1, b: 1 },
    } as LayerNode;
    const depth64 = buildEvaluationPayload(depthInput(depth64Leaf, 30));
    expect(jsonContainerDepth(depth64.payload)).toBe(64);

    const depth65Leaf: LayerNode = {
      id: "depth-art",
      name: "Depth art",
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      blendMode: "normal",
      expanded: true,
      children: [],
      kind: "artPath",
      controlPoints: [
        {
          x: 0,
          y: 0,
          handleInX: 0,
          handleInY: 0,
          handleOutX: 0,
          handleOutY: 0,
          width: 1,
          opacity: 1,
        },
      ],
      closed: false,
      style: { color: 0, baseWidth: 1, lineCap: "round", lineJoin: "round" },
    };
    expectEvaluationPayloadError(
      () => buildEvaluationPayload(depthInput(depth65Leaf, 30)),
      /payload.*container depth exceeds 64/,
      "VIVI_ERR_LIMIT_EXCEEDED",
    );

    const baselineInput = semanticResolved();
    const baseline = buildEvaluationPayload(baselineInput);
    const payloadTokens = jsonTokenCount(baseline.payload);
    const payloadDepth = jsonContainerDepth(baseline.payload);
    expect(() =>
      buildEvaluationPayload(semanticResolved(), {
        testOutputGraphLimits: {
          maxContainerDepth: payloadDepth,
          maxTokens: payloadTokens,
        },
      }),
    ).not.toThrow();
    expectEvaluationPayloadError(
      () =>
        buildEvaluationPayload(semanticResolved(), {
          testOutputGraphLimits: { maxTokens: payloadTokens - 1 },
        }),
      /payload tokens exceed/,
      "VIVI_ERR_LIMIT_EXCEEDED",
    );
    expectEvaluationPayloadError(
      () =>
        buildEvaluationPayload(semanticResolved(), {
          testOutputGraphLimits: { maxContainerDepth: payloadDepth - 1 },
        }),
      /payload.*container depth exceeds/,
      "VIVI_ERR_LIMIT_EXCEEDED",
    );
    expect(() =>
      buildEvaluationPayload(semanticResolved(), {
        testOutputGraphLimits: { maxContainerDepth: 65 },
      }),
    ).toThrow(RangeError);
    expect(() =>
      buildEvaluationPayload(semanticResolved(), {
        testOutputGraphLimits: { maxTokens: 8_000_001 },
      }),
    ).toThrow(RangeError);
    expect(() =>
      buildEvaluationPayload(semanticResolved(), {
        testOutputGraphLimits: { unknown: 1 } as never,
      }),
    ).toThrow(RangeError);
  });

  it("handles a maximum-size flat bone chain without recursive DFS", () => {
    const bones = Array.from({ length: VIVI_RUNTIME_LIMITS.maxBones }, (_, index) => {
      const layer = bone(`bone-${index}`);
      if (index > 0) layer.parentBoneId = `bone-${index - 1}`;
      return layer;
    });
    const source = project([mesh("mesh-body", 0), ...bones]);
    const valid = resolved(source, ["atlas-body"]);
    expect(() => buildEvaluationPayload(valid)).not.toThrow();

    bones[0]!.parentBoneId = `bone-${bones.length - 1}`;
    expectEvaluationPayloadError(
      () => buildEvaluationPayload(resolved(source, ["atlas-body"])),
      /bone parent cycle/,
    );
  });
});
