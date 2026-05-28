import fs from "node:fs";
import path from "node:path";

function createTestTexture() {
  return "iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAIAAACRXR/mAAAAQ0lEQVR4nO3OMQEAAAjDMKhD/04BGSCQO6e7a4f/DLm2JEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJH3WAMZyA/F8C4Z/AAAAAElFTkSuQmCC";
}

const TEX_SIZE = 50;
const LAYER_COUNT = 50;
const PARAM_COUNT = 20;
const MODEL_SIZE = 800;

const layers = [];
for (let i = 0; i < LAYER_COUNT; i++) {
  const x = (i % 10) * 80;
  const y = Math.floor(i / 10) * 80;
  layers.push({
    kind: "viviMesh",
    id: `mesh-${i}`,
    name: `Mesh ${i}`,
    visible: true,
    opacity: 1,
    x,
    y,
    width: TEX_SIZE,
    height: TEX_SIZE,
    blendMode: "normal",
    expanded: true,
    children: [],
    mesh: {
      vertices: [0, 0, TEX_SIZE, 0, TEX_SIZE, TEX_SIZE, 0, TEX_SIZE],
      uvs: [0, 0, 1, 0, 1, 1, 0, 1],
      indices: [0, 1, 2, 0, 2, 3],
      divisionsX: 1,
      divisionsY: 1,
    },
  });
}

const parameters = [];
for (let i = 0; i < PARAM_COUNT; i++) {
  parameters.push({
    id: `param-${i}`,
    name: `Parameter ${i}`,
    minValue: -30,
    maxValue: 30,
    defaultValue: 0,
  });
}

const entries = layers.map((l) => ({
  layerId: l.id,
  x: 0,
  y: 0,
  width: TEX_SIZE,
  height: TEX_SIZE,
}));

const viviData = {
  version: 5,
  project: {
    name: "Large Test Model",
    width: MODEL_SIZE,
    height: MODEL_SIZE,
    layers,
    parameters,
    clips: [],
    scenes: [],
    physicsGroups: [],
    stateMachines: [],
    colliders: [
      {
        id: "collider-center",
        name: "Center",
        shape: { type: "rectangle", x: 300, y: 300, width: 200, height: 200 },
        tag: "center",
        enabled: true,
      },
    ],
    lipsyncConfig: {
      enabled: false,
      targetParameterId: null,
      source: "microphone",
      threshold: 0.02,
      smoothing: 0.7,
      gain: 2.0,
    },
    skins: {},
    expressionPresets: [],
  },
  atlases: [
    {
      image: createTestTexture(),
      width: TEX_SIZE,
      height: TEX_SIZE,
      entries,
    },
  ],
};

const outPath = path.join(import.meta.dirname, "test-large.vivi");
fs.writeFileSync(outPath, JSON.stringify(viviData), "utf-8");
const sizeKB = Math.round(fs.statSync(outPath).size / 1024);
console.log(`Generated: ${outPath} (${sizeKB}KB, ${LAYER_COUNT} layers, ${PARAM_COUNT} params)`);
