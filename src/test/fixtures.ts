import { LIPSYNC_DEFAULTS, MESH_DEFAULTS } from "@vivi2d/core/constants";
import { generateGridMesh } from "@vivi2d/core/mesh-utils";
import type {
  AnimationClip,
  ArtPathControlPoint,
  ArtPathNode,
  BoneNode,
  ExpressionPreset,
  GroupNode,
  IKController,
  LayerNode,
  LipSyncConfig,
  PhysicsGroup,
  ProjectData,
  SkinData,
  ViviMeshNode,
} from "@vivi2d/core/types";

export function createViviMesh(overrides: Partial<ViviMeshNode> = {}): ViviMeshNode {
  const width = overrides.width ?? 100;
  const height = overrides.height ?? 100;
  return {
    id: crypto.randomUUID(),
    name: "Test mesh",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width,
    height,
    children: [],
    blendMode: "normal",
    expanded: true,
    kind: "viviMesh",
    mesh: generateGridMesh(
      width,
      height,
      MESH_DEFAULTS.DIVISIONS_X,
      MESH_DEFAULTS.DIVISIONS_Y,
    ),
    ...overrides,
  };
}

export function createGroup(overrides: Partial<GroupNode> = {}): GroupNode {
  return {
    id: crypto.randomUUID(),
    name: "Test group",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    children: [],
    blendMode: "normal",
    expanded: true,
    kind: "group",
    ...overrides,
  };
}

export function createLayerTree(): {
  root: LayerNode[];
  ids: {
    group: string;
    childA: string;
    childB: string;
    standalone: string;
    nested: string;
    nestedChild: string;
  };
} {
  const nestedChild = createViviMesh({ name: "Nested child" });
  const nested = createGroup({ name: "Nested group", children: [nestedChild] });
  const childA = createViviMesh({ name: "Child A", opacity: 0.8 });
  const childB = createViviMesh({ name: "Child B", visible: false });
  const group = createGroup({ name: "Root group", children: [childA, childB, nested] });
  const standalone = createViviMesh({
    name: "Standalone layer",
    x: 50,
    y: 75,
  });

  return {
    root: [group, standalone],
    ids: {
      group: group.id,
      childA: childA.id,
      childB: childB.id,
      standalone: standalone.id,
      nested: nested.id,
      nestedChild: nestedChild.id,
    },
  };
}

function defaultLipSyncConfig(): LipSyncConfig {
  return {
    enabled: false,
    targetParameterId: null,
    source: "microphone",
    threshold: LIPSYNC_DEFAULTS.THRESHOLD,
    smoothing: LIPSYNC_DEFAULTS.SMOOTHING,
    gain: LIPSYNC_DEFAULTS.GAIN,
  };
}

export function createProject(overrides: Partial<ProjectData> = {}): ProjectData {
  const { root } = createLayerTree();
  return {
    name: "Test project",
    width: 1920,
    height: 1080,
    layers: root,
    parameters: [],
    clips: [],
    scenes: [],
    physicsGroups: [],
    lipsyncConfig: defaultLipSyncConfig(),
    skins: {},
    colliders: [],
    stateMachines: [],
    ...overrides,
  };
}

export function createEmptyProject(): ProjectData {
  return {
    name: "Empty project",
    width: 800,
    height: 600,
    layers: [],
    parameters: [],
    clips: [],
    scenes: [],
    physicsGroups: [],
    lipsyncConfig: defaultLipSyncConfig(),
    skins: {},
    colliders: [],
    stateMachines: [],
  };
}

export function createAnimationClip(
  overrides: Partial<AnimationClip> = {},
): AnimationClip {
  return {
    id: crypto.randomUUID(),
    name: "Test clip",
    duration: 90,
    fps: 30,
    tracks: [],
    ...overrides,
  };
}

export function createPhysicsGroup(overrides: Partial<PhysicsGroup> = {}): PhysicsGroup {
  return {
    id: crypto.randomUUID(),
    name: "Test physics group",
    enabled: true,
    pendulums: [{ length: 1, mass: 1, damping: 0.05 }],
    inputs: [],
    outputs: [],
    gravityDirection: 0,
    gravityStrength: 9.8,
    wind: 0,
    ...overrides,
  };
}

export function createBoneNode(overrides: Partial<BoneNode> = {}): BoneNode {
  return {
    id: crypto.randomUUID(),
    name: "Test bone",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    children: [],
    blendMode: "normal",
    expanded: true,
    kind: "bone",
    bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    ...overrides,
  };
}

export function createViviMeshWithSkin(
  boneIds: string[],
  overrides: Partial<ViviMeshNode> = {},
): { mesh: ViviMeshNode; skin: SkinData } {
  const mesh = createViviMesh(overrides);
  const vertexCount = mesh.mesh.vertices.length / 2;
  const weights = Array.from({ length: vertexCount }, () =>
    boneIds.length > 0 ? [{ boneId: boneIds[0]!, weight: 1 }] : [],
  );
  const bindPoseInverse: Record<
    string,
    [number, number, number, number, number, number]
  > = {};
  for (const boneId of boneIds) {
    bindPoseInverse[boneId] = [1, 0, 0, 1, 0, 0];
  }
  return { mesh, skin: { weights, bindPoseInverse } };
}

export function createControlPoint(
  overrides: Partial<ArtPathControlPoint> = {},
): ArtPathControlPoint {
  return {
    x: 0,
    y: 0,
    handleInX: 0,
    handleInY: 0,
    handleOutX: 0,
    handleOutY: 0,
    width: 1,
    opacity: 1,
    ...overrides,
  };
}

export function createArtPathNode(overrides: Partial<ArtPathNode> = {}): ArtPathNode {
  return {
    id: crypto.randomUUID(),
    name: "Test art path",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    children: [],
    blendMode: "normal",
    expanded: true,
    kind: "artPath",
    controlPoints: [
      createControlPoint({ x: 0, y: 0 }),
      createControlPoint({ x: 100, y: 0 }),
    ],
    closed: false,
    style: { color: 0x000000, baseWidth: 5, lineCap: "round", lineJoin: "round" },
    ...overrides,
  };
}

export function createIKController(overrides: Partial<IKController> = {}): IKController {
  return {
    id: crypto.randomUUID(),
    name: "Test IK",
    solverType: "twoBone",
    boneChain: [],
    targetX: 0,
    targetY: 0,
    influence: 1,
    parameterMappings: [],
    ...overrides,
  };
}

export function createExpressionPreset(
  overrides: Partial<ExpressionPreset> = {},
): ExpressionPreset {
  return {
    id: crypto.randomUUID(),
    name: "Test expression",
    values: {},
    ...overrides,
  };
}
