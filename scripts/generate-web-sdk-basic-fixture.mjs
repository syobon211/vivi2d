import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const fixturePath = path.join(
  root,
  "examples",
  "web-sdk-basic",
  "public",
  "generated-avatar.vivi",
);
const checksumPath = path.join(
  root,
  "examples",
  "web-sdk-basic",
  "generated-avatar.vivi.sha256",
);
const maxFixtureBytes = 20 * 1024;
const checkOnly = process.argv.includes("--check");

const fixtureText = `${stableStringify(createFixture())}\n`;
const fixtureBytes = Buffer.byteLength(fixtureText, "utf8");
const checksum = `${sha256(fixtureText)}  public/generated-avatar.vivi\n`;

if (fixtureBytes > maxFixtureBytes) {
  fail(
    `generated fixture is ${fixtureBytes} bytes, above the ${maxFixtureBytes} byte limit`,
  );
}

if (checkOnly) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-web-sdk-fixture-"));
  try {
    const tempFixturePath = path.join(tempDir, "generated-avatar.vivi");
    const tempChecksumPath = path.join(tempDir, "generated-avatar.vivi.sha256");
    fs.writeFileSync(tempFixturePath, fixtureText);
    fs.writeFileSync(tempChecksumPath, checksum);
    assertFileMatches(fixturePath, fixtureText);
    assertFileMatches(checksumPath, checksum);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
  console.log("[web-sdk-fixture] checked");
} else {
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, fixtureText);
  fs.writeFileSync(checksumPath, checksum);
  console.log(`[web-sdk-fixture] wrote ${path.relative(root, fixturePath)}`);
}

function createFixture() {
  return {
    atlases: [
      {
        entries: [
          {
            height: 50,
            layerId: "sample-mesh-main",
            width: 50,
            x: 0,
            y: 0,
          },
        ],
        height: 50,
        image:
          "iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAIAAACRXR/mAAAAQ0lEQVR4nO3OMQEAAAjDMKhD/04BGSCQO6e7a4f/DLm2JEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJH3WAMZyA/F8C4Z/AAAAAElFTkSuQmCC",
        width: 50,
      },
    ],
    profile: "publicProfileV1",
    project: {
      clips: [],
      colliders: [
        {
          enabled: true,
          id: "sample-collider-preview",
          name: "Sample Collider",
          shape: { height: 50, type: "rectangle", width: 50, x: 39, y: 39 },
          tag: "sample",
        },
      ],
      expressionPresets: [
        {
          hotkey: 1,
          id: "sample-preset-a",
          name: "Sample Preset A",
          values: {
            "sample.input.alpha": 0.35,
            "sample.input.beta": -0.2,
          },
        },
      ],
      height: 128,
      layers: [
        {
          blendMode: "normal",
          children: [],
          expanded: true,
          height: 50,
          id: "sample-mesh-main",
          kind: "viviMesh",
          mesh: {
            divisionsX: 1,
            divisionsY: 1,
            indices: [0, 1, 2, 0, 2, 3],
            uvs: [0, 0, 1, 0, 1, 1, 0, 1],
            vertices: [0, 0, 50, 0, 50, 50, 0, 50],
          },
          name: "Sample Shape",
          opacity: 1,
          visible: true,
          width: 50,
          x: 39,
          y: 39,
        },
      ],
      lipsyncConfig: {
        enabled: false,
        gain: 2,
        smoothing: 0.7,
        source: "microphone",
        targetParameterId: null,
        threshold: 0.02,
      },
      name: "Vivi2D Web SDK Sample",
      parameters: [
        {
          defaultValue: 0,
          id: "sample.input.alpha",
          maxValue: 1,
          minValue: -1,
          name: "Sample Input Alpha",
        },
        {
          defaultValue: 0,
          id: "sample.input.beta",
          maxValue: 1,
          minValue: -1,
          name: "Sample Input Beta",
        },
        {
          defaultValue: 0.25,
          id: "sample.input.gamma",
          maxValue: 1,
          minValue: 0,
          name: "Sample Input Gamma",
        },
      ],
      physicsGroups: [],
      scenes: [],
      skins: {},
      stateMachines: [],
      width: 128,
    },
    version: 10,
  };
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right, "en", { sensitivity: "variant" }),
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function assertFileMatches(filePath, expected) {
  if (!fs.existsSync(filePath)) {
    fail(`${path.relative(root, filePath)} is missing`);
  }
  const actual = fs.readFileSync(filePath, "utf8");
  if (actual !== expected) {
    fail(`${path.relative(root, filePath)} is out of date; run npm run build:fixtures`);
  }
}

function fail(message) {
  console.error(`[web-sdk-fixture] ${message}`);
  process.exit(1);
}
