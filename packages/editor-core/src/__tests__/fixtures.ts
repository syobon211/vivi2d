import { LIPSYNC_DEFAULTS } from "@vivi2d/core/constants";
import type { LipSyncConfig, ProjectData, ViviMeshNode } from "@vivi2d/core/types";

export function createViviMesh(
  overrides: Partial<ViviMeshNode> = {},
): ViviMeshNode {
  const width = overrides.width ?? 100;
  const height = overrides.height ?? 100;
  return {
    id: "mesh",
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
    mesh: { vertices: [], uvs: [], indices: [], divisionsX: 0, divisionsY: 0 },
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
    expressionPresets: [],
  };
}

export function createProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    ...createEmptyProject(),
    name: "Test project",
    ...overrides,
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
