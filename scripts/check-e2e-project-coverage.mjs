import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_PROJECT_MANIFEST } from "../e2e/project-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const specsDir = path.join(repoRoot, "e2e", "specs");

if (!existsSync(specsDir)) {
  fail(`E2E specs directory not found: ${specsDir}`);
}

const specs = collectSpecFiles(specsDir).sort();
if (specs.length === 0) {
  fail("No E2E spec files were found.");
}

const projectSummaries = E2E_PROJECT_MANIFEST.map((project) => {
  const matches = specs.filter((spec) => projectIncludesSpec(project, spec));
  return {
    name: project.name,
    matches,
    unmatchedPatterns: getUnmatchedPatterns(project, specs),
  };
});

const uncoveredSpecs = specs.filter(
  (spec) => !projectSummaries.some((project) => project.matches.includes(spec)),
);
const emptyExplicitProjects = projectSummaries.filter(
  (project) =>
    project.name !== "full-misc" &&
    E2E_PROJECT_MANIFEST.find((candidate) => candidate.name === project.name)?.testMatch &&
    project.matches.length === 0,
);
const stalePatterns = projectSummaries.flatMap((project) =>
  project.unmatchedPatterns.map((pattern) => `${project.name}: ${pattern}`),
);

if (uncoveredSpecs.length > 0) {
  console.error("[e2e-project-coverage] uncovered specs:");
  for (const spec of uncoveredSpecs) {
    console.error(`  - ${spec}`);
  }
}

if (emptyExplicitProjects.length > 0) {
  console.error("[e2e-project-coverage] projects with no matching specs:");
  for (const project of emptyExplicitProjects) {
    console.error(`  - ${project.name}`);
  }
}

if (stalePatterns.length > 0) {
  console.error("[e2e-project-coverage] stale project patterns:");
  for (const pattern of stalePatterns) {
    console.error(`  - ${pattern}`);
  }
}

if (
  uncoveredSpecs.length > 0 ||
  emptyExplicitProjects.length > 0 ||
  stalePatterns.length > 0
) {
  process.exit(1);
}

console.log(`[e2e-project-coverage] ${specs.length} spec files covered by default projects.`);
for (const project of projectSummaries) {
  const suffix =
    project.name === "full-misc" && project.matches.length > 0
      ? ` (${project.matches.join(", ")})`
      : "";
  console.log(`  - ${project.name}: ${project.matches.length}${suffix}`);
}

function collectSpecFiles(dir) {
  const specsInDir = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__screenshots__") continue;
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      specsInDir.push(...collectSpecFiles(absolutePath));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".spec.ts")) continue;
    specsInDir.push(toSpecPath(absolutePath));
  }
  return specsInDir;
}

function toSpecPath(absolutePath) {
  return path.relative(specsDir, absolutePath).split(path.sep).join("/");
}

function projectIncludesSpec(project, spec) {
  const matchers = project.testMatch?.map(compileGlob) ?? null;
  const ignoreMatchers = project.testIgnore?.map(compileGlob) ?? [];
  const matched = matchers ? matchers.some((matcher) => matcher.test(spec)) : true;
  if (!matched) return false;
  return !ignoreMatchers.some((matcher) => matcher.test(spec));
}

function getUnmatchedPatterns(project, allSpecs) {
  return (project.testMatch ?? []).filter((pattern) => {
    const matcher = compileGlob(pattern);
    return !allSpecs.some((spec) => matcher.test(spec));
  });
}

function compileGlob(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**/", "__GLOBSTAR_SLASH__")
    .replaceAll("**", "__GLOBSTAR__")
    .replaceAll("*", "__STAR__")
    .replaceAll("__GLOBSTAR_SLASH__", "(?:.*/)?")
    .replaceAll("__GLOBSTAR__", ".*")
    .replaceAll("__STAR__", "[^/]*");
  return new RegExp(`^${escaped}$`);
}

function fail(message) {
  console.error(`[e2e-project-coverage] ${message}`);
  process.exit(1);
}
