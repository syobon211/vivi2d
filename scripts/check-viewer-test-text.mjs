import fs from "node:fs";
import path from "node:path";
import { containsMojibakeMarker } from "./lib/source-hygiene.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCAN_ROOTS = [
  path.join(ROOT, "packages/viewer/src/__tests__"),
  path.join(ROOT, "packages/viewer/e2e"),
];
const EXTENSIONS = new Set([".ts", ".tsx"]);
const violations = [];

for (const scanRoot of SCAN_ROOTS) {
  walk(scanRoot);
}

if (violations.length > 0) {
  console.error("[viewer-test-text] found unreadable text markers:");
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line}: ${violation.text}`);
  }
  process.exit(1);
}

console.log("[viewer-test-text] passed");

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const code = error.code;
      if (code === "ENOENT" || code === "EACCES" || code === "EPERM") return;
    }
    throw error;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "test-results") continue;
      walk(fullPath);
      continue;
    }
    if (!EXTENSIONS.has(path.extname(entry.name))) continue;
    scanFile(fullPath);
  }
}

function scanFile(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!containsMojibakeMarker(lines[index])) continue;
    violations.push({
      file: path.relative(ROOT, filePath).replaceAll("\\", "/"),
      line: index + 1,
      text: "possible mojibake marker",
    });
  }
}
