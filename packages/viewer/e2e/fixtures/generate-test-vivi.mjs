import fs from "node:fs";
import path from "node:path";

function createTestTexture() {
  return "iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAIAAACRXR/mAAAAQ0lEQVR4nO3OMQEAAAjDMKhD/04BGSCQO6e7a4f/DLm2JEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJH3WAMZyA/F8C4Z/AAAAAElFTkSuQmCC";
}

const WIDTH = 50;
const HEIGHT = 50;

const viviData = {
  version: 5,
  project: {
    name: "Test Model",
    width: 200,
    height: 200,
    layers: [
      {
        kind: "viviMesh",
        id: "mesh-1",
        name: "Red Square",
        visible: true,
        opacity: 1,
        x: 50,
        y: 50,
        width: WIDTH,
        height: HEIGHT,
        blendMode: "normal",
        expanded: true,
        children: [],
        mesh: {
          vertices: [0, 0, WIDTH, 0, WIDTH, HEIGHT, 0, HEIGHT],
          uvs: [0, 0, 1, 0, 1, 1, 0, 1],
          indices: [0, 1, 2, 0, 2, 3],
          divisionsX: 1,
          divisionsY: 1,
        },
      },
    ],
    parameters: [
      {
        id: "param-x",
        name: "Angle X",
        minValue: -30,
        maxValue: 30,
        defaultValue: 0,
      },
      {
        id: "param-y",
        name: "Angle Y",
        minValue: -30,
        maxValue: 30,
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
      gain: 2.0,
    },
    skins: {},
    colliders: [
      {
        id: "collider-head",
        name: "Head",
        shape: { type: "rectangle", x: 50, y: 50, width: 50, height: 50 },
        tag: "head",
        enabled: true,
      },
      {
        id: "collider-body",
        name: "Body",
        shape: { type: "circle", x: 100, y: 150, radius: 40 },
        tag: "body",
        enabled: true,
      },
    ],
    expressionPresets: [
      {
        id: "preset-smile",
        name: "Smile",
        values: { "param-x": 15, "param-y": 10 },
        hotkey: 1,
      },
      {
        id: "preset-angry",
        name: "Angry",
        values: { "param-x": -10, "param-y": -5 },
        hotkey: 2,
      },
    ],
  },
  atlases: [
    {
      image: createTestTexture(),
      width: WIDTH,
      height: HEIGHT,
      entries: [
        {
          layerId: "mesh-1",
          x: 0,
          y: 0,
          width: WIDTH,
          height: HEIGHT,
        },
      ],
    },
  ],
};

const outPath = path.join(import.meta.dirname, "test.vivi");
fs.writeFileSync(outPath, JSON.stringify(viviData), "utf-8");
console.log(`Generated: ${outPath} (${Math.round(fs.statSync(outPath).size / 1024)}KB)`);
