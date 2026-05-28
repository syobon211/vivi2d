import { describe, expect, it } from "vitest";
import {
  computeInputForces,
  computeOutputValues,
  computeBoneLocalTransform,
  computeBoneWorldTransforms,
  computeSkinnedVertices,
  createPhysicsRuntimeState,
  evaluateBindingsAdditive,
  findLayerById,
  flattenLayers,
  getDrawOrder,
  getMultiplyColor,
  hitTestColliders,
  hitTestCollidersAll,
  hitTestMesh,
  isLayerEffectivelyVisible,
  isPolygonFlipped,
  isScreenColorDefault,
  mergeParameterDefaults,
  meshDataToTypedArrays,
  multiplyAffine,
  pointInCircle,
  pointInRect,
  pointInTriangle,
  runPhysicsFrame,
  solveCCDIK,
  solveIKController,
  solveTwoBoneIK,
  stepPhysicsGroup,
  transformPoint,
  buildCCDBoneInputs,
  mapIKToParameters,
  type BoneNode,
  type ColliderData,
  type LayerNode,
  type MeshData,
  type MeshRenderState,
  type ParameterBinding,
  type ParameterDefinition,
  type PhysicsGroup,
  type ProjectData,
  type SkinData,
} from "@vivi2d/core";
import {
  computeRuntimeBoneLocalTransform,
  computeRuntimeBoneWorldTransforms,
  multiplyRuntimeAffine,
  transformRuntimePoint,
} from "../kernel/bone";
import {
  evaluateBindings as evaluateCoreBindings,
} from "@vivi2d/core/model/bindings";
import { buildStaticCaches } from "@vivi2d/core/model/caches";
import { runIKStep } from "@vivi2d/core/model/ik-step";
import { computeAllMeshStates } from "@vivi2d/core/model/mesh-compute";
import { evaluateRuntimeBindings } from "../kernel/bindings";
import {
  getRuntimeDrawOrder,
  getRuntimeMultiplyColor,
  isRuntimeScreenColorDefault,
} from "../kernel/colors";
import { buildRuntimeStaticCaches } from "../kernel/caches";
import {
  hitTestRuntimeColliders,
  hitTestRuntimeCollidersAll,
  hitTestRuntimeMesh,
  pointRuntimeInCircle,
  pointRuntimeInRect,
  pointRuntimeInTriangle,
} from "../kernel/collider";
import { isRuntimePolygonFlipped } from "../kernel/culling";
import { runRuntimeIKStep } from "../kernel/ik";
import {
  buildRuntimeCCDBoneInputs,
  mapRuntimeIKToParameters,
  normalizeRuntimeIKAngle,
  solveRuntimeCCDIK,
  solveRuntimeIKController,
  solveRuntimeTwoBoneIK,
} from "../kernel/ik-solver";
import {
  findRuntimeLayerById,
  flattenRuntimeLayers,
  isRuntimeLayerEffectivelyVisible,
} from "../kernel/layers";
import { meshDataToRuntimeTypedArrays } from "../kernel/mesh-data";
import { mergeRuntimeParameterDefaults } from "../kernel/parameters";
import { evaluateRuntimeBindingsAdditive } from "../kernel/parameter-binding";
import { computeRuntimeMeshStates } from "../kernel/mesh";
import { computeRuntimeSkinnedVertices } from "../kernel/skinning";
import {
  computeRuntimeInputForces,
  computeRuntimeOutputValues,
  createRuntimePhysicsState,
  runRuntimePhysicsFrame,
  stepRuntimePhysicsGroup,
} from "../kernel/physics-engine";

const bindingCases: Array<{
  readonly name: string;
  readonly bindings: readonly ParameterBinding[];
  readonly values: Record<string, number>;
  readonly defaultValue: number;
}> = [
  {
    name: "empty points",
    defaultValue: 10,
    values: { p: 0.2 },
    bindings: [
      {
        id: "binding-empty",
        parameterId: "p",
        target: { type: "bone", boneId: "bone", property: "angle" },
        bindingPoints: [],
      },
    ],
  },
  {
    name: "single point",
    defaultValue: 0,
    values: { p: 0.2 },
    bindings: [
      {
        id: "binding-single",
        parameterId: "p",
        target: { type: "bone", boneId: "bone", property: "angle" },
        bindingPoints: [{ paramValue: 0, targetValue: 1 }],
      },
    ],
  },
  {
    name: "interpolated additive bindings",
    defaultValue: 2,
    values: { p: 0.25, q: 1 },
    bindings: [
      {
        id: "binding-p",
        parameterId: "p",
        target: { type: "bone", boneId: "bone", property: "angle" },
        bindingPoints: [
          { paramValue: 0, targetValue: 2 },
          { paramValue: 0.5, targetValue: 6 },
        ],
      },
      {
        id: "binding-q",
        parameterId: "q",
        target: { type: "bone", boneId: "bone", property: "angle" },
        bindingPoints: [
          { paramValue: -1, targetValue: -2 },
          { paramValue: 0, targetValue: 2 },
          { paramValue: 1, targetValue: 10 },
        ],
      },
    ],
  },
];

const parameterDefinitions: ParameterDefinition[] = [
  {
    id: "input-x",
    name: "Input X",
    minValue: -10,
    maxValue: 10,
    defaultValue: 0,
  },
  {
    id: "input-y",
    name: "Input Y",
    minValue: -10,
    maxValue: 10,
    defaultValue: 0,
  },
  {
    id: "output-angle",
    name: "Output Angle",
    minValue: -1,
    maxValue: 1,
    defaultValue: 0,
  },
];

const physicsGroup: PhysicsGroup = {
  id: "physics",
  name: "Physics",
  enabled: true,
  inputs: [
    { parameterId: "input-x", type: "x", weight: 2 },
    { parameterId: "input-y", type: "y", weight: -1 },
    { parameterId: "input-x", type: "angle", weight: 0.5 },
  ],
  outputs: [
    {
      type: "angle",
      parameterId: "output-angle",
      pendulumIndex: 0,
      weight: 1,
    },
    {
      type: "boneAngle",
      boneId: "bone",
      pendulumIndex: 1,
      weight: 0.75,
    },
  ],
  pendulums: [
    { length: 2, mass: 1.5, damping: 0.03 },
    { length: 1, mass: 2, damping: 0.05 },
  ],
  gravityStrength: 9.8,
  gravityDirection: 12,
  wind: 0.25,
};

const layerTree: LayerNode[] = [
  {
    id: "root",
    name: "Root",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    blendMode: "normal",
    expanded: true,
    kind: "group",
    children: [
      {
        id: "hidden-parent",
        name: "Hidden Parent",
        visible: false,
        opacity: 1,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        blendMode: "normal",
        expanded: true,
        kind: "group",
        children: [
          {
            id: "child",
            name: "Child",
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
            mesh: {
              vertices: [0, 0, 10, 0, 0, 10],
              uvs: [0, 0, 1, 0, 0, 1],
              indices: [0, 1, 2],
              divisionsX: 1,
              divisionsY: 1,
            },
          },
        ],
      },
    ],
  },
];

const meshData: MeshData = {
  vertices: [0, 0, 2, 0, 0, 2],
  uvs: [0, 0, 1, 0, 0, 1],
  indices: [0, 1, 2],
  divisionsX: 1,
  divisionsY: 1,
};

const bindingProject: ProjectData = {
  name: "binding parity",
  width: 64,
  height: 64,
  layers: [
    {
      id: "bone",
      name: "Bone",
      visible: true,
      opacity: 1,
      x: 5,
      y: 6,
      width: 10,
      height: 10,
      blendMode: "normal",
      expanded: true,
      kind: "bone",
      children: [],
      bone: { angle: 0, length: 10, scaleX: 1, scaleY: 1 },
    },
  ],
  parameters: parameterDefinitions,
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
  parameterBindings: [
    {
      id: "angle-binding",
      parameterId: "input-x",
      target: { type: "bone", boneId: "bone", property: "angle" },
      bindingPoints: [
        { paramValue: -1, targetValue: -0.5 },
        { paramValue: 1, targetValue: 0.5 },
      ],
    },
    {
      id: "ik-binding",
      parameterId: "input-y",
      target: { type: "ikController", controllerId: "ik", property: "targetX" },
      bindingPoints: [
        { paramValue: -1, targetValue: -10 },
        { paramValue: 1, targetValue: 10 },
      ],
    },
  ],
  ikControllers: [
    {
      id: "ik",
      name: "IK",
      solverType: "ccd",
      boneChain: [{ boneId: "bone", minAngle: -Math.PI, maxAngle: Math.PI }],
      targetX: 0,
      targetY: 0,
      influence: 1,
      maxIterations: 1,
      parameterMappings: [],
    },
  ],
  colliders: [],
  stateMachines: [],
};

const meshProject: ProjectData = {
  ...bindingProject,
  layers: [
    {
      id: "mesh",
      name: "Mesh",
      visible: true,
      opacity: 0.75,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      blendMode: "screen",
      expanded: true,
      kind: "viviMesh",
      children: [],
      drawOrder: 7,
      mesh: meshData,
      culling: true,
    },
  ],
  parameterBindings: [],
  ikControllers: [],
};

const ikProject: ProjectData = {
  ...bindingProject,
  layers: [
    {
      id: "upper",
      name: "Upper",
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      blendMode: "normal",
      expanded: true,
      kind: "bone",
      children: [],
      bone: { angle: 0, length: 10, scaleX: 1, scaleY: 1 },
    },
    {
      id: "lower",
      name: "Lower",
      visible: true,
      opacity: 1,
      x: 10,
      y: 0,
      width: 10,
      height: 10,
      blendMode: "normal",
      expanded: true,
      kind: "bone",
      parentBoneId: "upper",
      children: [],
      bone: { angle: 0, length: 10, scaleX: 1, scaleY: 1 },
    },
  ],
  parameterBindings: [],
  ikControllers: [
    {
      id: "ik",
      name: "IK",
      solverType: "twoBone",
      boneChain: [
        { boneId: "upper", minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: "lower", minAngle: -Math.PI, maxAngle: Math.PI },
      ],
      targetX: 10,
      targetY: 10,
      influence: 1,
      maxIterations: 8,
      parameterMappings: [],
    },
  ],
};

function cloneProject(project: ProjectData): ProjectData {
  return JSON.parse(JSON.stringify(project)) as ProjectData;
}

function normalizeMeshStates(states: Map<string, unknown>): unknown {
  return [...states.entries()].map(([id, state]) => {
    const meshState = state as {
      vertices: Float32Array;
      uvs: Float32Array;
      indices: Uint32Array;
    };
    return [
      id,
      {
        ...meshState,
        vertices: Array.from(meshState.vertices),
        uvs: Array.from(meshState.uvs),
        indices: Array.from(meshState.indices),
      },
    ];
  });
}

function createPlaceholderMeshState(id: string) {
  return {
    id,
    vertices: new Float32Array([99, 99, 100, 99, 99, 100]),
    uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    blendMode: "normal" as const,
    multiplyColor: { r: 1, g: 1, b: 1 },
    screenColor: undefined,
    drawOrder: 999,
    culled: false,
  };
}

function clonePhysicsGroup(): PhysicsGroup {
  return JSON.parse(JSON.stringify(physicsGroup)) as PhysicsGroup;
}

function expectCloseRecord(
  actual: Record<string, number>,
  expected: Record<string, number>,
): void {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  for (const key of Object.keys(expected)) {
    expect(actual[key]).toBeCloseTo(expected[key]!, 12);
  }
}

function expectSkinningParity(
  name: string,
  vertices: number[],
  skin: SkinData,
  runtimeWorld: ReturnType<typeof computeRuntimeBoneWorldTransforms>,
  coreWorld: ReturnType<typeof computeBoneWorldTransforms>,
): void {
  expect(computeRuntimeSkinnedVertices(vertices, skin, runtimeWorld), name).toEqual(
    computeSkinnedVertices(vertices, skin, coreWorld),
  );
}

function normalizeIKSolution(solution: {
  readonly solvedAngles: ReadonlyMap<string, number>;
  readonly reached: boolean;
}): { readonly reached: boolean; readonly solvedAngles: Record<string, number> } {
  return {
    reached: solution.reached,
    solvedAngles: Object.fromEntries(solution.solvedAngles),
  };
}

describe("@vivi2d/runtime-wasm primitive kernel parity", () => {
  it("matches core draw-order and color helpers", () => {
    expect(getRuntimeDrawOrder(undefined)).toBe(getDrawOrder(undefined));
    expect(getRuntimeDrawOrder(12)).toBe(getDrawOrder(12));
    expect(getRuntimeMultiplyColor(undefined)).toEqual(getMultiplyColor(undefined));
    expect(getRuntimeMultiplyColor({ r: 0.5, g: 0.4, b: 0.3 })).toEqual(
      getMultiplyColor({ r: 0.5, g: 0.4, b: 0.3 }),
    );
    expect(isRuntimeScreenColorDefault(undefined)).toBe(
      isScreenColorDefault(undefined),
    );
    expect(isRuntimeScreenColorDefault({ r: 0, g: 0, b: 0 })).toBe(
      isScreenColorDefault({ r: 0, g: 0, b: 0 }),
    );
    expect(isRuntimeScreenColorDefault({ r: 0.1, g: 0, b: 0 })).toBe(
      isScreenColorDefault({ r: 0.1, g: 0, b: 0 }),
    );
  });

  it("matches core layer tree helpers", () => {
    const coreFlattened = flattenLayers(layerTree);
    const runtimeFlattened = flattenRuntimeLayers(layerTree);
    expect(runtimeFlattened.map((layer) => layer.id)).toEqual(
      coreFlattened.map((layer) => layer.id),
    );
    expect(findRuntimeLayerById(layerTree, "child")).toBe(
      findLayerById(layerTree, "child"),
    );
    expect(findRuntimeLayerById(layerTree, "missing")).toBe(
      findLayerById(layerTree, "missing"),
    );
    const child = findRuntimeLayerById(layerTree, "child");
    expect(child).not.toBeNull();
    expect(isRuntimeLayerEffectivelyVisible(child!, layerTree)).toBe(
      isLayerEffectivelyVisible(child!, layerTree),
    );
  });

  it("matches core culling and mesh typed-array helpers", () => {
    const flippedVertices = [0, 0, 0, 10, 10, 0];
    const visibleVertices = [0, 0, 10, 0, 0, 10];
    expect(isRuntimePolygonFlipped(flippedVertices)).toBe(
      isPolygonFlipped(flippedVertices),
    );
    expect(isRuntimePolygonFlipped(visibleVertices)).toBe(
      isPolygonFlipped(visibleVertices),
    );
    expect(isRuntimePolygonFlipped([0, 0, 1, 1])).toBe(
      isPolygonFlipped([0, 0, 1, 1]),
    );

    const runtimeTyped = meshDataToRuntimeTypedArrays(meshData);
    const coreTyped = meshDataToTypedArrays(meshData);
    expect(Array.from(runtimeTyped.vertices)).toEqual(Array.from(coreTyped.vertices));
    expect(Array.from(runtimeTyped.uvs)).toEqual(Array.from(coreTyped.uvs));
    expect(Array.from(runtimeTyped.indices)).toEqual(Array.from(coreTyped.indices));
  });

  it("matches core collider hit-test helpers", () => {
    const meshStateA: MeshRenderState = {
      ...createPlaceholderMeshState("mesh-a"),
      vertices: new Float32Array([0, 0, 20, 0, 0, 20]),
      indices: new Uint32Array([0, 1, 2]),
      drawOrder: 5,
    };
    const meshStateB: MeshRenderState = {
      ...createPlaceholderMeshState("mesh-b"),
      vertices: new Float32Array([0, 0, 20, 0, 0, 20]),
      indices: new Uint32Array([0, 1, 2]),
      drawOrder: 9,
    };
    const shiftedMeshState: MeshRenderState = {
      ...createPlaceholderMeshState("mesh-shifted"),
      x: 5,
      y: 10,
      vertices: new Float32Array([0, 0, 20, 0, 0, 20]),
      indices: new Uint32Array([0, 1, 2]),
      drawOrder: 1,
    };
    const invisibleMeshState: MeshRenderState = {
      ...createPlaceholderMeshState("mesh-invisible"),
      vertices: new Float32Array([0, 0, 20, 0, 0, 20]),
      indices: new Uint32Array([0, 1, 2]),
      visible: false,
      drawOrder: 20,
    };
    const modelSpaceMeshState: MeshRenderState = {
      ...createPlaceholderMeshState("mesh-model-space"),
      x: 200,
      y: 300,
      verticesSpace: "model",
      vertices: new Float32Array([200, 300, 300, 300, 200, 400]),
      indices: new Uint32Array([0, 1, 2]),
    };
    const meshStates = new Map<string, MeshRenderState>([
      ["mesh-a", meshStateA],
      ["mesh-b", meshStateB],
      ["mesh-shifted", shiftedMeshState],
      ["mesh-invisible", invisibleMeshState],
    ]);
    const colliders: ColliderData[] = [
      {
        id: "mesh-low",
        name: "Mesh Low",
        enabled: true,
        shape: { type: "mesh", meshId: "mesh-a" },
      },
      {
        id: "mesh-high",
        name: "Mesh High",
        enabled: true,
        shape: { type: "mesh", meshId: "mesh-b" },
      },
      {
        id: "disabled",
        name: "Disabled",
        enabled: false,
        shape: { type: "rectangle", x: 0, y: 0, width: 100, height: 100 },
      },
      {
        id: "circle",
        name: "Circle",
        enabled: true,
        tag: "round",
        shape: { type: "circle", x: 10, y: 10, radius: 10 },
      },
      {
        id: "rect",
        name: "Rect",
        enabled: true,
        shape: { type: "rectangle", x: 0, y: 0, width: 20, height: 20 },
      },
    ];
    const invisibleMeshColliders: ColliderData[] = [
      {
        id: "invisible-mesh",
        name: "Invisible Mesh",
        enabled: true,
        shape: { type: "mesh", meshId: "mesh-invisible" },
      },
    ];

    expect(pointRuntimeInTriangle(2, 2, 0, 0, 20, 0, 0, 20)).toBe(
      pointInTriangle(2, 2, 0, 0, 20, 0, 0, 20),
    );
    expect(pointRuntimeInRect(5, 5, 0, 0, 10, 10)).toBe(
      pointInRect(5, 5, 0, 0, 10, 10),
    );
    expect(pointRuntimeInCircle(5, 5, 0, 0, 8)).toBe(
      pointInCircle(5, 5, 0, 0, 8),
    );
    expect(hitTestRuntimeMesh(meshStateA, 4, 4)).toBe(
      hitTestMesh(meshStateA, 4, 4),
    );
    expect(hitTestRuntimeMesh(shiftedMeshState, 9, 14)).toBe(
      hitTestMesh(shiftedMeshState, 9, 14),
    );
    expect(hitTestRuntimeMesh(modelSpaceMeshState, 250, 350)).toBe(
      hitTestMesh(modelSpaceMeshState, 250, 350),
    );
    expect(hitTestRuntimeMesh(shiftedMeshState, 4, 4)).toBe(false);

    const topHit = hitTestRuntimeColliders(colliders, meshStates, 5, 5);
    expect(topHit).toEqual(hitTestColliders(colliders, meshStates, 5, 5));
    expect(topHit?.colliderId).toBe("circle");
    expect(hitTestRuntimeCollidersAll(colliders, meshStates, 5, 5)).toEqual(
      hitTestCollidersAll(colliders, meshStates, 5, 5),
    );
    expect(hitTestRuntimeColliders(colliders, meshStates, 999, 999)).toEqual(
      hitTestColliders(colliders, meshStates, 999, 999),
    );
    expect(
      hitTestRuntimeColliders(invisibleMeshColliders, meshStates, 5, 5),
    ).toEqual(hitTestColliders(invisibleMeshColliders, meshStates, 5, 5));
    expect(
      hitTestRuntimeColliders(invisibleMeshColliders, meshStates, 5, 5),
    ).toBeNull();
  });

  it("matches core parameter default merging", () => {
    expect(
      mergeRuntimeParameterDefaults(parameterDefinitions, { "input-x": 0.5 }),
    ).toEqual(mergeParameterDefaults(parameterDefinitions, { "input-x": 0.5 }));
  });

  it("matches core bone affine helpers", () => {
    const upper = ikProject.layers[0]!;
    expect(upper.kind).toBe("bone");
    const transformedBone: BoneNode = {
      id: "transformed",
      name: "Transformed",
      visible: true,
      opacity: 1,
      x: 3,
      y: -2,
      width: 10,
      height: 10,
      blendMode: "normal",
      expanded: true,
      kind: "bone",
      children: [],
      bone: {
        angle: Math.PI / 6,
        length: 10,
        scaleX: 1.5,
        scaleY: 0.75,
      },
    };
    const parent: [number, number, number, number, number, number] = [
      1, 2, 3, 4, 5, 6,
    ];
    const child: [number, number, number, number, number, number] = [
      0.5, 0, 0, 0.75, 2, 3,
    ];

    expect(computeRuntimeBoneLocalTransform(upper)).toEqual(
      computeBoneLocalTransform(upper),
    );
    expect(computeRuntimeBoneLocalTransform(transformedBone)).toEqual(
      computeBoneLocalTransform(transformedBone),
    );
    expect(multiplyRuntimeAffine(parent, child)).toEqual(
      multiplyAffine(parent, child),
    );
    expect(transformRuntimePoint(parent, 7, 8)).toEqual(
      transformPoint(parent, 7, 8),
    );
  });

  it("matches core bone world transforms and skinning", () => {
    const runtimeProject = cloneProject(ikProject);
    const coreProject = cloneProject(ikProject);
    const runtimeWorld = computeRuntimeBoneWorldTransforms(runtimeProject.layers);
    const coreWorld = computeBoneWorldTransforms(coreProject.layers);

    expect(Object.fromEntries(runtimeWorld)).toEqual(Object.fromEntries(coreWorld));

    const skin: SkinData = {
      weights: [
        [{ boneId: "upper", weight: 0.5 }],
        [{ boneId: "lower", weight: 1 }],
        [],
      ],
      bindPoseInverse: {
        upper: [1, 0, 0, 1, 0, 0],
        lower: [1, 0, 0, 1, -10, 0],
      },
    };
    const vertices = [0, 0, 10, 0, 0, 10];
    expectSkinningParity("normal skinning", vertices, skin, runtimeWorld, coreWorld);

    expectSkinningParity(
      "zero applied weight falls back to rest vertex",
      vertices,
      {
        weights: [
          [{ boneId: "upper", weight: 0 }],
          [{ boneId: "lower", weight: 0 }],
          [],
        ],
        bindPoseInverse: skin.bindPoseInverse,
      },
      runtimeWorld,
      coreWorld,
    );
    expectSkinningParity(
      "partial weight keeps remaining rest pose contribution",
      vertices,
      {
        weights: [
          [{ boneId: "upper", weight: 0.25 }],
          [{ boneId: "lower", weight: 0.5 }],
          [],
        ],
        bindPoseInverse: skin.bindPoseInverse,
      },
      runtimeWorld,
      coreWorld,
    );
    expectSkinningParity(
      "missing world transform skips contribution",
      vertices,
      {
        weights: [
          [{ boneId: "missing-world", weight: 1 }],
          [{ boneId: "upper", weight: 1 }],
          [],
        ],
        bindPoseInverse: {
          ...skin.bindPoseInverse,
          "missing-world": [1, 0, 0, 1, 0, 0],
        },
      },
      runtimeWorld,
      coreWorld,
    );
    expectSkinningParity(
      "missing bind pose inverse skips contribution",
      vertices,
      {
        weights: [
          [{ boneId: "upper", weight: 1 }],
          [{ boneId: "lower", weight: 1 }],
          [],
        ],
        bindPoseInverse: { lower: skin.bindPoseInverse.lower! },
      },
      runtimeWorld,
      coreWorld,
    );
  });

  it("keeps malformed cyclic bone parents from recursing indefinitely", () => {
    const cyclicLayers: BoneNode[] = [
      {
        id: "cycle-a",
        name: "Cycle A",
        visible: true,
        opacity: 1,
        x: 1,
        y: 2,
        width: 10,
        height: 10,
        blendMode: "normal",
        expanded: true,
        kind: "bone",
        parentBoneId: "cycle-b",
        children: [],
        bone: { angle: 0.1, length: 10, scaleX: 1, scaleY: 1 },
      },
      {
        id: "cycle-b",
        name: "Cycle B",
        visible: true,
        opacity: 1,
        x: 3,
        y: 4,
        width: 10,
        height: 10,
        blendMode: "normal",
        expanded: true,
        kind: "bone",
        parentBoneId: "cycle-a",
        children: [],
        bone: { angle: -0.2, length: 10, scaleX: 1.25, scaleY: 0.8 },
      },
    ];

    const world = computeRuntimeBoneWorldTransforms(cyclicLayers);

    expect(world.get("cycle-a")).toEqual(
      computeRuntimeBoneLocalTransform(cyclicLayers[0]!),
    );
    expect(world.get("cycle-b")).toEqual(
      computeRuntimeBoneLocalTransform(cyclicLayers[1]!),
    );
  });

  it("matches core grouped binding evaluation", () => {
    const prev = {
      boneX: {},
      boneY: {},
      boneAngles: { bone: 0.25 },
      boneScaleX: {},
      boneScaleY: {},
      ikTargetX: { ik: 1 },
      ikTargetY: {},
      ikPoleTargetX: {},
      ikPoleTargetY: {},
      ikInfluence: {},
    };
    const values = { "input-x": 0.5, "input-y": -0.5 };
    const runtimeResult = evaluateRuntimeBindings(
        bindingProject.parameterBindings,
        values,
        bindingProject,
        prev,
        { boneX: { bone: 5 }, boneY: { bone: 6 } },
    );
    const coreResult = evaluateCoreBindings(
      bindingProject.parameterBindings,
      values,
      bindingProject,
      prev,
      { boneX: { bone: 5 }, boneY: { bone: 6 } },
    );

    expect(runtimeResult.boneAngles).toEqual(coreResult.boneAngles);
    expect(runtimeResult.ikTargetX).toEqual(coreResult.ikTargetX);
  });

  it("matches core static cache construction", () => {
    const layers = flattenRuntimeLayers([
      ...meshProject.layers,
      ...ikProject.layers,
    ]);
    const runtimeCaches = buildRuntimeStaticCaches(layers);
    const coreCaches = buildStaticCaches(layers);

    expect([...runtimeCaches.meshStaticCache.keys()]).toEqual([
      ...coreCaches.meshStaticCache.keys(),
    ]);
    for (const [id, runtimeCache] of runtimeCaches.meshStaticCache) {
      const coreCache = coreCaches.meshStaticCache.get(id);
      expect(coreCache).toBeDefined();
      expect(Array.from(runtimeCache.uvs)).toEqual(Array.from(coreCache!.uvs));
      expect(Array.from(runtimeCache.indices)).toEqual(
        Array.from(coreCache!.indices),
      );
    }
    expect([...runtimeCaches.boneLengths.entries()]).toEqual([
      ...coreCaches.boneLengths.entries(),
    ]);
    expect([...runtimeCaches.meshScratchVerts.keys()]).toEqual([
      ...coreCaches.meshScratchVerts.keys(),
    ]);
    for (const [id, runtimeScratch] of runtimeCaches.meshScratchVerts) {
      const coreScratch = coreCaches.meshScratchVerts.get(id);
      expect(coreScratch).toBeDefined();
      expect(Array.from(runtimeScratch)).toEqual(Array.from(coreScratch!));
    }
  });

  it("matches core IK solver primitives", () => {
    const twoBoneController = ikProject.ikControllers[0]!;
    const bone0 = twoBoneController.boneChain[0]!;
    const bone1 = twoBoneController.boneChain[1]!;
    const constraints = [bone0, bone1] as [typeof bone0, typeof bone1];

    expect(normalizeRuntimeIKAngle(Math.PI)).toBe(-Math.PI);
    expect(normalizeRuntimeIKAngle(-Math.PI)).toBe(-Math.PI);
    expect(normalizeRuntimeIKAngle(3 * Math.PI)).toBe(-Math.PI);
    expect(normalizeRuntimeIKAngle(-3 * Math.PI)).toBe(-Math.PI);
    expect(normalizeRuntimeIKAngle(Math.PI / 2)).toBe(Math.PI / 2);
    expect(
      solveRuntimeTwoBoneIK(0, 0, 10, 10, 10, 10, 0, 20, constraints),
    ).toEqual(solveTwoBoneIK(0, 0, 10, 10, 10, 10, 0, 20, constraints));
    expect(solveRuntimeTwoBoneIK(0, 0, 10, 5, 100, 0)).toEqual(
      solveTwoBoneIK(0, 0, 10, 5, 100, 0),
    );
    expect(solveRuntimeTwoBoneIK(0, 0, 10, 2, 1, 0)).toEqual(
      solveTwoBoneIK(0, 0, 10, 2, 1, 0),
    );

    const runtimeProject = cloneProject(ikProject);
    const coreProject = cloneProject(ikProject);
    const runtimeWorld = computeRuntimeBoneWorldTransforms(runtimeProject.layers);
    const coreWorld = computeBoneWorldTransforms(coreProject.layers);
    const runtimeBoneLengths = buildRuntimeStaticCaches(
      flattenRuntimeLayers(runtimeProject.layers),
    ).boneLengths;
    const coreBoneLengths = buildStaticCaches(flattenLayers(coreProject.layers))
      .boneLengths;

    expect(
      normalizeIKSolution(
        solveRuntimeIKController(
          runtimeProject.ikControllers[0]!,
          runtimeWorld,
          runtimeBoneLengths,
        ),
      ),
    ).toEqual(
      normalizeIKSolution(
        solveIKController(
          coreProject.ikControllers[0]!,
          coreWorld,
          coreBoneLengths,
        ),
      ),
    );

    const foldedController = {
      ...runtimeProject.ikControllers[0]!,
      targetX: 1,
      targetY: 0,
    };
    const foldedRuntimeSolution = solveRuntimeIKController(
      foldedController,
      new Map([
        ["upper", [1, 0, 0, 1, 0, 0]],
        ["lower", [1, 0, 0, 1, 10, 0]],
      ]),
      new Map([
        ["upper", 10],
        ["lower", 2],
      ]),
    );
    const foldedCoreSolution = solveIKController(
      foldedController,
      new Map([
        ["upper", [1, 0, 0, 1, 0, 0]],
        ["lower", [1, 0, 0, 1, 10, 0]],
      ]),
      new Map([
        ["upper", 10],
        ["lower", 2],
      ]),
    );
    expect(normalizeIKSolution(foldedRuntimeSolution)).toEqual(
      normalizeIKSolution(foldedCoreSolution),
    );
    expect(foldedRuntimeSolution.reached).toBe(false);

    const lowerBoundarySolution = solveRuntimeIKController(
      { ...foldedController, targetX: 8, targetY: 0 },
      new Map([
        ["upper", [1, 0, 0, 1, 0, 0]],
        ["lower", [1, 0, 0, 1, 10, 0]],
      ]),
      new Map([
        ["upper", 10],
        ["lower", 2],
      ]),
    );
    const beyondReachSolution = solveRuntimeIKController(
      { ...foldedController, targetX: 13, targetY: 0 },
      new Map([
        ["upper", [1, 0, 0, 1, 0, 0]],
        ["lower", [1, 0, 0, 1, 10, 0]],
      ]),
      new Map([
        ["upper", 10],
        ["lower", 2],
      ]),
    );
    expect(lowerBoundarySolution.reached).toBe(true);
    expect(beyondReachSolution.reached).toBe(false);

    const ccdController = {
      ...runtimeProject.ikControllers[0]!,
      solverType: "ccd" as const,
      influence: 0.5,
      maxIterations: 4,
      parameterMappings: [
        {
          boneId: "upper",
          parameterId: "ik-param",
          angleMin: -Math.PI,
          angleMax: Math.PI,
          paramMin: -1,
          paramMax: 1,
        },
      ],
    };
    const runtimeInputs = buildRuntimeCCDBoneInputs(
      ccdController,
      runtimeWorld,
      runtimeBoneLengths,
    );
    const coreInputs = buildCCDBoneInputs(ccdController, coreWorld, coreBoneLengths);
    expect(runtimeInputs).toEqual(coreInputs);
    expect(
      normalizeIKSolution(
        solveRuntimeCCDIK(runtimeInputs, ccdController.targetX, ccdController.targetY, 4),
      ),
    ).toEqual(
      normalizeIKSolution(
        solveCCDIK(coreInputs, ccdController.targetX, ccdController.targetY, 4),
      ),
    );

    const runtimeSolution = solveRuntimeIKController(
      ccdController,
      runtimeWorld,
      runtimeBoneLengths,
    );
    const coreSolution = solveIKController(ccdController, coreWorld, coreBoneLengths);
    expect(normalizeIKSolution(runtimeSolution)).toEqual(
      normalizeIKSolution(coreSolution),
    );
    expect(mapRuntimeIKToParameters(ccdController, runtimeSolution)).toEqual(
      mapIKToParameters(ccdController, coreSolution),
    );
  });

  it("matches core IK step results", () => {
    const runtimeProject = cloneProject(ikProject);
    const coreProject = cloneProject(ikProject);
    const runtimeAngles: Record<string, number> = {};
    const coreAngles: Record<string, number> = {};
    const runtimeBoneLengths = buildRuntimeStaticCaches(
      flattenRuntimeLayers(runtimeProject.layers),
    ).boneLengths;
    const coreBoneLengths = buildStaticCaches(flattenLayers(coreProject.layers))
      .boneLengths;

    runRuntimeIKStep({
      project: runtimeProject,
      boneLengths: runtimeBoneLengths,
      boneAngles: runtimeAngles,
    });
    runIKStep({
      project: coreProject,
      boneLengths: coreBoneLengths,
      boneAngles: coreAngles,
    });

    expectCloseRecord(runtimeAngles, coreAngles);

    const runtimePartialProject = cloneProject(ikProject);
    const corePartialProject = cloneProject(ikProject);
    runtimePartialProject.ikControllers[0]!.influence = 0.5;
    corePartialProject.ikControllers[0]!.influence = 0.5;
    const runtimePartialAngles: Record<string, number> = {};
    const corePartialAngles: Record<string, number> = {};
    runRuntimeIKStep({
      project: runtimePartialProject,
      boneLengths: buildRuntimeStaticCaches(
        flattenRuntimeLayers(runtimePartialProject.layers),
      ).boneLengths,
      boneAngles: runtimePartialAngles,
    });
    runIKStep({
      project: corePartialProject,
      boneLengths: buildStaticCaches(flattenLayers(corePartialProject.layers))
        .boneLengths,
      boneAngles: corePartialAngles,
    });

    expectCloseRecord(runtimePartialAngles, corePartialAngles);
    for (const [boneId, angle] of Object.entries(runtimePartialAngles)) {
      expect(angle).toBeCloseTo((runtimeAngles[boneId] ?? 0) * 0.5, 12);
    }

    const runtimeCcdProject = cloneProject(ikProject);
    const coreCcdProject = cloneProject(ikProject);
    const runtimeFullCcdProject = cloneProject(ikProject);
    runtimeCcdProject.ikControllers[0]!.solverType = "ccd";
    runtimeCcdProject.ikControllers[0]!.influence = 0.5;
    coreCcdProject.ikControllers[0]!.solverType = "ccd";
    coreCcdProject.ikControllers[0]!.influence = 0.5;
    runtimeFullCcdProject.ikControllers[0]!.solverType = "ccd";
    runtimeFullCcdProject.ikControllers[0]!.influence = 1;
    const runtimeFullCcdAngles: Record<string, number> = {};
    const runtimeCcdAngles: Record<string, number> = {};
    const coreCcdAngles: Record<string, number> = {};
    runRuntimeIKStep({
      project: runtimeFullCcdProject,
      boneLengths: buildRuntimeStaticCaches(
        flattenRuntimeLayers(runtimeFullCcdProject.layers),
      ).boneLengths,
      boneAngles: runtimeFullCcdAngles,
    });
    runRuntimeIKStep({
      project: runtimeCcdProject,
      boneLengths: buildRuntimeStaticCaches(
        flattenRuntimeLayers(runtimeCcdProject.layers),
      ).boneLengths,
      boneAngles: runtimeCcdAngles,
    });
    runIKStep({
      project: coreCcdProject,
      boneLengths: buildStaticCaches(flattenLayers(coreCcdProject.layers))
        .boneLengths,
      boneAngles: coreCcdAngles,
    });

    expectCloseRecord(runtimeCcdAngles, coreCcdAngles);
    for (const [boneId, angle] of Object.entries(runtimeCcdAngles)) {
      expect(angle).toBeCloseTo((runtimeFullCcdAngles[boneId] ?? 0) * 0.5, 12);
    }
  });

  it("converts solved IK world angles to local bone overrides", () => {
    const runtimeProject = cloneProject(ikProject);
    const coreProject = cloneProject(ikProject);
    const runtimeAngles: Record<string, number> = {};
    const coreAngles: Record<string, number> = {};

    runRuntimeIKStep({
      project: runtimeProject,
      boneLengths: buildRuntimeStaticCaches(
        flattenRuntimeLayers(runtimeProject.layers),
      ).boneLengths,
      boneAngles: runtimeAngles,
    });
    runIKStep({
      project: coreProject,
      boneLengths: buildStaticCaches(flattenLayers(coreProject.layers)).boneLengths,
      boneAngles: coreAngles,
    });

    expectCloseRecord(runtimeAngles, coreAngles);
    expect(runtimeAngles.upper).toBeCloseTo(Math.PI / 2, 12);
    expect(runtimeAngles.lower).toBeCloseTo(-Math.PI / 2, 12);

    const partialProject = cloneProject(ikProject);
    const partialUpper = partialProject.layers[0]!;
    if (partialUpper.kind !== "bone") {
      throw new Error("test fixture expected upper bone");
    }
    partialUpper.bone.angle = Math.PI / 6;
    partialProject.ikControllers[0]!.influence = 0.5;
    const partialAngles: Record<string, number> = {};
    runRuntimeIKStep({
      project: partialProject,
      boneLengths: buildRuntimeStaticCaches(
        flattenRuntimeLayers(partialProject.layers),
      ).boneLengths,
      boneAngles: partialAngles,
    });

    expect(partialAngles.upper).toBeCloseTo(Math.PI / 3, 12);
    expect(partialAngles.lower).toBeCloseTo(-Math.PI / 4, 12);

    const constrainedRuntimeProject = cloneProject(ikProject);
    const constrainedCoreProject = cloneProject(ikProject);
    constrainedRuntimeProject.ikControllers[0]!.boneChain[1]!.minAngle = -0.1;
    constrainedRuntimeProject.ikControllers[0]!.boneChain[1]!.maxAngle = 0.1;
    constrainedCoreProject.ikControllers[0]!.boneChain[1]!.minAngle = -0.1;
    constrainedCoreProject.ikControllers[0]!.boneChain[1]!.maxAngle = 0.1;
    const constrainedRuntimeAngles: Record<string, number> = {};
    const constrainedCoreAngles: Record<string, number> = {};
    runRuntimeIKStep({
      project: constrainedRuntimeProject,
      boneLengths: buildRuntimeStaticCaches(
        flattenRuntimeLayers(constrainedRuntimeProject.layers),
      ).boneLengths,
      boneAngles: constrainedRuntimeAngles,
    });
    runIKStep({
      project: constrainedCoreProject,
      boneLengths: buildStaticCaches(flattenLayers(constrainedCoreProject.layers))
        .boneLengths,
      boneAngles: constrainedCoreAngles,
    });

    expectCloseRecord(constrainedRuntimeAngles, constrainedCoreAngles);
    expect(constrainedRuntimeAngles.lower).toBeCloseTo(-0.1, 12);
  });

  it("solves IK from the current overridden parent bone pose", () => {
    const runtimeProject = cloneProject(ikProject);
    const coreProject = cloneProject(ikProject);
    const runtimeController = runtimeProject.ikControllers[0]!;
    const coreController = coreProject.ikControllers[0]!;
    runtimeController.solverType = "ccd";
    coreController.solverType = "ccd";
    runtimeController.boneChain = [runtimeController.boneChain[1]!];
    coreController.boneChain = [coreController.boneChain[1]!];
    runtimeController.targetX = 0;
    coreController.targetX = 0;
    runtimeController.targetY = 20;
    coreController.targetY = 20;

    const runtimeAngles: Record<string, number> = { upper: Math.PI / 2 };
    const coreAngles: Record<string, number> = { upper: Math.PI / 2 };

    runRuntimeIKStep({
      project: runtimeProject,
      boneLengths: buildRuntimeStaticCaches(
        flattenRuntimeLayers(runtimeProject.layers),
      ).boneLengths,
      boneAngles: runtimeAngles,
    });
    runIKStep({
      project: coreProject,
      boneLengths: buildStaticCaches(flattenLayers(coreProject.layers)).boneLengths,
      boneAngles: coreAngles,
    });

    expectCloseRecord(runtimeAngles, coreAngles);
    expect(runtimeAngles.upper).toBeCloseTo(Math.PI / 2, 12);
    expect(runtimeAngles.lower).toBeCloseTo(0, 12);
  });

  it("matches core mesh state computation", () => {
    const runtimeProject = cloneProject(meshProject);
    const coreProject = cloneProject(meshProject);
    const runtimeLayers = flattenRuntimeLayers(runtimeProject.layers);
    const coreLayers = flattenLayers(coreProject.layers);
    const runtimeCaches = buildRuntimeStaticCaches(runtimeLayers);
    const coreCaches = buildStaticCaches(coreLayers);
    const runtimeMeshStates = new Map();
    const coreMeshStates = new Map();
    const runtimeDrawOrderScratch: { id: string; zIndex: number }[] = [];
    const coreDrawOrderScratch: { id: string; zIndex: number }[] = [];
    const runtimeDrawOrderCache: string[] = [];
    const coreDrawOrderCache: string[] = [];

    computeRuntimeMeshStates({
      project: runtimeProject,
      allLayers: runtimeLayers,
      meshStaticCache: runtimeCaches.meshStaticCache,
      meshScratchVerts: runtimeCaches.meshScratchVerts,
      meshStates: runtimeMeshStates,
      drawOrderScratch: runtimeDrawOrderScratch,
      drawOrderCache: runtimeDrawOrderCache,
      worldTransforms: computeRuntimeBoneWorldTransforms(runtimeProject.layers),
    });
    computeAllMeshStates({
      project: coreProject,
      allLayers: coreLayers,
      parameterValues: {},
      meshStaticCache: coreCaches.meshStaticCache,
      meshScratchVerts: coreCaches.meshScratchVerts,
      meshStates: coreMeshStates,
      drawOrderScratch: coreDrawOrderScratch,
      drawOrderCache: coreDrawOrderCache,
    });

    expect(runtimeDrawOrderCache).toEqual(coreDrawOrderCache);
    expect(normalizeMeshStates(runtimeMeshStates)).toEqual(
      normalizeMeshStates(coreMeshStates),
    );

    runtimeProject.layers[0]!.opacity = 0.25;
    coreProject.layers[0]!.opacity = 0.25;
    runtimeMeshStates.set("stale", createPlaceholderMeshState("stale"));
    coreMeshStates.set("stale", createPlaceholderMeshState("stale"));

    computeRuntimeMeshStates({
      project: runtimeProject,
      allLayers: runtimeLayers,
      meshStaticCache: runtimeCaches.meshStaticCache,
      meshScratchVerts: runtimeCaches.meshScratchVerts,
      meshStates: runtimeMeshStates,
      drawOrderScratch: runtimeDrawOrderScratch,
      drawOrderCache: runtimeDrawOrderCache,
      worldTransforms: computeRuntimeBoneWorldTransforms(runtimeProject.layers),
    });
    computeAllMeshStates({
      project: coreProject,
      allLayers: coreLayers,
      parameterValues: {},
      meshStaticCache: coreCaches.meshStaticCache,
      meshScratchVerts: coreCaches.meshScratchVerts,
      meshStates: coreMeshStates,
      drawOrderScratch: coreDrawOrderScratch,
      drawOrderCache: coreDrawOrderCache,
    });

    expect(runtimeMeshStates.has("stale")).toBe(false);
    expect(runtimeDrawOrderCache).toEqual(coreDrawOrderCache);
    expect(normalizeMeshStates(runtimeMeshStates)).toEqual(
      normalizeMeshStates(coreMeshStates),
    );
  });

  it.each(bindingCases.map((testCase) => [testCase.name, testCase] as const))(
    "matches core parameter binding interpolation for %s",
    (_name, testCase) => {
      expect(
        evaluateRuntimeBindingsAdditive(
          testCase.bindings,
          testCase.values,
          testCase.defaultValue,
        ),
      ).toBe(
        evaluateBindingsAdditive(
          [...testCase.bindings],
          testCase.values,
          testCase.defaultValue,
        ),
      );
    },
  );

  it("matches core physics force accumulation", () => {
    const currentValues = { "input-x": 1, "input-y": -0.25 };
    const previousValues = { "input-x": 0.2, "input-y": 0.5 };

    expect(
      computeRuntimeInputForces(physicsGroup.inputs, currentValues, previousValues),
    ).toEqual(computeInputForces(physicsGroup.inputs, currentValues, previousValues));
  });

  it("matches core physics state initialization", () => {
    expect(createRuntimePhysicsState(physicsGroup)).toEqual(
      createPhysicsRuntimeState(physicsGroup),
    );
  });

  it("matches core single physics substep output", () => {
    const runtimeGroup = clonePhysicsGroup();
    const coreGroup = clonePhysicsGroup();
    const runtimeStates = createRuntimePhysicsState(runtimeGroup);
    const coreStates = createPhysicsRuntimeState(coreGroup);
    const forces = { x: 1.6, y: -0.2 };

    stepRuntimePhysicsGroup(runtimeGroup, runtimeStates, forces, 1 / 120);
    stepPhysicsGroup(coreGroup, coreStates, forces, 1 / 120);

    expect(runtimeStates).toEqual(coreStates);
  });

  it("matches core accumulated physics frame output", () => {
    const runtimeGroup = clonePhysicsGroup();
    const coreGroup = clonePhysicsGroup();
    const runtimeStates = createRuntimePhysicsState(runtimeGroup);
    const coreStates = createPhysicsRuntimeState(coreGroup);
    const forces = { x: -0.3, y: 0.7 };

    const runtimeAccumulator = runRuntimePhysicsFrame(
      runtimeGroup,
      runtimeStates,
      forces,
      1 / 30,
      0.002,
    );
    const coreAccumulator = runPhysicsFrame(
      coreGroup,
      coreStates,
      forces,
      1 / 30,
      0.002,
    );

    expect(runtimeAccumulator).toBe(coreAccumulator);
    expect(runtimeStates).toEqual(coreStates);
  });

  it("matches core physics output mapping", () => {
    const states = [
      { angle: 0.2, angularVelocity: 0.1 },
      { angle: -0.4, angularVelocity: 0.05 },
    ];
    const runtimeOutput = computeRuntimeOutputValues(
      physicsGroup.outputs,
      states,
      parameterDefinitions,
    );
    const coreOutput = computeOutputValues(
      physicsGroup.outputs,
      states,
      parameterDefinitions,
    );

    expectCloseRecord(runtimeOutput.parameters, coreOutput.parameters);
    expectCloseRecord(runtimeOutput.bones, coreOutput.bones);
  });
});
