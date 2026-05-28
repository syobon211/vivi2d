import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveRepoPath } from "./lib/repo.mjs";

const CHECK_ONLY = process.argv.includes("--check");
const TASKS_VERSION = "0.10.35";
const PUBLIC_ROOT = "packages/viewer/public";
const VENDOR_ROOT = `${PUBLIC_ROOT}/vendor/mediapipe/tasks-vision-${TASKS_VERSION}`;
const LOCK_PATH = "packages/viewer/mediapipe-assets.lock.json";

const assets = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_module_internal.js",
  "vision_wasm_module_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
].map((name) => ({
  id: `wasm/${name}`,
  path: `${VENDOR_ROOT}/wasm/${name}`,
  source: `node_modules/@mediapipe/tasks-vision/wasm/${name}`,
  sourceType: "npm-package-file",
}));

assets.push(
  {
    id: "models/face_landmarker.task",
    path: `${VENDOR_ROOT}/models/face_landmarker.task`,
    source:
      "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    sourceType: "https-download",
  },
  {
    id: "models/hand_landmarker.task",
    path: `${VENDOR_ROOT}/models/hand_landmarker.task`,
    source:
      "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
    sourceType: "https-download",
  },
  {
    id: "models/pose_landmarker_lite.task",
    path: `${VENDOR_ROOT}/models/pose_landmarker_lite.task`,
    source:
      "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    sourceType: "https-download",
  },
);

const failures = [];

if (CHECK_ONLY) {
  checkAssets();
} else {
  await vendorAssets();
}

if (failures.length > 0) {
  console.error("[viewer-mediapipe-assets] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (CHECK_ONLY) {
  console.log(`[viewer-mediapipe-assets] passed (${assets.length} assets)`);
} else {
  console.log(`[viewer-mediapipe-assets] wrote ${LOCK_PATH}`);
}

async function vendorAssets() {
  const entries = [];
  for (const asset of assets) {
    const absolutePath = resolveRepoPath(asset.path);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

    if (asset.sourceType === "npm-package-file") {
      fs.copyFileSync(resolveRepoPath(asset.source), absolutePath);
    } else {
      await downloadFile(asset.source, absolutePath);
    }

    entries.push(describeAsset(asset));
  }

  const lock = {
    schemaVersion: 1,
    generatedBy: "npm run vendor:viewer-mediapipe-assets",
    tasksVisionVersion: TASKS_VERSION,
    publicRoot: PUBLIC_ROOT,
    vendorRoot: VENDOR_ROOT,
    assets: entries,
  };
  fs.writeFileSync(resolveRepoPath(LOCK_PATH), `${JSON.stringify(lock, null, 2)}\n`);
}

function checkAssets() {
  if (!fs.existsSync(resolveRepoPath(LOCK_PATH))) {
    failures.push(`${LOCK_PATH}: missing MediaPipe asset lock.`);
    return;
  }
  const lock = JSON.parse(fs.readFileSync(resolveRepoPath(LOCK_PATH), "utf8"));
  if (lock.schemaVersion !== 1) {
    failures.push(`${LOCK_PATH}: schemaVersion must be 1.`);
  }
  if (lock.tasksVisionVersion !== TASKS_VERSION) {
    failures.push(
      `${LOCK_PATH}: tasksVisionVersion must be ${TASKS_VERSION}, found ${lock.tasksVisionVersion}.`,
    );
  }
  if (lock.vendorRoot !== VENDOR_ROOT) {
    failures.push(`${LOCK_PATH}: vendorRoot must be ${VENDOR_ROOT}.`);
  }

  const lockedByPath = new Map(
    Array.isArray(lock.assets) ? lock.assets.map((entry) => [entry.path, entry]) : [],
  );
  for (const asset of assets) {
    const locked = lockedByPath.get(asset.path);
    if (!locked) {
      failures.push(`${LOCK_PATH}: missing lock entry for ${asset.path}.`);
      continue;
    }
    if (locked.source !== asset.source) {
      failures.push(`${asset.path}: source drifted from lock.`);
    }
    if (locked.sourceType !== asset.sourceType) {
      failures.push(`${asset.path}: sourceType drifted from lock.`);
    }
    const current = describeAsset(asset);
    if (locked.sizeBytes !== current.sizeBytes) {
      failures.push(`${asset.path}: size drifted from lock.`);
    }
    if (locked.sha256 !== current.sha256) {
      failures.push(`${asset.path}: sha256 drifted from lock.`);
    }
  }
}

async function downloadFile(url, absolutePath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: download failed with HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  fs.writeFileSync(absolutePath, bytes);
}

function describeAsset(asset) {
  const absolutePath = resolveRepoPath(asset.path);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${asset.path}: missing vendored MediaPipe asset.`);
    return {
      id: asset.id,
      path: asset.path,
      source: asset.source,
      sourceType: asset.sourceType,
      sizeBytes: 0,
      sha256: "sha256:missing",
    };
  }
  const bytes = fs.readFileSync(absolutePath);
  return {
    id: asset.id,
    path: asset.path,
    source: asset.source,
    sourceType: asset.sourceType,
    sizeBytes: bytes.byteLength,
    sha256: `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`,
  };
}
