import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const PUBLICATION_STATUSES = new Set(["experimental", "public"]);
const KNOWN_PUBLICATION_STATUSES = new Set([
  ...PUBLICATION_STATUSES,
  "internal",
  "internal-app",
]);
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".d.ts",
  ".html",
  ".js",
  ".json",
  ".map",
  ".md",
  ".mjs",
  ".svg",
  ".txt",
]);
const FORBIDDEN_PUBLIC_TEXT_PATTERNS = [
  {
    label: "Windows user path",
    pattern: /[A-Za-z]:[\\/]+Users[\\/]+(?![\\/]*User(?:[\\/]|$))[^\\/]+[\\/]/,
  },
  { label: "POSIX home path", pattern: /\/home\/[^/"'\s]+/ },
  { label: "local backlog path", pattern: /docs[\\/]+backlog/ },
  { label: "dev server env name", pattern: /VITE_DEV_SERVER_URL/ },
  { label: "Vite dev port", pattern: /localhost:1420|127\.0\.0\.1:1420/ },
  {
    label: "secret-looking token",
    pattern:
      /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|id[_-]?token|bearer[_-]?token|bearer\s+[A-Za-z0-9._~+/=-]{12,}|client[_-]?secret|secret[_-]?key|private[_-]?key|password[_-]?(?:token|secret|hash)|credential[_-]?(?:token|secret|key))\b/i,
  },
  { label: "Zundamon review marker", pattern: /zunmon|zunda|ずんだもん/i },
  {
    label: "local motion private marker",
    pattern:
      /LocalMotionDraft|LocalPreviewSolver|LocalMotionApplyPlan|LocalPreviewFrame|BrandedLocalPreviewFrame|EditorOnlyPreview|previewOnly|previewDeformedVertices|guidedPreviewFit|motionStressPreview|\bMLS\b|\bARAP\b|Moving\s+Least\s+Squares|As[-\s]?Rigid[-\s]?As[-\s]?Possible/i,
  },
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function collectWorkspacePackages() {
  const packagesDir = path.join(root, "packages");
  return fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const relativePath = `packages/${entry.name}/package.json`;
      if (!fs.existsSync(path.join(root, relativePath))) return null;
      const pkg = readJson(relativePath);
      return { dir: `packages/${entry.name}`, relativePath, pkg };
    })
    .filter(Boolean);
}

function flattenExportTargets(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenExportTargets);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(flattenExportTargets);
  }
  return [];
}

function runNpmPack() {
  const args = ["pack", "--workspaces", "--dry-run", "--json"];
  const command =
    process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
  const commandArgs =
    process.platform === "win32" ? ["/d", "/s", "/c", "npm", ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      result.stderr ||
        result.error?.message ||
        "npm pack --workspaces --dry-run --json failed",
    );
  }
  return JSON.parse(result.stdout);
}

function normalizeTarget(target) {
  return target.replace(/^\.\//, "");
}

function isAllowedPublicFile(filePath) {
  return (
    filePath === "package.json" ||
    filePath === "README.md" ||
    filePath === "LICENSE" ||
    filePath.startsWith("dist/")
  );
}

function findForbiddenPackEntryLabels(filePath) {
  const labels = [];
  if (filePath === "demo.html" || filePath === "packages/web/demo.html") {
    labels.push("demo.html");
  }
  if (filePath.startsWith("examples/") || filePath.includes("/examples/")) {
    labels.push("examples/**");
  }
  return labels;
}

function assertPackContentRuleSmoke() {
  const smokeCases = [
    { expectedLabel: "examples/**", filePath: "examples/web-sdk-basic/README.md" },
    {
      expectedLabel: "examples/**",
      filePath: "examples/web-sdk-basic/public/generated-avatar.vivi",
    },
    { expectedLabel: "demo.html", filePath: "demo.html" },
    { expectedLabel: "demo.html", filePath: "packages/web/demo.html" },
  ];
  for (const testCase of smokeCases) {
    const labels = findForbiddenPackEntryLabels(testCase.filePath);
    if (!labels.includes(testCase.expectedLabel)) {
      failures.push(
        `pack-content smoke did not detect ${testCase.expectedLabel} for ${testCase.filePath}.`,
      );
    }
  }
  const allowedLabels = findForbiddenPackEntryLabels("dist/index.js");
  if (allowedLabels.length > 0) {
    failures.push(
      `pack-content smoke unexpectedly rejected dist/index.js: ${allowedLabels.join(", ")}.`,
    );
  }
}

function checkPublicPackage(workspace, packInfo) {
  const packageName = workspace.pkg.name;
  const files = new Set(packInfo.files.map((file) => file.path));
  const declaredTargets = [
    workspace.pkg.main,
    workspace.pkg.module,
    workspace.pkg.types,
    ...flattenExportTargets(workspace.pkg.exports),
  ]
    .filter(Boolean)
    .map(normalizeTarget);

  for (const target of declaredTargets) {
    if (!files.has(target)) {
      failures.push(
        `${packageName} declares ${target}, but it is missing from npm pack.`,
      );
    }
  }
  for (const requiredFile of ["LICENSE", "README.md", "package.json"]) {
    if (!files.has(requiredFile)) {
      failures.push(`${packageName} npm pack is missing ${requiredFile}.`);
    }
  }

  for (const file of files) {
    for (const label of findForbiddenPackEntryLabels(file)) {
      failures.push(
        `${packageName} packs ${label}; keep demos and examples outside npm tarballs.`,
      );
    }
    if (!isAllowedPublicFile(file)) {
      failures.push(`${packageName} packs non-release file: ${file}`);
    }
    if (/(^|\/)(src|e2e|__tests__|tests?)\//.test(file)) {
      failures.push(`${packageName} packs source or test path: ${file}`);
    }
    if (/\.tsx?$/.test(file) && !file.endsWith(".d.ts")) {
      failures.push(`${packageName} packs TypeScript source: ${file}`);
    }
    for (const privateWorkspace of workspaces) {
      if (privateWorkspace.dir === workspace.dir) continue;
      const privatePublication = privateWorkspace.pkg.vivi2d?.publication;
      if (PUBLICATION_STATUSES.has(privatePublication)) continue;
      const privateDistPrefix = `dist/${path.basename(privateWorkspace.dir)}/`;
      if (file.startsWith(privateDistPrefix)) {
        failures.push(`${packageName} packs internal workspace declarations: ${file}`);
      }
    }

    const extension = path.extname(file);
    const fullPath = path.join(root, workspace.dir, file);
    if (TEXT_EXTENSIONS.has(extension) && fs.existsSync(fullPath)) {
      const text = fs.readFileSync(fullPath, "utf8");
      for (const rule of FORBIDDEN_PUBLIC_TEXT_PATTERNS) {
        if (rule.pattern.test(text)) {
          failures.push(`${packageName} packs ${rule.label} in ${file}`);
        }
      }
    }
  }

  for (const dependencyField of [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    for (const dependencyName of Object.keys(workspace.pkg[dependencyField] ?? {})) {
      const dependency = workspacesByName.get(dependencyName);
      if (!dependency) continue;
      const dependencyPublication = dependency.pkg.vivi2d?.publication;
      if (
        dependencyPublication === "internal" ||
        dependencyPublication === "internal-app"
      ) {
        failures.push(
          `${packageName} ${dependencyField} references private workspace ${dependencyName}; bundle it or make the dependency public first.`,
        );
      }
    }
  }
}

const workspaces = collectWorkspacePackages();
const workspacesByName = new Map(
  workspaces.map((workspace) => [workspace.pkg.name, workspace]),
);
assertPackContentRuleSmoke();
const packByName = new Map(runNpmPack().map((entry) => [entry.name, entry]));

for (const workspace of workspaces) {
  const publication = workspace.pkg.vivi2d?.publication;
  const packInfo = packByName.get(workspace.pkg.name);
  if (!packInfo) {
    failures.push(`${workspace.pkg.name} is missing from npm pack dry-run output.`);
    continue;
  }

  if (!KNOWN_PUBLICATION_STATUSES.has(publication)) {
    failures.push(
      `${workspace.pkg.name} has missing or unknown vivi2d.publication status.`,
    );
  } else if (PUBLICATION_STATUSES.has(publication)) {
    checkPublicPackage(workspace, packInfo);
  } else if (workspace.pkg.private !== true) {
    failures.push(
      `${workspace.pkg.name} is marked ${publication} but package.json private is not true.`,
    );
  }
}

if (failures.length > 0) {
  console.error("[pack-contents] failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("[pack-contents] passed");
