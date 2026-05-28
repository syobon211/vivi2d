import fs from "node:fs";
import path from "node:path";
import {
  containsMojibakeMarker,
  containsNonAscii,
  looksLikeComment,
} from "./lib/source-hygiene.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const ROOTS = ["src", "packages", "e2e", "electron", "scripts"].map((segment) =>
  path.join(ROOT, segment),
);
const ROOT_FILES = [
  "vite.aliases.ts",
  "vite.config.ts",
  "vitest.config.ts",
  "tsconfig.packages.json",
  "e2e/playwright.config.ts",
].map((filePath) => path.join(ROOT, filePath));
const EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".html",
]);
const SKIP_PATH =
  /[\\/](?:dist|coverage|playwright-report|test-results|node_modules|__pycache__|\.tmp-tests)[\\/]/;
const violations = [];

for (const root of ROOTS) {
  walk(root);
}
for (const filePath of ROOT_FILES) {
  if (fs.existsSync(filePath)) scanFile(filePath);
}

if (violations.length > 0) {
  console.error("Found source hygiene violations:");
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line}: ${violation.text}`);
  }
  process.exit(1);
}

console.log("No non-English comments or raw mojibake markers found.");

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const code = error.code;
      if (code === "EACCES" || code === "EPERM") return;
    }
    throw error;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      continue;
    }
    if (SKIP_PATH.test(`${fullPath}${entry.isDirectory() ? path.sep : ""}`)) {
      continue;
    }

    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }

    scanFile(fullPath);
  }
}

function scanFile(filePath) {
  const relativePath = path.relative(ROOT, filePath).replaceAll("\\", "/");
  const bytes = fs.readFileSync(filePath);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    violations.push({
      file: relativePath,
      line: 1,
      text: "UTF-8 BOM is not allowed",
    });
    return;
  }
  const lines = bytes.toString("utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (containsMojibakeMarker(lines[index])) {
      violations.push({
        file: relativePath,
        line: index + 1,
        text: "possible raw mojibake marker",
      });
      continue;
    }

    const trimmed = lines[index].trim();
    if (!looksLikeComment(trimmed)) {
      continue;
    }
    if (!containsNonAscii(trimmed)) {
      continue;
    }
    violations.push({
      file: relativePath,
      line: index + 1,
      text: trimmed,
    });
  }
}
