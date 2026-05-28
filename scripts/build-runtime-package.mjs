import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveRepoPath } from "./lib/repo.mjs";

const runtimeDir = resolveRepoPath("packages/runtime");
const sourcePath = path.join(runtimeDir, "src/index.ts");
const distDir = path.join(runtimeDir, "dist");
const source = readFileSync(sourcePath, "utf8");
const exportPattern =
  /export\s+(type\s+)?\{\s*([\s\S]*?)\s*\}\s+from\s+["']([^"']+)["'];/g;
const parsedExports = [];
let matchedSource = "";

for (const match of source.matchAll(exportPattern)) {
  matchedSource += match[0];
  const isTypeOnlyExport = Boolean(match[1]);
  const sourceModule = match[3];
  const specifiers = match[2]
    .split(",")
    .map((specifier) => specifier.trim())
    .filter(Boolean);
  const typeSpecifiers = [];
  const valueSpecifiers = [];
  for (const specifier of specifiers) {
    if (isTypeOnlyExport || specifier.startsWith("type ")) {
      typeSpecifiers.push(specifier.replace(/^type\s+/, ""));
    } else {
      valueSpecifiers.push(specifier);
    }
  }
  parsedExports.push({ sourceModule, typeSpecifiers, valueSpecifiers });
}

const unmatchedSource = source.replaceAll(exportPattern, "").replace(/\s+/g, "");
if (matchedSource.length === 0 || unmatchedSource.length > 0) {
  throw new Error(
    "packages/runtime/src/index.ts must contain only named re-export declarations (export * and export * as are not supported by this build script).",
  );
}

function formatExport(kind, specifiers, sourceModule) {
  if (specifiers.length === 0) return "";
  const exportKeyword = kind === "type" ? "export type" : "export";
  const body = specifiers.map((specifier) => `  ${specifier},`).join("\n");
  return `${exportKeyword} {\n${body}\n} from "${sourceModule}";`;
}

function joinExports(lines) {
  return `${lines.filter(Boolean).join("\n")}\n`;
}

const declarationOutput = joinExports(
  parsedExports.flatMap(({ sourceModule, typeSpecifiers, valueSpecifiers }) => [
    formatExport("value", valueSpecifiers, sourceModule),
    formatExport("type", typeSpecifiers, sourceModule),
  ]),
);
const runtimeOutput = joinExports(
  parsedExports.map(({ sourceModule, valueSpecifiers }) =>
    formatExport("value", valueSpecifiers, sourceModule),
  ),
);

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

writeFileSync(path.join(distDir, "index.d.ts"), declarationOutput);
writeFileSync(path.join(distDir, "index.js"), runtimeOutput);

console.log("[runtime-package] wrote packages/runtime/dist");
