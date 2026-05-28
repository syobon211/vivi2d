import { bench, describe } from "vitest";
import { MESH_DEFAULTS } from "../constants";
import { generateGridMesh } from "../mesh-utils";
import { ViviModel } from "../model";
import type {
  ViviMeshNode,
  ParameterDefinition,
  ProjectData,
  ViviFileData,
} from "../types";

function createViviMesh(id: string, divisions: number): ViviMeshNode {
  const width = 100;
  const height = 100;
  return {
    id,
    name: `mesh-${id}`,
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
    mesh: generateGridMesh(width, height, divisions, divisions),
  };
}

function createParameter(id: string): ParameterDefinition {
  return { id, name: id, minValue: -1, maxValue: 1, defaultValue: 0 };
}

function createProject(
  meshCount: number,
  paramCount: number,
  divisions: number,
): ProjectData {
  const layers: ViviMeshNode[] = [];
  for (let i = 0; i < meshCount; i++) {
    layers.push(createViviMesh(`mesh-${i}`, divisions));
  }
  const parameters: ParameterDefinition[] = [];
  for (let i = 0; i < paramCount; i++) {
    parameters.push(createParameter(`param-${i}`));
  }
  return {
    name: "bench",
    width: 800,
    height: 600,
    layers,
    parameters,
    clips: [],
    scenes: [],
    physicsGroups: [],
    lipsyncConfig: {
      enabled: false,
      targetParameterId: null,
      source: "microphone",
      threshold: 0.02,
      smoothing: 0.7,
      gain: 2.0,
    },
    skins: {},
  };
}

function buildModel(meshCount: number, paramCount: number, divisions: number): ViviModel {
  const fileData: ViviFileData = {
    version: 4,
    project: createProject(meshCount, paramCount, divisions),
    atlases: [],
  };
  return ViviModel.fromFileData(fileData);
}

const tiny = buildModel(1, 0, MESH_DEFAULTS.DIVISIONS_X);
const small = buildModel(5, 5, MESH_DEFAULTS.DIVISIONS_X);
const medium = buildModel(20, 10, MESH_DEFAULTS.DIVISIONS_X * 2);

describe("model.update", () => {
  bench("tiny (1 mesh, 0 params, 8x8 grid)", () => {
    tiny.update(0.016);
  });

  bench("small (5 meshes, 5 params, 8x8 grid)", () => {
    small.update(0.016);
  });

  bench("medium (20 meshes, 10 params, 16x16 grid)", () => {
    medium.update(0.016);
  });
});
