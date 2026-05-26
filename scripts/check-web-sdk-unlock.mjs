import { spawnSync } from "node:child_process";
import path from "node:path";
import { gitLsFilesIncludingUntracked, readJson, readText } from "./lib/repo.mjs";

const failures = [];
const runSupportingGates = !process.argv.includes("--self-only");

function fail(message) {
  failures.push(message);
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

function checkPackageSurface() {
  const pkg = readJson("packages/web/package.json");
  // Keep this package-surface contract aligned with check-package-boundaries.mjs.
  const expectedExports = {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/vivi2d.es.js",
    },
    "./auto-register": {
      types: "./dist/auto-register.d.ts",
      import: "./dist/auto-register.js",
    },
    "./umd": {
      default: "./dist/vivi2d.umd.js",
    },
  };
  const expectedSideEffects = ["./dist/auto-register.js", "./dist/vivi2d.umd.js"];

  if (pkg.name !== "@vivi2d/web") {
    fail("packages/web/package.json must describe @vivi2d/web.");
  }
  if (pkg.vivi2d?.publication !== "experimental") {
    fail(
      "@vivi2d/web must remain experimental until the Phase 4 publication gates pass.",
    );
  }
  if (pkg.private === true) {
    fail(
      "@vivi2d/web must not be private once it is treated as the npm-style SDK candidate.",
    );
  }
  if (pkg.main || pkg.module) {
    fail("@vivi2d/web must use export-map-only package entrypoints.");
  }
  if (pkg.exports?.["."]?.require) {
    fail("@vivi2d/web root export must not expose a Node require condition.");
  }
  if (stableJson(pkg.exports ?? {}) !== stableJson(expectedExports)) {
    fail("@vivi2d/web exports must stay ESM-first with ./auto-register and ./umd only.");
  }
  if (stableJson(pkg.sideEffects ?? null) !== stableJson(expectedSideEffects)) {
    fail("@vivi2d/web sideEffects must be limited to auto-register and UMD bundles.");
  }
  if (stableJson(pkg.files ?? null) !== stableJson(["dist"])) {
    fail("@vivi2d/web package files must stay limited to dist.");
  }
  if (!pkg.types || pkg.types !== "dist/index.d.ts") {
    fail("@vivi2d/web must expose generated declaration files through dist/index.d.ts.");
  }
}

function checkEntrypointBehavior() {
  const rootEntry = readText("packages/web/src/index.ts");
  const autoRegisterEntry = readText("packages/web/src/auto-register.ts");
  const entrypointTest = readText("packages/web/src/__tests__/web-entrypoints.test.ts");

  if (/^\s*defineViviModelElement\(\s*\)\s*;?\s*$/m.test(rootEntry)) {
    fail("@vivi2d/web root entrypoint must not auto-register the custom element.");
  }
  if (
    !/export\s+(?:function\s+defineViviModelElement|const\s+defineViviModelElement|\{[^}]*defineViviModelElement[^}]*\})/.test(
      rootEntry,
    )
  ) {
    fail("@vivi2d/web root entrypoint must expose defineViviModelElement().");
  }
  if (!/defineViviModelElement\(\s*\)\s*;?/.test(autoRegisterEntry)) {
    fail("@vivi2d/web/auto-register must perform guarded default registration.");
  }
  if (!entrypointTest.includes("keeps the root import side-effect free")) {
    fail("@vivi2d/web entrypoint tests must assert root import is side-effect free.");
  }
  if (!entrypointTest.includes("auto-register entrypoint")) {
    fail("@vivi2d/web entrypoint tests must cover the auto-register subpath.");
  }
}

function checkSourceIsolation() {
  const sourceFiles = gitLsFilesIncludingUntracked(["packages/web/src"])
    .filter((file) => /\.(?:ts|tsx)$/.test(file))
    .filter((file) => !file.includes("/__tests__/"))
    .filter((file) => !/(?:^|\/)[^/]+\.(?:test|spec)\.tsx?$/.test(file));

  if (sourceFiles.length === 0) {
    fail("packages/web/src must contain TypeScript source files.");
    return;
  }

  const forbiddenImports = [
    {
      pattern: /(?:from|import)\s*(?:\(\s*)?["'](?:electron|electron\/[^"']*)["']/,
      message: "must not import Electron from @vivi2d/web source.",
    },
    {
      pattern: /require\s*\(\s*["'](?:electron|electron\/[^"']*)["']\s*\)/,
      message: "must not require Electron from @vivi2d/web source.",
    },
    {
      pattern: /(?:from|import)\s*(?:\(\s*)?["'](?:node:[^"']+|fs|path)["']/,
      message: "must not import Node built-ins from @vivi2d/web source.",
    },
    {
      pattern: /require\s*\(\s*["'](?:node:[^"']+|fs|path)["']\s*\)/,
      message: "must not require Node built-ins from @vivi2d/web source.",
    },
    {
      pattern:
        /(?:from|import)\s*(?:\(\s*)?["']@vivi2d\/(?:editor-core|editor-ui|viewer|viewer-bridge-obs|provider-comfyui|provider-sdk|runtime-c-abi|runtime-native|runtime-wasm)(?:\/[^"']*)?["']/,
      message:
        "must not import editor, viewer, provider, native, or private WASM internals from @vivi2d/web source.",
    },
    {
      pattern:
        /require\s*\(\s*["']@vivi2d\/(?:editor-core|editor-ui|viewer|viewer-bridge-obs|provider-comfyui|provider-sdk|runtime-c-abi|runtime-native|runtime-wasm)(?:\/[^"']*)?["']\s*\)/,
      message:
        "must not require editor, viewer, provider, native, or private WASM internals from @vivi2d/web source.",
    },
    {
      pattern: /(?:from|import)\s*(?:\(\s*)?["']@\/[^"']+["']/,
      message: "must not import root app aliases from @vivi2d/web source.",
    },
    {
      pattern: /require\s*\(\s*["']@\/[^"']+["']\s*\)/,
      message: "must not require root app aliases from @vivi2d/web source.",
    },
    {
      pattern: /(?:from|import)\s*(?:\(\s*)?["'](?:src|apps)\/[^"']+["']/,
      message:
        "must not import root app or future app internals from @vivi2d/web source.",
    },
    {
      pattern: /require\s*\(\s*["'](?:src|apps)\/[^"']+["']\s*\)/,
      message:
        "must not require root app or future app internals from @vivi2d/web source.",
    },
    {
      pattern: /\b(?:eval|Function)\s*\(/,
      message: "must not use eval or Function in @vivi2d/web source.",
    },
  ];

  for (const file of sourceFiles) {
    const relativePath = file.replaceAll(path.sep, "/");
    const text = readText(relativePath);
    for (const rule of forbiddenImports) {
      if (rule.pattern.test(text)) {
        fail(`${relativePath}: ${rule.message}`);
      }
    }
  }
}

function checkDocsReferenceAudit() {
  const docs = [
    "docs/developer/api/web-sdk.md",
    "docs/developer/quality/public-api-status.md",
    "docs/developer/quality/public-release-checklist.md",
    "docs/developer/documentation-architecture.md",
  ];

  for (const doc of docs) {
    try {
      readText(doc);
    } catch {
      fail(`${doc} must exist and describe the current SDK unlock state.`);
    }
  }

  const webSdk = readText("docs/developer/api/web-sdk.md");
  if (!webSdk.includes("npm run check:sdk-unlock:web")) {
    fail(
      "docs/developer/api/web-sdk.md must name npm run check:sdk-unlock:web as the audit command.",
    );
  }
  if (!webSdk.includes("Phase 1 programmatic SDK implementation")) {
    fail(
      "docs/developer/api/web-sdk.md must scope the decision to Phase 1 programmatic SDK implementation.",
    );
  }
  if (!webSdk.includes("does not approve npm publication")) {
    fail("docs/developer/api/web-sdk.md must keep npm publication as a separate gate.");
  }

  for (const doc of docs.filter((doc) => doc !== "docs/developer/api/web-sdk.md")) {
    const text = readText(doc);
    if (!text.includes("npm run check:sdk-unlock:web")) {
      fail(`${doc} must reference npm run check:sdk-unlock:web.`);
    }
  }
}

function runCommand(command, args) {
  console.log(`\n[web-sdk-unlock] ${command} ${args.join(" ")}`);
  const result =
    process.platform === "win32"
      ? spawnSync([command, ...args].map(quoteShellArg).join(" "), {
          shell: true,
          stdio: "inherit",
        })
      : spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runRequiredSupportingGates() {
  const commands = [
    ["npm", ["run", "check:package-boundaries"]],
    ["npm", ["run", "check:architecture-boundaries"]],
    ["npm", ["run", "check:packages-types"]],
    ["npm", ["run", "check:model-fixtures"]],
    ["npm", ["run", "check:core-model-current-fixtures"]],
    ["npm", ["run", "build:packages"]],
    ["npm", ["run", "check:ip-product-profile"]],
    ["npm", ["run", "check:pack-contents"]],
    ["npm", ["run", "check:history-secrets"]],
    [
      "npx",
      [
        "vitest",
        "run",
        "packages/web/src/__tests__/web-entrypoints.test.ts",
        "packages/web/src/__tests__/vivi-model-element.release-gate.test.ts",
        "packages/web/src/__tests__/vivi-model-element.security.test.ts",
        "--no-coverage",
      ],
    ],
  ];

  for (const [command, args] of commands) {
    runCommand(command, args);
  }
}

function quoteShellArg(value) {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}

checkPackageSurface();
checkEntrypointBehavior();
checkSourceIsolation();
checkDocsReferenceAudit();

if (failures.length > 0) {
  console.error("[web-sdk-unlock] failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

if (runSupportingGates) {
  runRequiredSupportingGates();
} else {
  console.log("[web-sdk-unlock] supporting gates skipped by --self-only");
}

console.log("[web-sdk-unlock] passed");
