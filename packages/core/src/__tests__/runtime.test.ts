import { describe, expect, it } from "vitest";
import {
  VIVI_RUNTIME_ERROR_CODES,
  VIVI_RUNTIME_LIMITS,
  VIVI_RUNTIME_PROJECT_FILE_VERSION,
  VIVI_RUNTIME_SPEC_VERSION,
  PublicViviModel,
  ViviRuntime,
  ViviRuntimeError,
  type ViviFileData,
  type ViviMeshNode,
} from "../index";

function createMesh(id = "mesh-body", drawOrder = 10): ViviMeshNode {
  return {
    id,
    name: "Body",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    blendMode: "normal",
    expanded: true,
    kind: "viviMesh",
    children: [],
    drawOrder,
    mesh: {
      vertices: [0, 0, 10, 0, 0, 10],
      uvs: [0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
      divisionsX: 1,
      divisionsY: 1,
    },
  };
}

function createFileData(): ViviFileData {
  return {
    version: 10,
    profile: "publicProfileV1",
    atlases: [
      {
        image: "host-atlas-0",
        width: 16,
        height: 16,
        entries: [{ layerId: "mesh-body", x: 0, y: 0, width: 10, height: 10 }],
      },
    ],
    project: {
      name: "runtime-fixture",
      width: 64,
      height: 64,
      layers: [createMesh()],
      parameters: [
        {
          id: "vivi.head.yaw",
          name: "Head Yaw",
          minValue: -1,
          maxValue: 1,
          defaultValue: 0,
        },
      ],
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
      colliders: [
        {
          id: "body-hit",
          name: "Body Hit",
          enabled: true,
          shape: { type: "mesh", meshId: "mesh-body" },
        },
      ],
      stateMachines: [],
      expressionPresets: [
        {
          id: "neutral",
          name: "Neutral",
          values: { "vivi.head.yaw": 0.25 },
          color: "#ffffff",
          hotkey: 1,
        },
      ],
    },
  };
}

function createFileDataWithMeshCount(count: number): ViviFileData {
  const fileData = createFileData();
  const meshes = Array.from({ length: count }, (_value, index) =>
    createMesh(`mesh-${index}`, index),
  );
  fileData.project.layers = meshes;
  fileData.atlases = [
    {
      image: "host-atlas-0",
      width: 16,
      height: 16,
      entries: meshes.map((mesh) => ({
        layerId: mesh.id,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      })),
    },
  ];
  fileData.project.colliders = [];
  return fileData;
}

function expectRuntimeErrorCode(
  callback: () => unknown,
  expectedCode: ViviRuntimeError["code"],
): void {
  let caught: unknown;
  try {
    callback();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ViviRuntimeError);
  expect((caught as ViviRuntimeError).code).toBe(expectedCode);
}

describe("ViviRuntime facade", () => {
  it("loads a public model and exposes stable runtime snapshots", () => {
    const runtime = ViviRuntime.load(createFileData());

    expect(runtime.getSpecVersion()).toEqual(VIVI_RUNTIME_SPEC_VERSION);
    expect(runtime.getParameters()).toEqual([
      {
        id: "vivi.head.yaw",
        min: -1,
        max: 1,
        defaultValue: 0,
        currentValue: 0,
      },
    ]);

    runtime.setInput("vivi.head.yaw", 2);
    expect(runtime.getParameterValue("vivi.head.yaw")).toBe(1);

    runtime.applyExpressionPreset("neutral");
    expect(runtime.getParameterValue("vivi.head.yaw")).toBe(0.25);

    const textures = runtime.getTextures();
    expect(textures).toEqual([
      {
        id: "atlas:0",
        width: 16,
        height: 16,
        format: "rgba8-straight",
        colorSpace: "srgb",
        source: "hostImage",
      },
    ]);
    expect(Object.isFrozen(textures)).toBe(true);
    expect(Object.isFrozen(textures[0])).toBe(true);
    expect(runtime.getTextureData("atlas:0")).toMatchObject({
      hostImageId: "host-atlas-0",
      pixelByteLength: 0,
      rowStride: 0,
    });
    expect(Object.isFrozen(runtime.getTextureData("atlas:0"))).toBe(true);

    const renderList = runtime.getRenderList();
    expect(renderList).toHaveLength(1);
    expect(Object.isFrozen(renderList)).toBe(true);
    expect(Object.isFrozen(renderList[0])).toBe(true);
    expect(renderList[0]).toMatchObject({
      id: "mesh-body",
      textureId: "atlas:0",
      visible: true,
      culled: false,
      blendMode: "normal",
      drawOrder: 10,
    });
    expect(Array.from(renderList[0]!.vertices)).toEqual([0, 0, 10, 0, 0, 10]);
    renderList[0]!.vertices[0] = 99;
    expect(Array.from(runtime.getRenderList()[0]!.vertices)).toEqual([
      0, 0, 10, 0, 0, 10,
    ]);

    expect(runtime.hitTest(2, 2)).toMatchObject({
      colliderId: "body-hit",
      layerId: "mesh-body",
      meshId: "mesh-body",
      x: 2,
      y: 2,
    });
  });

  it("throws canonical runtime errors for invalid mutation requests", () => {
    const runtime = ViviRuntime.load(createFileData());

    expectRuntimeErrorCode(
      () => runtime.setInput("missing", 0),
      VIVI_RUNTIME_ERROR_CODES.invalidArgument,
    );

    expect(() => runtime.update(Number.NaN)).toThrow(ViviRuntimeError);

    expectRuntimeErrorCode(
      () => runtime.playClip("missing"),
      VIVI_RUNTIME_ERROR_CODES.unsupportedOperation,
    );
  });

  it("rejects private-profile markers with the canonical error code", () => {
    const fileData = createFileData() as unknown as Record<string, unknown>;
    const project = fileData.project as Record<string, unknown>;
    Object.defineProperty(project, "blendShapes", {
      value: [],
      enumerable: false,
    });

    expectRuntimeErrorCode(
      () => ViviRuntime.load(fileData as unknown as ViviFileData),
      VIVI_RUNTIME_ERROR_CODES.privateProfile,
    );
  });

  it("prioritizes private-profile rejection before texture binding errors", () => {
    const fileData = createFileData() as unknown as ViviFileData;
    const project = fileData.project as unknown as Record<string, unknown>;
    project.blendShapes = [];
    fileData.atlases = [];

    expectRuntimeErrorCode(
      () => ViviRuntime.load(fileData),
      VIVI_RUNTIME_ERROR_CODES.privateProfile,
    );
  });

  it("rejects accessor-defined private-profile kind markers", () => {
    const fileData = createFileData() as unknown as Record<string, unknown>;
    const project = fileData.project as Record<string, unknown>;
    let getterInvoked = false;
    Object.defineProperty(project, "kind", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return "blendShape";
      },
    });

    expectRuntimeErrorCode(
      () => ViviRuntime.load(fileData as unknown as ViviFileData),
      VIVI_RUNTIME_ERROR_CODES.privateProfile,
    );
    expect(getterInvoked).toBe(false);
  });

  it("rejects private-profile markers attached directly to arrays", () => {
    const fileData = createFileData() as unknown as Record<string, unknown>;
    const project = fileData.project as Record<string, unknown>;
    const layers = project.layers as unknown[];
    Object.defineProperty(layers, "kind", {
      value: "blendShape",
      enumerable: false,
    });

    expectRuntimeErrorCode(
      () => ViviRuntime.load(fileData as unknown as ViviFileData),
      VIVI_RUNTIME_ERROR_CODES.privateProfile,
    );
  });

  it("normalizes malformed object payloads to canonical validation errors", () => {
    const malformed = {
      version: VIVI_RUNTIME_PROJECT_FILE_VERSION,
      profile: "publicProfileV1",
      atlases: [],
    };

    expectRuntimeErrorCode(
      () => ViviRuntime.load(malformed as unknown as ViviFileData),
      VIVI_RUNTIME_ERROR_CODES.validation,
    );
  });

  it("normalizes hostile direct-load accessors to canonical validation errors", () => {
    const hostileProfile = {};
    Object.defineProperty(hostileProfile, "profile", {
      enumerable: true,
      get() {
        throw new Error("hostile profile getter");
      },
    });

    expectRuntimeErrorCode(
      () => ViviRuntime.load(hostileProfile as unknown as ViviFileData),
      VIVI_RUNTIME_ERROR_CODES.validation,
    );

    const hostileVersion = { profile: "publicProfileV1" };
    Object.defineProperty(hostileVersion, "version", {
      enumerable: true,
      get() {
        throw new Error("hostile version getter");
      },
    });

    expectRuntimeErrorCode(
      () => ViviRuntime.load(hostileVersion as unknown as ViviFileData),
      VIVI_RUNTIME_ERROR_CODES.validation,
    );
  });

  it("isolates loaded runtime data from caller-side mutations", () => {
    const fileData = createFileData();
    const runtime = ViviRuntime.load(fileData);
    const originalLayer = fileData.project.layers[0]!;
    originalLayer.x = 99;
    if (originalLayer.kind === "viviMesh") {
      originalLayer.mesh.vertices[0] = 99;
    }

    runtime.update(0);

    const mesh = runtime.getRenderList()[0]!;
    expect(mesh.id).toBe("mesh-body");
    expect(Array.from(mesh.vertices)).toEqual([0, 0, 10, 0, 0, 10]);
  });

  it("validates and clamps initial runtime parameters", () => {
    const clamped = ViviRuntime.load(createFileData(), {
      initialParameters: {
        "vivi.head.yaw": 2,
        "missing.parameter": 10,
      },
    });
    expect(clamped.getParameterValue("vivi.head.yaw")).toBe(1);
    expect(clamped.getParameterValue("missing.parameter")).toBeNull();

    expectRuntimeErrorCode(
      () =>
        ViviRuntime.load(createFileData(), {
          initialParameters: { "vivi.head.yaw": Number.NaN },
        }),
      VIVI_RUNTIME_ERROR_CODES.invalidArgument,
    );
  });

  it("rejects non-public profiles before payload size checks", () => {
    const fileData = createFileData() as unknown as Record<string, unknown>;
    fileData.profile = "privateProfile";
    fileData.project = {
      ...(fileData.project as Record<string, unknown>),
      huge: "x".repeat(1024),
    };

    expectRuntimeErrorCode(
      () =>
        ViviRuntime.load(fileData as unknown as ViviFileData, {
          maxPayloadBytes: 1,
        }),
      VIVI_RUNTIME_ERROR_CODES.privateProfile,
    );
  });

  it("rejects unsupported project versions and disposed model use", () => {
    const unsupported = createFileData() as unknown as Record<string, unknown>;
    unsupported.version = 9;

    expectRuntimeErrorCode(
      () => ViviRuntime.load(unsupported as unknown as ViviFileData),
      VIVI_RUNTIME_ERROR_CODES.unsupportedSpecVersion,
    );

    const runtime = ViviRuntime.load(createFileData());
    runtime.dispose();
    expect(() => runtime.getParameters()).toThrow(ViviRuntimeError);
    expect(VIVI_RUNTIME_PROJECT_FILE_VERSION).toBe(10);
  });

  it("rejects unsupported future public profiles with the canonical spec error", () => {
    const futurePublicProfile = createFileData() as unknown as Record<string, unknown>;
    futurePublicProfile.profile = "publicProfileV2";

    expectRuntimeErrorCode(
      () => ViviRuntime.load(futurePublicProfile as unknown as ViviFileData),
      VIVI_RUNTIME_ERROR_CODES.unsupportedSpecVersion,
    );
  });

  it("enforces the default payload size limit", () => {
    expect(() =>
      ViviRuntime.load(createFileData(), {
        maxPayloadBytes: 1,
      }),
    ).toThrow(ViviRuntimeError);
    expect(VIVI_RUNTIME_LIMITS.maxPayloadBytes).toBeGreaterThan(1);
  });

  it("enforces host-overridden structural runtime limits", () => {
    expectRuntimeErrorCode(
      () =>
        ViviRuntime.load(createFileData(), {
          limits: { maxMeshes: 0 },
        }),
      VIVI_RUNTIME_ERROR_CODES.limitExceeded,
    );

    expect(() =>
      ViviRuntime.load(createFileData(), {
        limits: { maxVerticesPerMesh: 2 },
      }),
    ).toThrow(ViviRuntimeError);

    expect(() =>
      ViviRuntime.load(createFileData(), {
        limits: { maxTextureBytes: 16 * 16 * 4 - 1 },
      }),
    ).toThrow(ViviRuntimeError);

    expectRuntimeErrorCode(
      () =>
        ViviRuntime.load(createFileData(), {
          limits: { maxMeshes: Number.NaN },
        }),
      VIVI_RUNTIME_ERROR_CODES.invalidArgument,
    );

    const tooManyMeshes = createFileDataWithMeshCount(
      VIVI_RUNTIME_LIMITS.maxMeshes + 1,
    );
    expectRuntimeErrorCode(
      () =>
        ViviRuntime.load(tooManyMeshes, {
          limits: { maxMeshes: VIVI_RUNTIME_LIMITS.maxMeshes + 1 },
        }),
      VIVI_RUNTIME_ERROR_CODES.limitExceeded,
    );

    expect(
      ViviRuntime.load(createFileData(), {
        limits: { maxMeshes: VIVI_RUNTIME_LIMITS.maxMeshes + 1 },
        maxPayloadBytes: VIVI_RUNTIME_LIMITS.maxPayloadBytes + 1,
      }).getRenderList(),
    ).toHaveLength(1);
  });

  it("rejects duplicate runtime atlas entries for the same mesh", () => {
    const fileData = createFileData();
    fileData.atlases[0]!.entries.push({
      layerId: "mesh-body",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });

    expectRuntimeErrorCode(
      () => ViviRuntime.load(fileData),
      VIVI_RUNTIME_ERROR_CODES.texture,
    );
  });

  it("restores public model runtime snapshots for transactional updates", () => {
    const model = PublicViviModel.fromFileData(createFileData());
    model.setParameter("vivi.head.yaw", 0.5);
    model.update();
    const before = model.createRuntimeSnapshot();
    const meshStatesView = model.getAllMeshStates();
    const drawOrderView = model.getDrawOrder();

    model.setParameter("vivi.head.yaw", -0.5);
    model.project.layers[0]!.x = 99;
    model.update();
    expect(meshStatesView.get("mesh-body")!.x).toBe(99);

    model.restoreRuntimeSnapshot(before);
    expect(model.parameterValues["vivi.head.yaw"]).toBe(0.5);
    expect(model.getMeshState("mesh-body")!.x).toBe(0);
    expect(meshStatesView.get("mesh-body")!.x).toBe(0);
    expect(drawOrderView).toEqual(["mesh-body"]);
    expect(Array.from(model.getMeshState("mesh-body")!.vertices)).toEqual([
      0, 0, 10, 0, 0, 10,
    ]);
  });

});
