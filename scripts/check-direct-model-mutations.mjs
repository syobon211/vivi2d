import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  gitLsFilesIncludingUntracked,
  readJson,
  resolveRepoPath,
} from "./lib/repo.mjs";

const baselinePath = "docs/developer/quality/baselines/direct-model-mutations.json";
const writeBaseline = process.argv.includes("--write");
const MUTATING_METHODS = new Set([
  "add",
  "clear",
  "delete",
  "pop",
  "push",
  "reverse",
  "set",
  "shift",
  "sort",
  "splice",
  "unshift",
]);
const ASSIGNMENT_OPERATORS = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.AmpersandEqualsToken,
  ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.CaretEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
]);
const SCAN_PREFIXES = [
  "src/components/",
  "src/hooks/",
  "src/stores/",
  "src/lib/",
  "src/workers/",
  "packages/editor-ui/",
];
const SCAN_PATTERNS = [/^apps\/[^/]+\/src\//];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

function shouldScan(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (!SOURCE_EXTENSIONS.has(path.extname(normalized))) return false;
  if (
    normalized.includes("/__tests__/") ||
    normalized.endsWith(".test.ts") ||
    normalized.endsWith(".test.tsx") ||
    normalized.endsWith(".d.ts")
  ) {
    return false;
  }
  return (
    SCAN_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    SCAN_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function compactText(sourceFile, node) {
  return node.getText(sourceFile).replace(/\s+/g, " ").slice(0, 180);
}

function isPropertyLike(node) {
  return ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node);
}

function propertyDepth(node) {
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return 1 + propertyDepth(node.expression);
  }
  return 0;
}

function signatureFor(relativePath, sourceFile, node, kind) {
  const text = compactText(sourceFile, node);
  return {
    kind,
    line: lineOf(sourceFile, node),
    path: relativePath,
    signature: `${relativePath}:${kind}:${text}`,
    text,
  };
}

function collectMutations(relativePath) {
  const text = fs.readFileSync(resolveRepoPath(relativePath), "utf8");
  const sourceFile = ts.createSourceFile(
    relativePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const entries = [];

  const visit = (node) => {
    if (
      ts.isBinaryExpression(node) &&
      ASSIGNMENT_OPERATORS.has(node.operatorToken.kind) &&
      isPropertyLike(node.left) &&
      propertyDepth(node.left) >= 1
    ) {
      entries.push(signatureFor(relativePath, sourceFile, node, "assignment"));
    }

    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      isPropertyLike(node.operand)
    ) {
      entries.push(signatureFor(relativePath, sourceFile, node, "update"));
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      MUTATING_METHODS.has(node.expression.name.text)
    ) {
      entries.push(signatureFor(relativePath, sourceFile, node, "mutating-call"));
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return entries;
}

const files = gitLsFilesIncludingUntracked()
  .filter(shouldScan)
  .sort((a, b) => a.localeCompare(b));
const entries = files
  .flatMap(collectMutations)
  .sort((a, b) => a.signature.localeCompare(b.signature));

if (writeBaseline) {
  const baseline = {
    generatedBy: "npm run check:direct-model-mutations -- --write",
    note: "Baseline of current app-layer direct mutation hotspots. Q3 refactors should reduce this list.",
    scannedPrefixes: SCAN_PREFIXES,
    version: 1,
    entries,
  };
  fs.writeFileSync(
    resolveRepoPath(baselinePath),
    `${JSON.stringify(baseline, null, 2)}\n`,
  );
  console.log(
    `[direct-model-mutations] wrote ${baselinePath} with ${entries.length} entries`,
  );
  process.exit(0);
}

if (!fs.existsSync(resolveRepoPath(baselinePath))) {
  console.error(
    `[direct-model-mutations] missing ${baselinePath}; run npm run check:direct-model-mutations -- --write after reviewing the inventory.`,
  );
  process.exit(1);
}

const baseline = readJson(baselinePath);
const expected = new Set(baseline.entries.map((entry) => entry.signature));
const actual = new Set(entries.map((entry) => entry.signature));
const unexpected = entries.filter((entry) => !expected.has(entry.signature));
const removed = baseline.entries.filter((entry) => !actual.has(entry.signature));

if (unexpected.length > 0) {
  console.error("[direct-model-mutations] new unreviewed mutation hotspots:");
  for (const entry of unexpected.slice(0, 50)) {
    console.error(`- ${entry.path}:${entry.line} ${entry.kind}: ${entry.text}`);
  }
  if (unexpected.length > 50) {
    console.error(`...and ${unexpected.length - 50} more`);
  }
  process.exit(1);
}

if (removed.length > 0) {
  console.log(
    `[direct-model-mutations] ${removed.length} baseline entries were removed; refresh the baseline after reviewing the refactor.`,
  );
}

console.log(`[direct-model-mutations] passed (${entries.length} baseline entries)`);
