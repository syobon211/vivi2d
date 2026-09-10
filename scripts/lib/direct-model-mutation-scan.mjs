import path from "node:path";

export const DIRECT_MODEL_MUTATION_EXCLUDED_PATHS = Object.freeze([
  "src/lib/e2e-perf-probe.ts",
]);

export const DIRECT_MODEL_MUTATION_SCAN_PREFIXES = Object.freeze([
  "src/components/",
  "src/hooks/",
  "src/stores/",
  "src/lib/",
  "src/workers/",
  "packages/editor-ui/",
]);

const EXCLUDED_PATHS = new Set(DIRECT_MODEL_MUTATION_EXCLUDED_PATHS);
const SCAN_PATTERNS = [/^apps\/[^/]+\/src\//];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

export function shouldScanDirectModelMutationPath(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (EXCLUDED_PATHS.has(normalized)) return false;
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
    DIRECT_MODEL_MUTATION_SCAN_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    SCAN_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}
