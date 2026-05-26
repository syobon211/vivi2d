import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { repoRoot, resolveRepoPath } from "./lib/repo.mjs";

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const outputArgIndex = args.findIndex((arg) => arg === "--output" || arg === "-o");
const outputArg =
  outputArgIndex >= 0 && args[outputArgIndex + 1] ? args[outputArgIndex + 1] : undefined;

if ((args.includes("--output") || args.includes("-o")) && !outputArg) {
  throw new Error("--output requires a file path.");
}

if (checkOnly && outputArg) {
  throw new Error(
    "--check writes to tmp/sbom-check and cannot be combined with --output.",
  );
}

const cyclonedxCli = resolveRepoPath(
  "node_modules/@cyclonedx/cyclonedx-npm/bin/cyclonedx-npm-cli.js",
);

function resolveOutputPath(outputPath) {
  const resolved = path.resolve(repoRoot, outputPath);
  const relative = path.relative(repoRoot, resolved);
  if (
    relative === "" ||
    relative === "." ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`SBOM output path must stay inside the repository: ${outputPath}`);
  }
  return resolved;
}

function generateSbom(outputPath) {
  rmSync(outputPath, { force: true });
  mkdirSync(path.dirname(outputPath), { recursive: true });
  const result = spawnSync(
    process.execPath,
    [
      cyclonedxCli,
      "--package-lock-only",
      "--output-reproducible",
      "--output-format",
      "JSON",
      "--spec-version",
      "1.6",
      "--validate",
      "--output-file",
      outputPath,
      "package.json",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );

  if (result.status !== 0) {
    if (result.error) {
      console.error(`[sbom] failed to launch CycloneDX: ${result.error.message}`);
    }
    process.exit(result.status ?? 1);
  }
}

function validateSbom(outputPath) {
  const sbom = JSON.parse(readFileSync(outputPath, "utf8"));
  const failures = [];

  if (sbom.bomFormat !== "CycloneDX") {
    failures.push("SBOM must use CycloneDX format.");
  }
  if (sbom.specVersion !== "1.6") {
    failures.push(`SBOM must use CycloneDX spec 1.6, found ${sbom.specVersion}.`);
  }
  if (sbom.metadata?.component?.name !== "vivi2d") {
    failures.push("SBOM metadata must identify the root vivi2d component.");
  }
  if (!Array.isArray(sbom.components) || sbom.components.length === 0) {
    failures.push("SBOM must include dependency components.");
  }

  const componentPurls = new Set(
    (sbom.components ?? []).map((component) => component.purl).filter(Boolean),
  );
  const componentPurlList = [...componentPurls];
  for (const requiredPurlPrefix of [
    "pkg:npm/%40vivi2d/web@",
    "pkg:npm/%40cyclonedx/cyclonedx-npm@",
  ]) {
    if (!componentPurlList.some((purl) => purl.startsWith(requiredPurlPrefix))) {
      failures.push(`SBOM must include a component matching ${requiredPurlPrefix}*.`);
    }
  }

  if (failures.length > 0) {
    console.error("[sbom] failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
}

if (checkOnly) {
  const checkDir = resolveRepoPath("tmp/sbom-check");
  const firstOutput = path.join(checkDir, "first.cdx.json");
  const secondOutput = path.join(checkDir, "second.cdx.json");
  rmSync(checkDir, { recursive: true, force: true });
  generateSbom(firstOutput);
  generateSbom(secondOutput);
  validateSbom(firstOutput);
  validateSbom(secondOutput);
  if (readFileSync(firstOutput, "utf8") !== readFileSync(secondOutput, "utf8")) {
    console.error("[sbom] failed:");
    console.error("- Reproducible SBOM generation produced different output.");
    process.exit(1);
  }
  rmSync(checkDir, { recursive: true, force: true });
  console.log("[sbom] check passed");
} else {
  const outputPath = resolveOutputPath(outputArg ?? "dist/sbom/vivi2d.cdx.json");
  generateSbom(outputPath);
  validateSbom(outputPath);
  console.log(`[sbom] wrote ${path.relative(repoRoot, outputPath).replace(/\\/g, "/")}`);
}
