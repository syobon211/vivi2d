import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  comfyUiSourceRecordRequiredReasons,
  comfyUiTrackedSourceRecordReasons,
  validateComfyUiSourceRecord,
  validateComfyUiTrackedSourceRecord,
} from "./lib/comfyui-source-record.mjs";

const root = process.cwd();
const failures = [];
const warnings = [];

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".md",
  ".mjs",
  ".svg",
  ".ts",
  ".txt",
]);

const FORBIDDEN_DIST_PATTERNS = [
  {
    label: "Windows user path",
    pattern: /[A-Za-z]:[\\/]+Users[\\/]+(?![\\/]*User(?:[\\/]|$))[^\\/]+[\\/]/,
  },
  { label: "POSIX home path", pattern: /\/home\/[^/"'\s]+/ },
  { label: "dev server env name", pattern: /VITE_DEV_SERVER_URL/ },
  { label: "Vite dev port", pattern: /localhost:1420|127\.0\.0\.1:1420/ },
  { label: "local backlog path", pattern: /docs[\\/]+backlog/ },
  {
    label: "secret-looking token",
    pattern:
      /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|id[_-]?token|bearer[_-]?token|bearer\s+[A-Za-z0-9._~+/=-]{12,}|client[_-]?secret|secret[_-]?key|private[_-]?key|password[_-]?(?:token|secret|hash)|credential[_-]?(?:token|secret|key))\b/i,
  },
  {
    label: "local motion private marker",
    pattern:
      /LocalMotionDraft|LocalPreviewSolver|LocalMotionApplyPlan|LocalPreviewFrame|BrandedLocalPreviewFrame|EditorOnlyPreview|previewOnly|previewDeformedVertices|guidedPreviewFit|motionStressPreview|\bMLS\b|\bARAP\b|Moving\s+Least\s+Squares|As[-\s]?Rigid[-\s]?As[-\s]?Possible/i,
  },
  { label: "Zundamon review marker", pattern: /zunmon|zunda|ずんだもん/i },
];

const FORBIDDEN_TRACKED_PATH_PATTERNS = [
  {
    label: "local security audit memo",
    pattern: /^SECURITY-AUDIT-\d{4}-\d{2}-\d{2}\.md$/,
  },
];

const PUBLIC_EXAMPLE_PATHS = ["examples/web-sdk-basic"];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function walkFiles(dir) {
  const files = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function relative(filePath) {
  return path.relative(root, filePath).replaceAll("\\", "/");
}

function checkDistSurface() {
  const distDir = path.join(root, "dist");
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    fail("dist/index.html is missing. Run npm run build before release-surface checks.");
    return;
  }
  const assetsDir = path.join(distDir, "assets");
  if (!fs.existsSync(assetsDir) || fs.readdirSync(assetsDir).length === 0) {
    fail("dist/assets is missing or empty.");
    return;
  }

  for (const filePath of walkFiles(distDir)) {
    if (!TEXT_EXTENSIONS.has(path.extname(filePath))) continue;
    const text = fs.readFileSync(filePath, "utf8");
    for (const rule of FORBIDDEN_DIST_PATTERNS) {
      if (rule.pattern.test(text)) {
        fail(`${relative(filePath)} contains ${rule.label}.`);
      }
    }
  }
}

function checkUserDocsMediaSurface() {
  const result = spawnSync(process.execPath, ["scripts/check-user-docs-media.mjs"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const output = `${result.stdout}\n${result.stderr}`.trim();
    fail(`User docs media gate failed before release-surface check:\n${output}`);
  }
}

function checkTrackedReleaseSurface() {
  const tracked = runGit(["ls-files"]).split(/\r?\n/).filter(Boolean);
  for (const filePath of tracked) {
    for (const rule of FORBIDDEN_TRACKED_PATH_PATTERNS) {
      if (fs.existsSync(path.join(root, filePath)) && rule.pattern.test(filePath)) {
        fail(`Tracked ${rule.label} is not release-safe: ${filePath}`);
      }
    }
    if (filePath.includes("__pycache__") || filePath.endsWith(".pyc")) {
      fail(`Tracked Python cache file is not release-safe: ${filePath}`);
    }
    if (filePath.startsWith("docs/backlog/")) {
      fail(`Tracked backlog file is not release-safe: ${filePath}`);
    }
  }

  const trackedBacklog = runGit(["ls-files", "docs/backlog"]).trim();
  if (trackedBacklog) {
    fail("docs/backlog contains tracked files.");
  }
}

function checkReleaseDocuments() {
  for (const relativePath of [
    "SECURITY.md",
    "THIRD_PARTY_NOTICES",
    "docs/developer/ip/policy.md",
    "docs/developer/quality/public-api-status.md",
    "docs/developer/api/viewer-api.md",
    "docs/developer/quality/public-release-checklist.md",
    "docs/developer/security/threat-model.md",
  ]) {
    if (!fs.existsSync(path.join(root, relativePath))) {
      fail(`Missing release-surface document: ${relativePath}`);
    }
  }

  const notices = fs.existsSync(path.join(root, "THIRD_PARTY_NOTICES"))
    ? fs.readFileSync(path.join(root, "THIRD_PARTY_NOTICES"), "utf8")
    : "";
  if (notices.includes("release placeholder")) {
    warn(
      "THIRD_PARTY_NOTICES is still a placeholder; generate artifact-specific notices before public release.",
    );
  }
}

function checkComfyUiSourceRecord() {
  const manifestPath = "docs/user/publication-manifest.json";
  let publicationRoutes = new Map();
  if (fs.existsSync(path.join(root, manifestPath))) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestPath), "utf8"));
      publicationRoutes = new Map(
        (manifest.routes ?? []).map((route) => [route.slug, route]),
      );
    } catch (error) {
      fail(`${manifestPath}: invalid JSON (${error.message})`);
      return;
    }
  }

  const requiredReasons = comfyUiSourceRecordRequiredReasons(root, {
    publicationRoutes,
    releaseCandidate: true,
  });
  for (const failure of validateComfyUiTrackedSourceRecord(
    root,
    comfyUiTrackedSourceRecordReasons(root),
  )) {
    fail(failure);
  }
  for (const failure of validateComfyUiSourceRecord(root, requiredReasons)) {
    fail(failure);
  }
}

function checkPublicExamples() {
  for (const relativeDir of PUBLIC_EXAMPLE_PATHS) {
    const absoluteDir = path.join(root, relativeDir);
    if (!fs.existsSync(absoluteDir)) {
      fail(`Missing release-surface example directory: ${relativeDir}`);
      continue;
    }
    for (const filePath of walkFiles(absoluteDir)) {
      if (!TEXT_EXTENSIONS.has(path.extname(filePath)) && !filePath.endsWith(".vivi")) {
        continue;
      }
      const text = fs.readFileSync(filePath, "utf8");
      for (const rule of FORBIDDEN_DIST_PATTERNS) {
        if (rule.pattern.test(text)) {
          fail(`${relative(filePath)} contains ${rule.label}.`);
        }
      }
    }
  }
}

checkUserDocsMediaSurface();
checkDistSurface();
checkTrackedReleaseSurface();
checkReleaseDocuments();
checkComfyUiSourceRecord();
checkPublicExamples();

for (const message of warnings) {
  console.warn(`[release-surface] warning: ${message}`);
}

if (failures.length > 0) {
  console.error("[release-surface] failed:");
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log("[release-surface] passed");
