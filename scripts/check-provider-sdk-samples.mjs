import { spawnSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const sampleRoots = [
  path.join(repoRoot, "examples", "provider-sdk-layer-proposals"),
  path.join(repoRoot, "examples", "provider-sdk-adapter-template"),
];
const layerProposalRoot = sampleRoots[0];
const adapterTemplateRoot = sampleRoots[1];
const failures = [];
const expectedArtifactKindsByFile = new Map([
  [path.join(layerProposalRoot, "mask-proposal.mjs"), ["maskProposal"]],
  [path.join(layerProposalRoot, "alpha-matte.mjs"), ["alphaMatte"]],
  [path.join(layerProposalRoot, "underpaint.mjs"), ["underpaint", "qualityReport"]],
]);
const conformanceSmokeFiles = [path.join(adapterTemplateRoot, "conformance-smoke.mjs")];

await assertStaticSampleBoundary();
run("npm", ["run", "build", "--workspace", "@vivi2d/provider-sdk"]);
for (const [file, expectedArtifactKinds] of expectedArtifactKindsByFile) {
  const output = run("node", [file], {
    captureOutput: true,
  });
  assertSafeSummaryOutput(file, output, expectedArtifactKinds);
}
for (const file of conformanceSmokeFiles) {
  const output = run("node", [file], { captureOutput: true });
  assertSafeConformanceOutput(file, output);
}

if (failures.length > 0) {
  console.error("[provider-sdk-samples] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[provider-sdk-samples] passed");

async function assertStaticSampleBoundary() {
  for (const sampleRoot of sampleRoots) {
    for await (const file of walk(sampleRoot)) {
      const relative = path.relative(repoRoot, file).replaceAll(path.sep, "/");
      const source = await readFile(file, "utf8");
      if (!/\.(?:mjs|md|json)$/.test(file)) continue;
      if (/https?:\/\//i.test(source)) {
        failures.push(`${relative} must not reference remote services or assets.`);
      }
      if (
        /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|bearer\s+[A-Za-z0-9._~+/=-]+|client[_-]?secret|password)\b/i.test(
          source,
        )
      ) {
        failures.push(`${relative} contains credential-like sample text.`);
      }
      if (/\b(?:Live2D|Cubism|VTube\s*Studio)\b/i.test(source)) {
        failures.push(`${relative} must not make third-party product claims.`);
      }
      if (!file.endsWith(".mjs")) continue;
      for (const specifier of extractImportSpecifiers(source)) {
        if (specifier.startsWith(".")) {
          const resolved = path.resolve(path.dirname(file), specifier);
          const relativeToSample = path.relative(sampleRoot, resolved);
          if (relativeToSample.startsWith("..") || path.isAbsolute(relativeToSample)) {
            failures.push(
              `${relative} must not import files outside the provider sample directory (${specifier}).`,
            );
          }
          continue;
        }
        if (!allowedProviderSampleImports(sampleRoot).has(specifier)) {
          failures.push(
            `${relative} imports ${specifier}; provider samples must use only public SDK entries.`,
          );
        }
      }
    }
  }
}

function assertSafeSummaryOutput(file, output, expectedArtifactKinds) {
  const fileName = path.relative(repoRoot, file).replaceAll(path.sep, "/");
  if (/"data"\s*:|"path"\s*:|"sha256"\s*:|"requestToken"\s*:/i.test(output)) {
    failures.push(`${fileName} printed raw artifact payload or private locator fields.`);
  }
  if (/\b(?:token|secret|password|bearer)\b/i.test(output)) {
    failures.push(`${fileName} printed credential-like text.`);
  }

  let summary;
  try {
    summary = JSON.parse(output);
  } catch (error) {
    failures.push(`${fileName} did not print a JSON summary: ${error.message}`);
    return;
  }

  assertArrayEquals(
    summary.artifactKinds,
    expectedArtifactKinds,
    `${fileName} artifactKinds`,
  );
  if (!summary.provenance?.providerId?.startsWith("example-")) {
    failures.push(`${fileName} summary should include the example provider provenance.`);
  }
  if (summary.warningCount !== 0) {
    failures.push(`${fileName} should not emit warnings in the deterministic sample.`);
  }
  if (!Array.isArray(summary.artifacts)) {
    failures.push(`${fileName} summary artifacts must be an array.`);
    return;
  }

  for (const artifact of summary.artifacts) {
    if (typeof artifact.byteLength !== "number" || artifact.byteLength <= 0) {
      failures.push(`${fileName} artifact ${artifact.id} has an invalid byteLength.`);
    }
    if ("data" in artifact || "path" in artifact || "sha256" in artifact) {
      failures.push(`${fileName} artifact ${artifact.id} leaked raw payload fields.`);
    }
    const metadata = artifact.metadata ?? {};
    const semantic = String(metadata.semantic ?? "").toLowerCase();
    if (["face", "eye", "eyes", "mouth"].includes(semantic)) {
      failures.push(`${fileName} proposed protected semantic ${semantic}.`);
    }
    if (artifact.kind === "underpaint" && metadata.provenance !== "generatedHidden") {
      failures.push(`${fileName} underpaint must keep generatedHidden provenance.`);
    }
  }
}

function assertSafeConformanceOutput(file, output) {
  const fileName = path.relative(repoRoot, file).replaceAll(path.sep, "/");
  if (/"data"\s*:|"path"\s*:|"sha256"\s*:|"requestToken"\s*:/i.test(output)) {
    failures.push(`${fileName} printed raw artifact payload or private locator fields.`);
  }
  if (/\b(?:token|secret|password|bearer)\b/i.test(output)) {
    failures.push(`${fileName} printed credential-like text.`);
  }
  let summary;
  try {
    summary = JSON.parse(output);
  } catch (error) {
    failures.push(
      `${fileName} did not print a JSON conformance summary: ${error.message}`,
    );
    return;
  }
  if (summary.providerId !== "example-adapter-template-provider") {
    failures.push(`${fileName} reported an unexpected providerId.`);
  }
  if (summary.caseCount !== 1 || summary.cases?.[0]?.artifactCount !== 1) {
    failures.push(`${fileName} did not run the expected template conformance case.`);
  }
  if (summary.cases?.[0]?.warningCount !== 0) {
    failures.push(`${fileName} should not emit warnings in the template smoke.`);
  }
  const allowedCaseKeys = new Set(["name", "artifactCount", "warningCount"]);
  for (const [key] of Object.entries(summary.cases?.[0] ?? {})) {
    if (!allowedCaseKeys.has(key)) {
      failures.push(`${fileName} printed non-summary conformance case field: ${key}.`);
    }
  }
}

function allowedProviderSampleImports(sampleRoot) {
  const imports = new Set([
    "@vivi2d/provider-sdk",
    "@vivi2d/provider-sdk/invocation",
  ]);
  if (sampleRoot === adapterTemplateRoot) {
    imports.add("@vivi2d/provider-sdk/testing");
  }
  return imports;
}

function assertArrayEquals(actual, expected, label) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    failures.push(
      `${label} expected ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}.`,
    );
    return;
  }
  for (const [index, value] of expected.entries()) {
    if (actual[index] !== value) {
      failures.push(
        `${label} expected ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}.`,
      );
      return;
    }
  }
}

function extractImportSpecifiers(source) {
  const specifiers = [];
  const importFromPattern = /\bimport\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(importFromPattern)) specifiers.push(match[1]);
  for (const match of source.matchAll(dynamicImportPattern)) specifiers.push(match[1]);
  return specifiers;
}

function run(command, args, options = {}) {
  const result =
    process.platform === "win32"
      ? spawnSync([command, ...args].map(quoteShellArg).join(" "), {
          cwd: repoRoot,
          encoding: "utf8",
          shell: true,
          stdio: options.captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
        })
      : spawnSync(command, args, {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: options.captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
        });
  if (result.status !== 0) {
    if (options.captureOutput) {
      console.error(result.stdout);
      console.error(result.stderr);
    }
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

function quoteShellArg(value) {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}

async function* walk(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else if ((await stat(fullPath)).isFile()) {
      yield fullPath;
    }
  }
}
