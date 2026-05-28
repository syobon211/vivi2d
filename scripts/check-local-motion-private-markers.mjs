import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const markerCatalog = readJsonFile(
  "scripts/generated/local-motion-marker-scan-catalog.json",
);

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".d.ts",
  ".html",
  ".js",
  ".json",
  ".map",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
]);

const PAYLOAD_MARKERS = markerCatalog.payloadMarkers;

const PUBLIC_COPY_PATTERNS = [
  /\bskeleton\b/i,
  /medial\s+axis/i,
  /\bgeodesic\b/i,
  /distance\s+transform/i,
  /signed\s+distance\s+field/i,
  /\bSDF\b/i,
  /\bBBW\b/i,
  /bounded\s+biharmonic/i,
  /harmonic\s+coordinates?/i,
  /\bLaplacian\b/i,
  /\bMLS\b/i,
  /\bARAP\b/i,
  /\bPCA\b/i,
  /principal\s+axis/i,
  /shape[-\s]?direction/i,
  /covariance/i,
  /eigenvector/i,
  /image\s+moments?/i,
  /mask\s+moments?/i,
  /\bsolver\b/i,
  /\bdeformer\b/i,
  /shape[-\s]?keys?/i,
  /\bkeyforms?\b/i,
  /blend[-\s]?shapes?/i,
  /vertex[-\s]?deltas?/i,
  /Moving\s+Least\s+Squares/i,
  /As[-\s]?Rigid[-\s]?As[-\s]?Possible/i,
  /guidedPreviewFit/,
  /motionStressPreview/,
];

const INTERNAL_ALLOWLIST = new Map([
  ["package.json", "npm scripts for local-motion gates"],
  ["packages/editor-core/package.json", "internal editor-core export map"],
  ["packages/editor-core/src/index.ts", "internal editor-core export barrel"],
  [
    "docs/developer/ip/clean-room-notes/mask-shape-handle-suggestions.md",
    "clean-room algorithm promotion note",
  ],
  [
    "docs/developer/quality/docs-migration-manifest.json",
    "tracked documentation migration audit manifest",
  ],
  [
    "docs/developer/architecture/editor-runtime-boundary.md",
    "developer-only boundary explanation for editor preview data",
  ],
  [
    "packages/editor-core/src/safe-auto-setup-plan.ts",
    "structure-aware SafeAutoSetup scanner implementation",
  ],
  [
    "packages/editor-core/src/local-motion.ts",
    "editor-only local motion draft implementation",
  ],
  [
    "packages/editor-core/src/local-motion-worker.ts",
    "editor-only local motion worker boundary validators",
  ],
  [
    "packages/editor-core/src/motion-handles.ts",
    "safe public-facing alias for internal local motion module",
  ],
  [
    "packages/editor-core/src/__tests__/local-motion.test.ts",
    "local motion negative fixtures",
  ],
  [
    "packages/editor-core/src/__tests__/local-motion-worker.test.ts",
    "local motion worker negative fixtures",
  ],
  [
    "packages/editor-core/src/__tests__/safe-auto-setup-plan.test.ts",
    "negative scanner fixtures",
  ],
  ["packages/model/src/runtime-spec.ts", "runtime forbidden marker catalog"],
  [
    "packages/model/src/private-profile-guards.ts",
    "model-owned persistent/public boundary guard implementation",
  ],
  [
    "packages/model/src/generated/private-local-motion-markers.ts",
    "generated model guard marker catalog",
  ],
  [
    "packages/model/src/public-profile.ts",
    "public profile validator invokes private preview boundary guard",
  ],
  [
    "packages/model/src/__tests__/model-fixtures.test.ts",
    "negative public-profile fixtures",
  ],
  ["packages/provider-sdk/src/index.ts", "provider artifact boundary validator"],
  [
    "packages/provider-sdk/src/generated/private-local-motion-markers.ts",
    "generated provider artifact marker catalog",
  ],
  [
    "packages/provider-sdk/src/__tests__/provider-sdk.test.ts",
    "negative provider artifact fixtures",
  ],
  ["scripts/check-local-motion-private-markers.mjs", "scanner implementation"],
  [
    "scripts/check-docs-public-surface.mjs",
    "public documentation scanner blocks local-motion markers",
  ],
  [
    "scripts/internal-contracts/local-motion-forbidden-markers.contract.json",
    "canonical internal marker contract",
  ],
  [
    "scripts/internal-contracts/clean-room-coverage.contract.json",
    "clean-room source publication contract",
  ],
  [
    "scripts/quality-gate-manifest.json",
    "quality gate manifest lists local-motion gates",
  ],
  [
    "scripts/architecture-boundaries.manifest.json",
    "architecture boundary manifest names local-motion import guards",
  ],
  [
    "scripts/generated/local-motion-marker-scan-catalog.json",
    "generated release scanner marker catalog",
  ],
  ["scripts/generate-local-motion-marker-catalogs.mjs", "marker catalog generator"],
  [
    "scripts/check-local-motion-worker-fixtures.mjs",
    "worker fixture validator implementation",
  ],
  [
    "scripts/check-pack-contents.mjs",
    "release scanner rejects local motion private markers",
  ],
  [
    "scripts/check-release-surface.mjs",
    "release scanner rejects local motion private markers",
  ],
  ["scripts/check-ip-product-profile.mjs", "public product scanner integration"],
  [
    "scripts/check-web-sdk-basic-static.mjs",
    "web SDK sample scanner implementation and negative smoke cases",
  ],
  ["scripts/run-quality-gates.mjs", "quality gate integration"],
  ["src/lib/auto-setup.ts", "internal Auto Setup motion handle bridge"],
  [
    "src/lib/auto-setup-accepted-masks.ts",
    "internal accepted-mask Auto Setup bridge loaded on demand",
  ],
  [
    "src/lib/project-serializer.ts",
    "project save boundary invokes private preview guard",
  ],
  ["src/lib/export/index.ts", "external export boundary invokes private preview guard"],
]);

const PUBLIC_COPY_PATHS = [
  "README.md",
  "docs/developer/quality/public-api-status.md",
  "docs/developer/api/viewer-api.md",
  "docs/developer/quality/public-release-checklist.md",
  "packages/web/README.md",
  "packages/provider-sdk/README.md",
];

const PUBLIC_PAYLOAD_PREFIXES = [
  "packages/model/fixtures/public/",
  "packages/web/dist/",
  "packages/viewer/contracts/",
  "packages/viewer/dist/",
  "packages/provider-sdk/dist/",
  "packages/viewer-api-client/dist/",
];

function classifySurface(relativePath) {
  if (INTERNAL_ALLOWLIST.has(relativePath)) return "internalAllowlisted";
  if (relativePath.includes("/__tests__/") || relativePath.endsWith(".test.ts")) {
    return "negativeOrUnitFixture";
  }
  if (PUBLIC_COPY_PATHS.includes(relativePath)) return "publicDoc";
  if (isPublicPayloadPath(relativePath)) return "publicPayload";
  if (relativePath.startsWith("docs/")) return "internalDesignDoc";
  if (relativePath.startsWith("scripts/")) return "releaseGate";
  return "source";
}

function fail(relativePath, message) {
  failures.push(`${relativePath} [${classifySurface(relativePath)}]: ${message}`);
}

function readJsonFile(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `${relativePath} is missing; run npm run generate:local-motion-marker-catalogs`,
    );
  }
  const value = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray(value.payloadMarkers) ||
    value.payloadMarkers.some(
      (marker) => typeof marker !== "string" || marker.length === 0,
    )
  ) {
    throw new Error(`${relativePath} must contain a payloadMarkers string array`);
  }
  return value;
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

function listRepoFiles() {
  return runGit(["ls-files", "--cached", "--others", "--exclude-standard"])
    .split(/\r?\n/)
    .filter(Boolean);
}

function normalizeMarkerText(value) {
  return value.toLowerCase().replace(/[-_.:/\s]+/g, "");
}

function hasPayloadMarker(text, marker) {
  return normalizeMarkerText(text).includes(normalizeMarkerText(marker));
}

function isTextFile(relativePath) {
  return TEXT_EXTENSIONS.has(path.extname(relativePath));
}

function isPublicPayloadPath(relativePath) {
  return PUBLIC_PAYLOAD_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

function isInternalAllowlisted(relativePath) {
  if (relativePath.includes("/__tests__/")) return true;
  if (relativePath.endsWith(".test.ts") || relativePath.endsWith(".test.tsx")) {
    return true;
  }
  return INTERNAL_ALLOWLIST.has(relativePath);
}

function scanPublicCopy(relativePath, text) {
  for (const pattern of PUBLIC_COPY_PATTERNS) {
    if (pattern.test(text)) {
      fail(relativePath, `public copy contains local-motion research term ${pattern}`);
    }
  }
}

function scanPublicPayload(relativePath, text) {
  for (const marker of PAYLOAD_MARKERS) {
    if (hasPayloadMarker(text, marker)) {
      fail(relativePath, `public payload contains local-motion private marker ${marker}`);
    }
  }
  const solverTokens = text.match(/[A-Za-z]+/g) ?? [];
  if (solverTokens.some((token) => token.toLowerCase() === "solver")) {
    fail(relativePath, "public payload contains solver token");
  }
}

for (const relativePath of listRepoFiles()) {
  if (!isTextFile(relativePath)) continue;
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) continue;
  const text = fs.readFileSync(absolutePath, "utf8");

  if (PUBLIC_COPY_PATHS.includes(relativePath)) {
    scanPublicCopy(relativePath, text);
  }
  if (isPublicPayloadPath(relativePath)) {
    scanPublicPayload(relativePath, text);
  }

  if (!isInternalAllowlisted(relativePath) && /local[-_]?motion/i.test(text)) {
    fail(relativePath, "unexpected local-motion wording outside reviewed surfaces");
  }
}

if (failures.length > 0) {
  console.error("[local-motion-private-markers] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[local-motion-private-markers] passed");
