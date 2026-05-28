#!/usr/bin/env node
import { globSync, readFileSync, writeFileSync } from "node:fs";

const UNUSED_RULES = [
  "lint/suspicious/noExplicitAny",
  "lint/complexity/useArrowFunction",
  "lint/complexity/noStaticOnlyClass",
  "lint/a11y/noSvgWithoutTitle",
];

const patterns = [
  "packages/*/src/__tests__/**/*.ts",
  "packages/*/src/__tests__/**/*.tsx",
  "src/**/__tests__/**/*.ts",
  "src/**/__tests__/**/*.tsx",
  "src/**/*.test.ts",
  "src/**/*.test.tsx",
  "src/test/**/*.ts",
  "packages/*/src/test/**/*.ts",
];

const fileSet = new Set();
for (const pat of patterns) {
  try {
    // node v22+ fs.globSync
    for (const f of globSync(pat)) fileSet.add(f.replace(/\\/g, "/"));
  } catch {
    // ignore
  }
}

let totalRemoved = 0;
let modifiedFiles = 0;

for (const file of fileSet) {
  const src = readFileSync(file, "utf8");
  const lines = src.split(/\r?\n/);
  const keep = [];
  let removed = 0;
  for (const line of lines) {
    const m = line.match(/^\s*\/\/\s*biome-ignore\s+([^:\s]+)\s*:/);
    if (m && UNUSED_RULES.includes(m[1])) {
      removed++;
      continue;
    }
    keep.push(line);
  }
  if (removed > 0) {
    const newline = src.includes("\r\n") ? "\r\n" : "\n";
    writeFileSync(file, keep.join(newline), "utf8");
    modifiedFiles++;
    totalRemoved += removed;
    console.log(`${file}: removed ${removed}`);
  }
}

console.log(`\nDone. Modified ${modifiedFiles} files, removed ${totalRemoved} comments.`);
