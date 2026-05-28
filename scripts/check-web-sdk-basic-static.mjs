import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const exampleDir = path.join(root, "examples", "web-sdk-basic");
const webPackageDir = path.join(root, "packages", "web");
const IMPORT_SCANNED_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const unsafeHtmlSinkNames = ["inner" + "HTML", "insertAdjacent" + "HTML"];
const forbiddenExamplePatterns = [
  {
    label: "internal workspace import",
    pattern:
      /from\s+["']@vivi2d\/(?:core|renderer-pixi|loader|editor-core|runtime|runtime-wasm|runtime-native)(?:\/|["'])/,
  },
  {
    label: "source-file package import",
    pattern: /from\s+["']@vivi2d\/web\/(?:src|dist)\//,
  },
  {
    label: "unsafe HTML sink",
    pattern: new RegExp(`\\b(?:${unsafeHtmlSinkNames.join("|")})\\b`),
  },
  {
    label: "third-party compatibility claim",
    pattern: /Live2D|Cubism|VTube\s*Studio|compatible\s+with/i,
  },
  {
    label: "private local-motion marker",
    pattern:
      /LocalMotionDraft|LocalPreviewSolver|previewDeformedVertices|\bMLS\b|\bARAP\b|guidedPreviewFit/i,
  },
  {
    label: "raw console call in sample app",
    pattern: /\bconsole\.(?:log|debug|info|warn|error)\b/,
  },
];

run("npm", ["run", "build:fixtures", "--", "--check"]);
assertExamplePackagePolicy();
assertExampleScanners();
assertForbiddenScannerSmoke();
assertImportBoundarySmoke();
run("npm", ["run", "build", "--workspace", "@vivi2d/web"]);
run("npx", ["tsc", "--noEmit", "-p", "examples/web-sdk-basic/tsconfig.monorepo.json"]);
run("npx", ["vitest", "run", "--config", "examples/web-sdk-basic/vitest.config.ts"]);
run("npx", ["vite", "build", "--config", "examples/web-sdk-basic/vite.config.ts"]);
assertWebPackagePackExclusions();
assertDemoLinkExists();

if (failures.length > 0) {
  console.error("[web-sdk-samples:static] failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[web-sdk-samples:static] passed");

function run(command, args) {
  const result =
    process.platform === "win32"
      ? spawnSync([command, ...args].map(quoteShellArg).join(" "), {
          cwd: root,
          encoding: "utf8",
          shell: true,
          stdio: "inherit",
        })
      : spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function assertExamplePackagePolicy() {
  const rootPackage = readJson("package.json");
  if ((rootPackage.workspaces ?? []).some((entry) => entry.startsWith("examples"))) {
    failures.push("examples/** must stay outside root workspaces.");
  }
  const examplePackage = readJson("examples/web-sdk-basic/package.json");
  if (examplePackage.private !== true) {
    failures.push("examples/web-sdk-basic/package.json must be private.");
  }
  if (examplePackage.name?.startsWith("@vivi2d/")) {
    failures.push("example package must not use a publishable @vivi2d scope.");
  }
  if (examplePackage.dependencies?.["@vivi2d/web"] !== "file:../../packages/web") {
    failures.push("example must depend on @vivi2d/web through file:../../packages/web.");
  }
}

function assertExampleScanners() {
  for (const filePath of walk(exampleDir)) {
    const relativePath = path.relative(root, filePath).replaceAll("\\", "/");
    if (!isTextFile(filePath)) continue;
    const text = fs.readFileSync(filePath, "utf8");
    for (const finding of findForbiddenExamplePatterns(text)) {
      failures.push(`${relativePath}: contains ${finding}.`);
    }
    if (IMPORT_SCANNED_EXTENSIONS.has(path.extname(filePath))) {
      for (const finding of findExampleImportBoundaryFindings(filePath, text)) {
        failures.push(`${relativePath}: ${finding}.`);
      }
    }
  }

  const fixtureText = fs.readFileSync(
    path.join(exampleDir, "public", "generated-avatar.vivi"),
    "utf8",
  );
  const payload = JSON.parse(fixtureText);
  if (payload.profile !== "publicProfileV1") {
    failures.push("generated sample fixture must use publicProfileV1.");
  }
  const payloadText = JSON.stringify(payload);
  for (const finding of findForbiddenExamplePatterns(payloadText)) {
    failures.push(`generated-avatar.vivi contains ${finding}.`);
  }
}

function assertForbiddenScannerSmoke() {
  const scannerSmokeCases = [
    {
      expectedLabel: "third-party compatibility claim",
      text: "This example claims Live2D compatibility.",
    },
    {
      expectedLabel: "internal workspace import",
      text: 'import { something } from "@vivi2d/core";',
    },
    {
      expectedLabel: "source-file package import",
      text: 'import { something } from "@vivi2d/web/src/player";',
    },
    {
      expectedLabel: "unsafe HTML sink",
      text: `target.${unsafeHtmlSinkNames[0]} = userProvidedCopy;`,
    },
    {
      expectedLabel: "private local-motion marker",
      text: "const value = 'LocalMotionDraft';",
    },
    {
      expectedLabel: "raw console call in sample app",
      text: "console.log(model.metadata);",
    },
  ];
  for (const testCase of scannerSmokeCases) {
    const findings = findForbiddenExamplePatterns(testCase.text);
    if (!findings.includes(testCase.expectedLabel)) {
      failures.push(
        `examples/** scanner smoke did not detect ${testCase.expectedLabel}.`,
      );
    }
  }
}

function assertImportBoundarySmoke() {
  const sourceProbe = path.join(exampleDir, "src", "probe.ts");
  const localFindings = findExampleImportBoundaryFindings(
    sourceProbe,
    'import { formatViviWebError } from "./error-copy";\nimport { createViviWebPlayer } from "@vivi2d/web";',
  );
  if (localFindings.length > 0) {
    failures.push(
      `examples/** import boundary smoke unexpectedly rejected local/public imports: ${localFindings.join(", ")}.`,
    );
  }

  const boundarySmokeCases = [
    {
      expectedLabel: "imports outside examples/web-sdk-basic",
      text: 'import { createViviWebPlayer } from "../../../packages/web/src/player";',
    },
    {
      expectedLabel: "imports outside examples/web-sdk-basic",
      text: 'import renderer from "../../../packages/renderer-pixi/src/renderer";',
    },
    {
      expectedLabel: "imports outside examples/web-sdk-basic",
      text: 'import App from "../../../src/App";',
    },
    {
      expectedLabel: "imports non-root @vivi2d package",
      text: 'import { something } from "@vivi2d/web/src/player";',
    },
    {
      expectedLabel: "imports non-root @vivi2d package",
      text: 'import { something } from "@vivi2d/core";',
    },
  ];
  for (const testCase of boundarySmokeCases) {
    const findings = findExampleImportBoundaryFindings(sourceProbe, testCase.text);
    if (!findings.some((finding) => finding.includes(testCase.expectedLabel))) {
      failures.push(
        `examples/** import boundary smoke did not detect ${testCase.expectedLabel}.`,
      );
    }
  }
}

function findForbiddenExamplePatterns(text) {
  const findings = [];
  for (const rule of forbiddenExamplePatterns) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) findings.push(rule.label);
  }
  return findings;
}

function findExampleImportBoundaryFindings(filePath, text) {
  const findings = [];
  for (const specifier of extractImportSpecifiers(text)) {
    if (specifier === "@vivi2d/web") continue;
    if (specifier.startsWith("@vivi2d/")) {
      findings.push(`imports non-root @vivi2d package: ${specifier}`);
      continue;
    }
    if (isRelativeImport(specifier)) {
      const resolved = path.resolve(path.dirname(filePath), specifier);
      if (!isInsidePath(resolved, exampleDir)) {
        findings.push(`imports outside examples/web-sdk-basic: ${specifier}`);
      }
      continue;
    }
    if (specifier.startsWith("/") || isRepoAliasImport(specifier)) {
      findings.push(`uses repository-local import alias: ${specifier}`);
    }
  }
  return findings;
}

function extractImportSpecifiers(text) {
  const specifiers = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?[^;]*?\sfrom\s*["']([^"']+)["']/gs,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      specifiers.add(match[1]);
    }
  }
  return specifiers;
}

function isRelativeImport(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function isRepoAliasImport(specifier) {
  return (
    specifier.startsWith("@/") ||
    specifier.startsWith("~/") ||
    specifier.startsWith("src/") ||
    specifier.startsWith("packages/")
  );
}

function isInsidePath(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertWebPackagePackExclusions() {
  const result =
    process.platform === "win32"
      ? spawnSync("npm pack --dry-run --json", {
          cwd: webPackageDir,
          encoding: "utf8",
          shell: true,
        })
      : spawnSync("npm", ["pack", "--dry-run", "--json"], {
          cwd: webPackageDir,
          encoding: "utf8",
        });
  if (result.status !== 0) {
    failures.push(`npm pack --dry-run failed for @vivi2d/web: ${result.stderr}`);
    return;
  }
  const packs = JSON.parse(result.stdout);
  const files = packs.flatMap((pack) => pack.files?.map((file) => file.path) ?? []);
  for (const file of files) {
    if (file.startsWith("examples/")) {
      failures.push(`@vivi2d/web pack includes example file: ${file}`);
    }
    if (file === "demo.html") {
      failures.push("@vivi2d/web pack must not include demo.html.");
    }
  }
}

function assertDemoLinkExists() {
  const demo = fs.readFileSync(path.join(root, "packages/web/demo.html"), "utf8");
  const match = demo.match(/examples\/web-sdk-basic\/README\.md/);
  if (!match) {
    failures.push(
      "packages/web/demo.html must link to examples/web-sdk-basic/README.md.",
    );
    return;
  }
  if (!fs.existsSync(path.join(root, "examples/web-sdk-basic/README.md"))) {
    failures.push(
      "packages/web/demo.html links to a missing programmatic sample README.",
    );
  }
}

function walk(dir) {
  const files = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else files.push(fullPath);
    }
  }
  return files;
}

function isTextFile(filePath) {
  return new Set([".css", ".html", ".json", ".md", ".ts", ".tsx", ".txt", ".vivi"]).has(
    path.extname(filePath),
  );
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function quoteShellArg(value) {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}
