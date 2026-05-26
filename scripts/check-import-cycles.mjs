import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { readJson, readText, repoRoot, resolveRepoPath } from "./lib/repo.mjs";

const baselinePath = "docs/developer/quality/baselines/import-cycles.json";
const writeBaseline = process.argv.includes("--write");
const sourceRoots = ["src", "packages"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const ignoredPathParts = new Set([
  "__tests__",
  "__bench__",
  "node_modules",
  "dist",
  "coverage",
]);

const compilerOptions = loadCompilerOptions();
const host = ts.createCompilerHost(compilerOptions, true);
const files = collectSourceFiles();
const fileSet = new Set(files);
const graph = new Map(files.map((file) => [file, []]));

for (const file of files) {
  graph.set(
    file,
    resolveImports(file).filter((target) => fileSet.has(target)),
  );
}

const cycles = normalizeCycles(findCycles(graph));

if (writeBaseline) {
  fs.writeFileSync(
    resolveRepoPath(baselinePath),
    `${JSON.stringify({ schemaVersion: 1, cycles }, null, 2)}\n`,
  );
  console.log(`[import-cycles] wrote ${baselinePath} (${cycles.length} cycles)`);
  process.exit(0);
}

const baseline = readJson(baselinePath);
const expectedCycles = baseline.cycles ?? [];

if (JSON.stringify(cycles) !== JSON.stringify(expectedCycles)) {
  console.error("[import-cycles] failed: import cycle baseline drifted");
  console.error(`Expected ${expectedCycles.length} cycles, found ${cycles.length}.`);
  console.error(`Run npm run check:import-cycles -- --write after reviewing the diff.`);
  process.exit(1);
}

console.log(`[import-cycles] passed (${cycles.length} baseline cycles)`);

function loadCompilerOptions() {
  const configPath = ts.findConfigFile(repoRoot, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) throw new Error("tsconfig.json was not found");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    repoRoot,
    {},
    configPath,
  );
  return parsed.options;
}

function collectSourceFiles() {
  return sourceRoots
    .flatMap((rootDir) => walk(resolveRepoPath(rootDir)))
    .map(toRepoRelative)
    .filter((file) => extensions.has(path.extname(file)))
    .filter((file) => !file.endsWith(".d.ts"))
    .filter((file) => !file.endsWith(".test.ts"))
    .filter((file) => !file.endsWith(".test.tsx"))
    .filter((file) => !file.endsWith(".bench.ts"))
    .sort();
}

function walk(absolutePath) {
  if (!fs.existsSync(absolutePath)) return [];
  const entries = fs.readdirSync(absolutePath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredPathParts.has(entry.name)) continue;
    const child = path.join(absolutePath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(child));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }

  return files;
}

function resolveImports(file) {
  const sourceText = readText(file);
  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);
  const imports = [];

  sourceFile.forEachChild((node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (specifier && ts.isStringLiteral(specifier)) imports.push(specifier.text);
      return;
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push(node.arguments[0].text);
    }
  });

  return imports
    .map((specifier) => resolveImport(file, specifier))
    .filter(Boolean)
    .sort();
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@")) return null;

  const resolved = ts.resolveModuleName(
    specifier,
    resolveRepoPath(fromFile),
    compilerOptions,
    host,
  ).resolvedModule;

  if (!resolved?.resolvedFileName) return null;

  const absoluteResolved = path.normalize(resolved.resolvedFileName);
  if (!absoluteResolved.startsWith(repoRoot)) return null;

  return toRepoRelative(absoluteResolved);
}

function findCycles(importGraph) {
  const cycles = [];
  const stack = [];
  const inStack = new Set();
  const visited = new Set();

  for (const file of importGraph.keys()) {
    visit(file);
  }

  return cycles;

  function visit(file) {
    if (inStack.has(file)) return;
    if (visited.has(file)) return;

    visited.add(file);
    stack.push(file);
    inStack.add(file);

    for (const next of importGraph.get(file) ?? []) {
      if (inStack.has(next)) {
        cycles.push(stack.slice(stack.indexOf(next)));
      } else {
        visit(next);
      }
    }

    stack.pop();
    inStack.delete(file);
  }
}

function normalizeCycles(cycles) {
  const normalized = new Set();

  for (const cycle of cycles) {
    if (cycle.length < 2) continue;
    const rotations = cycle.map((_, index) => [
      ...cycle.slice(index),
      ...cycle.slice(0, index),
    ]);
    const canonical = rotations.map((rotation) => rotation.join(" -> ")).sort()[0];
    normalized.add(canonical);
  }

  return [...normalized].sort().map((cycle) => cycle.split(" -> "));
}

function toRepoRelative(absolutePath) {
  return path.relative(repoRoot, absolutePath).replaceAll(path.sep, "/");
}
