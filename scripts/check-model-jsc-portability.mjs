import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";

const root = path.resolve(import.meta.dirname, "..");
const temporaryRoot = path.resolve(os.tmpdir());
const temporaryDirectory = fs.mkdtempSync(
  path.join(temporaryRoot, "vivi2d-model-jsc-portability-"),
);

const entries = [
  {
    filename: "project-format-v11.mjs",
    label: "Project Format v11",
    source: "packages/model/src/internal/project-format-v11.ts",
  },
  {
    filename: "evaluation-payload-v1.mjs",
    label: "Evaluation Payload v1",
    source: "packages/model/src/internal/evaluation-payload-v1.ts",
  },
];
const BARE_EXTERNAL_IMPORT_PATTERN =
  /\b(?:from\s*|import\s*(?:\(\s*)?)["'](?![./])[^"']+["']/u;

try {
  assertSafeTemporaryDirectory(temporaryDirectory);
  assertPortableRuleSmoke();
  for (const entry of entries) await bundleEntry(entry);

  const projectSource = fs.readFileSync(
    path.join(temporaryDirectory, entries[0].filename),
    "utf8",
  );
  const evaluationSource = fs.readFileSync(
    path.join(temporaryDirectory, entries[1].filename),
    "utf8",
  );
  assertPortableBundle(entries[0].label, projectSource);
  assertPortableBundle(entries[1].label, evaluationSource);
  if (evaluationSource.includes("project-format-v11.schema.json")) {
    throw new Error(
      "Evaluation Payload v1 bundle unexpectedly contains the Project Format v11 validator",
    );
  }

  const runnerPath = path.join(temporaryDirectory, "lockdown-smoke.mjs");
  fs.writeFileSync(runnerPath, createLockdownRunner(), "utf8");
  const result = spawnSync(
    process.execPath,
    ["--disallow-code-generation-from-strings", runnerPath],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production" },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      ["Model JSC lockdown smoke failed.", result.stdout.trim(), result.stderr.trim()]
        .filter(Boolean)
        .join("\n"),
    );
  }
  if (result.stdout.trim() !== "model-jsc-portability: ok") {
    throw new Error(`Unexpected lockdown smoke output: ${result.stdout.trim()}`);
  }

  console.log("[model-jsc-portability] prebundled internal seams passed lockdown smoke");
} finally {
  assertSafeTemporaryDirectory(temporaryDirectory);
  fs.rmSync(temporaryDirectory, { force: true, recursive: true });
}

async function bundleEntry(entry) {
  const buildResult = await build({
    root,
    configFile: false,
    logLevel: "silent",
    build: {
      emptyOutDir: false,
      lib: {
        entry: path.join(root, entry.source),
        fileName: () => entry.filename,
        formats: ["es"],
      },
      minify: false,
      outDir: temporaryDirectory,
      rollupOptions: {
        output: { codeSplitting: false },
      },
      sourcemap: false,
      target: "es2022",
    },
  });
  const outputs = Array.isArray(buildResult) ? buildResult : [buildResult];
  for (const output of outputs) {
    for (const artifact of output.output) {
      if (
        artifact.type === "chunk" &&
        (artifact.imports.length > 0 || artifact.dynamicImports.length > 0)
      ) {
        throw new Error(
          `${entry.label} bundle contains external imports: ${[
            ...artifact.imports,
            ...artifact.dynamicImports,
          ].join(", ")}`,
        );
      }
    }
  }
  const outputPath = path.join(temporaryDirectory, entry.filename);
  if (!fs.existsSync(outputPath)) {
    throw new Error(`${entry.label} bundle was not emitted at ${outputPath}`);
  }
}

function assertPortableBundle(label, source) {
  const forbidden = [
    ["CommonJS require", /\brequire\s*\(/u],
    ["eval", /\beval\s*\(/u],
    ["Function constructor", /\b(?:new\s+)?Function\s*\(/u],
    ["bare external import", BARE_EXTERNAL_IMPORT_PATTERN],
    ["Node built-in import", /\b(?:from|import\s*\()\s*["']node:/u],
    ["Buffer global", /\bBuffer\b/u],
    ["process global", /\bprocess\b/u],
    ["TextEncoder global", /\bTextEncoder\b/u],
    ["TextDecoder global", /\bTextDecoder\b/u],
    ["atob global", /\batob\b/u],
    ["btoa global", /\bbtoa\b/u],
    ["structuredClone global", /\bstructuredClone\b/u],
    ["ambient WebCrypto", /\bglobalThis\s*\.\s*crypto\b/u],
  ];
  for (const [description, pattern] of forbidden) {
    if (pattern.test(source)) {
      throw new Error(`${label} bundle contains forbidden ${description}`);
    }
  }
}

function assertPortableRuleSmoke() {
  const cases = [
    ['import "package-name";', true],
    ['import("package-name");', true],
    ['export { value } from "package-name";', true],
    ['import "./local-module.mjs";', false],
    ['import("../local-module.mjs");', false],
  ];
  for (const [source, expected] of cases) {
    if (BARE_EXTERNAL_IMPORT_PATTERN.test(source) !== expected) {
      throw new Error(`Bare external import detector smoke failed for ${source}`);
    }
  }
}

function createLockdownRunner() {
  const projectUrl = pathToFileURL(
    path.join(temporaryDirectory, entries[0].filename),
  ).href;
  const evaluationUrl = pathToFileURL(
    path.join(temporaryDirectory, entries[1].filename),
  ).href;
  return `const hostProcess = globalThis.process;
for (const name of [
  "Buffer",
  "TextDecoder",
  "TextEncoder",
  "atob",
  "btoa",
  "crypto",
  "document",
  "process",
  "structuredClone",
  "window",
]) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: undefined,
    writable: true,
  });
}

try {
  const project = await import(${JSON.stringify(projectUrl)});
  const evaluation = await import(${JSON.stringify(evaluationUrl)});
  const parsed = await project.parseProjectFormatV11Json(
    JSON.stringify({
      version: 11,
      assetMode: "embedded",
      project: {
        name: "JSC portability smoke",
        width: 1,
        height: 1,
        layers: [],
        parameters: [],
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
        parameterBindings: [],
        sceneBlends: [],
        ikControllers: [],
        offscreenTargets: [],
        expressionPresets: [],
        colliders: [],
        stateMachines: [],
      },
      atlases: [],
    }),
    {
      registry: new Map(),
      supportedCapabilities: new Map(),
      sha256: () => "0".repeat(64),
    },
  );
  if (parsed.normalized.version !== 11 || parsed.compatibility !== "full") {
    throw new Error("Project Format v11 codec smoke returned an unexpected result");
  }

  const hash = "a".repeat(64);
  const built = evaluation.buildEvaluationPayload({
    compatibility: "full",
    project: {
      name: "JSC portability smoke",
      width: 1,
      height: 1,
      layers: [
        {
          id: "mesh-body",
          name: "mesh-body",
          kind: "viviMesh",
          visible: true,
          opacity: 1,
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          blendMode: "normal",
          expanded: true,
          children: [],
          drawOrder: 0,
          mesh: {
            vertices: [0, 0, 1, 0, 0, 1],
            uvs: [0, 0, 1, 0, 0, 1],
            indices: [0, 1, 2],
            divisionsX: 1,
            divisionsY: 1,
          },
        },
      ],
      parameters: [],
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
    },
    atlases: [
      {
        id: "atlas-smoke",
        image: {
          objectAddress: hash,
          storageKind: "blob",
          contentSha256: hash,
          mediaType: "image/png",
          sizeBytes: 1,
        },
        width: 1,
        height: 1,
        entries: [
          { layerId: "mesh-body", x: 0, y: 0, width: 1, height: 1 },
        ],
      },
    ],
  });
  if (
    built.payload.schema !== "vivi2d.evaluationPayload.v1" ||
    built.texturePlan.schema !== "vivi2d.evaluationTexturePlan.v1"
  ) {
    throw new Error("Evaluation Payload v1 builder smoke returned an unexpected result");
  }
  hostProcess.stdout.write("model-jsc-portability: ok\\n");
} catch (error) {
  hostProcess.stderr.write(
    error instanceof Error ? error.stack ?? error.message : String(error),
  );
  hostProcess.stderr.write("\\n");
  hostProcess.exitCode = 1;
}
`;
}

function assertSafeTemporaryDirectory(candidate) {
  const resolved = path.resolve(candidate);
  const relative = path.relative(temporaryRoot, resolved);
  if (
    path.dirname(resolved) !== temporaryRoot ||
    !path.basename(resolved).startsWith("vivi2d-model-jsc-portability-") ||
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Refusing to remove unsafe temporary path: ${resolved}`);
  }
}
