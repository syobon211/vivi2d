import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CJK_PATTERN = /[\u1100-\u11ff\u3040-\u30ff\u3130-\u318f\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/u;

const SCAN_TARGETS = [
  {
    label: "Editor English locale",
    path: "src/lib/i18n/en",
    extensions: new Set([".ts"]),
  },
  {
    label: "Viewer English locale",
    path: "packages/viewer/src/i18n/en.ts",
    extensions: new Set([".ts"]),
  },
  {
    label: "Viewer public E2E fixtures",
    path: "packages/viewer/e2e/fixtures",
    extensions: new Set([".mjs", ".vivi"]),
  },
];

const findings = [];

for (const target of SCAN_TARGETS) {
  const absolutePath = path.join(ROOT, target.path);
  if (!fs.existsSync(absolutePath)) {
    findings.push(`${target.label}: missing scan target ${target.path}`);
    continue;
  }
  const stat = fs.statSync(absolutePath);
  if (stat.isDirectory()) {
    walk(absolutePath, target);
  } else {
    scanFile(absolutePath, target);
  }
}

if (findings.length > 0) {
  console.error("[english-locale-surface] failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("[english-locale-surface] passed");

function walk(directory, target) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath, target);
      continue;
    }
    scanFile(absolutePath, target);
  }
}

function scanFile(absolutePath, target) {
  if (!target.extensions.has(path.extname(absolutePath))) return;
  const relativePath = path.relative(ROOT, absolutePath).replaceAll("\\", "/");
  const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!CJK_PATTERN.test(lines[index])) continue;
    findings.push(
      `${relativePath}:${index + 1} contains CJK text in ${target.label}; keep English locale and Viewer public fixtures English-only`,
    );
  }
}
