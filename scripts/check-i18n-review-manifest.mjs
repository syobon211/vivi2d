import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(
  root,
  "docs/developer/contributing/i18n/translation-review-manifest.json",
);
const failures = [];

if (!fs.existsSync(manifestPath)) {
  failures.push(
    "docs/developer/contributing/i18n/translation-review-manifest.json is missing",
  );
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const entries = new Map(
    (manifest.entries ?? []).map((entry) => [normalizePath(entry.sourcePath), entry]),
  );

  for (const sourcePath of requiredSourcePaths()) {
    const entry = entries.get(sourcePath);
    if (!entry) {
      failures.push(`review manifest is missing ${sourcePath}`);
      continue;
    }
    const absolutePath = path.join(root, sourcePath);
    const currentHash = `sha256:${sha256(fs.readFileSync(absolutePath))}`;
    if (entry.sourceHash !== currentHash) {
      failures.push(`${sourcePath} review hash is stale`);
    }
    if (typeof entry.reviewedBy !== "string" || entry.reviewedBy.trim() === "") {
      failures.push(`${sourcePath} is missing reviewedBy`);
    }
    if (
      typeof entry.reviewedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt)
    ) {
      failures.push(`${sourcePath} is missing reviewedAt YYYY-MM-DD`);
    }
    if (
      !["provisional-technical-review", "human-reviewed"].includes(entry.reviewStatus)
    ) {
      failures.push(`${sourcePath} has unsupported reviewStatus`);
    }
    if (!Array.isArray(entry.keysReviewed) || entry.keysReviewed.length === 0) {
      failures.push(`${sourcePath} is missing keysReviewed coverage`);
    }
  }
}

if (failures.length > 0) {
  console.error("[i18n-review-manifest] failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("[i18n-review-manifest] passed");

function requiredSourcePaths() {
  const editorNamespaces = [
    "common",
    "dialog",
    "layer",
    "menu",
    "panel",
    "shortcut",
    "timeline",
  ];
  const paths = [];
  for (const locale of ["ja", "zh-Hans", "ko-KR"]) {
    for (const namespace of editorNamespaces) {
      paths.push(`src/lib/i18n/${locale}/${namespace}.ts`);
    }
  }
  for (const localeFile of ["ja.ts", "zh-Hans.ts", "ko-KR.ts"]) {
    paths.push(`packages/viewer/src/i18n/${localeFile}`);
  }
  return paths;
}

function normalizePath(value) {
  return String(value ?? "").replaceAll("\\", "/");
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
