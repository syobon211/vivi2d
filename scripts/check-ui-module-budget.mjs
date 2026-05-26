import fs from "node:fs";
import path from "node:path";
import {
  gitLsFilesIncludingUntracked,
  readJson,
  resolveRepoPath,
} from "./lib/repo.mjs";

const baselinePath = "docs/developer/quality/baselines/ui-module-budget.json";
const writeBaseline = process.argv.includes("--write");
const DEFAULT_LIMIT = 1000;
const TRACKED_TARGETS = new Map([
  [
    "packages/viewer/electron/viewer-api-server.cjs",
    {
      owner: "pre-public-refactor",
      target: "Q7 local API split",
      reason: "Viewer API server is the main Q7 security-boundary split target.",
    },
  ],
  [
    "packages/viewer/src/App.tsx",
    {
      owner: "pre-public-refactor",
      target: "Q4 viewer shell split",
      reason:
        "Viewer shell owns several panes and should move toward smaller feature slices.",
    },
  ],
  [
    "src/components/AutoSetupDialog.tsx",
    {
      owner: "pre-public-refactor",
      target: "Q4 auto-setup dialog split",
      reason: "Auto setup is a high-change workflow and should be split before SDK work.",
    },
  ],
  [
    "src/components/ManualPngSplitDialog.tsx",
    {
      owner: "pre-public-refactor",
      target: "Q4 manual split dialog split",
      reason:
        "Manual layer splitting is a high-change authoring workflow and should stay on the Q4 split radar.",
    },
  ],
  [
    "src/components/PropertiesPanel.tsx",
    {
      owner: "pre-public-refactor",
      target: "Q4 properties panel split",
      reason:
        "Properties panel is an editor hotspot even if it is currently under the global limit.",
    },
  ],
  [
    "src/components/menu/useMenuQuickActionsRegistration.ts",
    {
      owner: "pre-public-refactor",
      target: "Q4 command/menu registration split",
      reason:
        "Menu quick actions are command-boundary plumbing and should not grow silently.",
    },
  ],
  [
    "src/hooks/useMeshOverlay.ts",
    {
      owner: "pre-public-refactor",
      target: "Q4 mesh overlay hook split",
      reason:
        "Mesh overlay is a rendering/editor boundary hotspot and should not grow silently.",
    },
  ],
  [
    "src/lib/layer-occlusion-cleanup.ts",
    {
      owner: "pre-public-refactor",
      target: "Q3/Q4 occlusion cleanup command split",
      reason: "Layer occlusion cleanup remains a mutation-heavy workflow hotspot.",
    },
  ],
]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs"]);
const SCAN_PREFIXES = [
  "src/components/",
  "src/hooks/",
  "src/lib/",
  "packages/viewer/src/",
  "packages/viewer/electron/",
];

function shouldScan(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (!SOURCE_EXTENSIONS.has(path.extname(normalized))) return false;
  if (
    normalized.includes("/__tests__/") ||
    normalized.endsWith(".test.ts") ||
    normalized.endsWith(".test.tsx") ||
    normalized.endsWith(".spec.ts") ||
    normalized.endsWith(".d.ts")
  ) {
    return false;
  }
  return SCAN_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function lineCount(relativePath) {
  const text = fs.readFileSync(resolveRepoPath(relativePath), "utf8");
  return text.split(/\r?\n/).length;
}

const entries = gitLsFilesIncludingUntracked()
  .filter(shouldScan)
  .filter((relativePath) => fs.existsSync(resolveRepoPath(relativePath)))
  .map((relativePath) => ({
    limit: DEFAULT_LIMIT,
    lines: lineCount(relativePath),
    path: relativePath,
    tracked: TRACKED_TARGETS.has(relativePath),
  }))
  .filter((entry) => entry.lines > DEFAULT_LIMIT || entry.tracked)
  .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));

if (writeBaseline) {
  const baseline = {
    generatedBy: "npm run check:ui-module-budget -- --write",
    note: "Production UI/local-API modules over the Q4 first-pass line budget plus named Q4/Q7 split targets. maxLines is a ratchet: modules may shrink without refreshing the baseline, but growth needs review.",
    version: 2,
    defaultLimit: DEFAULT_LIMIT,
    exceptions: entries.map((entry) => ({
      limit: entry.limit,
      currentLines: entry.lines,
      maxLines: entry.lines,
      path: entry.path,
      tracked: entry.tracked,
      owner: targetMetadataFor(entry).owner,
      target: targetMetadataFor(entry).target,
      reason: targetMetadataFor(entry).reason,
      reviewBy: entry.path.includes("viewer-api") ? "Q7 exit" : "Q8 hardening pass",
    })),
  };
  fs.writeFileSync(
    resolveRepoPath(baselinePath),
    `${JSON.stringify(baseline, null, 2)}\n`,
  );
  console.log(
    `[ui-module-budget] wrote ${baselinePath} with ${entries.length} exceptions`,
  );
  process.exit(0);
}

if (!fs.existsSync(resolveRepoPath(baselinePath))) {
  console.error(
    `[ui-module-budget] missing ${baselinePath}; run npm run check:ui-module-budget -- --write after reviewing oversized modules.`,
  );
  process.exit(1);
}

const baseline = readJson(baselinePath);
const exceptionByPath = new Map(baseline.exceptions.map((entry) => [entry.path, entry]));
const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
const failures = [];

for (const trackedPath of TRACKED_TARGETS.keys()) {
  const trackedEntry = entryByPath.get(trackedPath);
  if (!trackedEntry) {
    failures.push(
      `${trackedPath}: tracked Q4/Q7 split target is missing from the scanned source set.`,
    );
    continue;
  }
  if (!exceptionByPath.has(trackedPath)) {
    failures.push(
      `${trackedPath}: tracked Q4/Q7 split target is missing from ${baselinePath}.`,
    );
  }
}

for (const entry of entries) {
  const exception = exceptionByPath.get(entry.path);
  if (!exception) {
    failures.push(
      `${entry.path}: ${entry.lines} lines exceeds ${entry.limit} without a reviewed budget exception.`,
    );
    continue;
  }
  const maxLines = exception.maxLines ?? exception.lines;
  if (entry.lines > maxLines) {
    failures.push(
      `${entry.path}: grew from ${maxLines} to ${entry.lines} lines; split or refresh the exception after review.`,
    );
  }
}

for (const exception of baseline.exceptions ?? []) {
  if (!entryByPath.has(exception.path)) {
    failures.push(
      `${exception.path}: baseline exception no longer maps to a scanned production module.`,
    );
  }
  if (typeof exception.owner !== "string" || exception.owner.length === 0) {
    failures.push(`${exception.path}: baseline exception must define an owner.`);
  }
  if (typeof exception.target !== "string" || exception.target.length === 0) {
    failures.push(`${exception.path}: baseline exception must define a split target.`);
  }
  if (typeof exception.reviewBy !== "string" || exception.reviewBy.length === 0) {
    failures.push(`${exception.path}: baseline exception must define reviewBy.`);
  }
  if (typeof (exception.maxLines ?? exception.lines) !== "number") {
    failures.push(`${exception.path}: baseline exception must define maxLines.`);
  }
}

if (failures.length > 0) {
  console.error("[ui-module-budget] failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`[ui-module-budget] passed (${entries.length} UI/local-API modules tracked)`);

function targetMetadataFor(entry) {
  const trackedTarget = TRACKED_TARGETS.get(entry.path);
  if (trackedTarget) return trackedTarget;
  return {
    owner: "pre-public-refactor",
    target: entry.path.includes("viewer-api")
      ? "Q7 local API split"
      : "Q3/Q4 vertical slice",
    reason: "Module exceeds the Q4 first-pass line budget.",
  };
}
