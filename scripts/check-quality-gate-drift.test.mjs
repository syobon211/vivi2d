import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "vitest";
import { repoRoot } from "./lib/repo.mjs";

const temporaryRoots = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vivi-quality-drift-"));
  temporaryRoots.push(root);
  for (const relative of [
    "scripts/check-quality-gate-drift.mjs",
    "scripts/run-quality-gates.mjs",
    "scripts/lib/repo.mjs",
    "scripts/quality-gate-manifest.json",
    "package.json",
  ]) {
    const destination = path.join(root, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, relative), destination);
  }
  fs.cpSync(
    path.join(repoRoot, ".github/workflows"),
    path.join(root, ".github/workflows"),
    {
      recursive: true,
    },
  );
  return root;
}

function check(root) {
  return spawnSync(process.execPath, ["scripts/check-quality-gate-drift.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
}

function updateManifest(root, mutate) {
  const file = path.join(root, "scripts/quality-gate-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  mutate(manifest);
  fs.writeFileSync(file, JSON.stringify(manifest));
}

test("actual default and optional local gates are all classified", () => {
  const result = check(fixture());
  assert.equal(result.status, 0, result.stderr);
});

test("detects local gates omitted from the manifest in both directions", () => {
  const root = fixture();
  updateManifest(root, (manifest) => {
    manifest.gates = manifest.gates.filter(
      (gate) =>
        !["check:provider-sdk-samples", "test:e2e:workflow-record"].includes(
          gate.npmScript,
        ),
    );
  });
  const result = check(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /check:provider-sdk-samples: local gate is missing/);
  assert.match(result.stderr, /test:e2e:workflow-record: local gate is missing/);
});

test("detects a newly added runner command without executing it", () => {
  const root = fixture();
  const file = path.join(root, "scripts/run-quality-gates.mjs");
  fs.writeFileSync(
    file,
    fs
      .readFileSync(file, "utf8")
      .replace(
        "const commands = [",
        'const commands = [["npm", ["run", "check:unclassified-fixture"]],',
      ),
  );
  const result = check(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /check:unclassified-fixture: local gate is missing/);
  assert.doesNotMatch(result.stderr, /Missing script/);
});

test("requires an explanation for explicitly non-CI split gates", () => {
  const root = fixture();
  updateManifest(root, (manifest) => {
    delete manifest.gates.find((gate) => gate.npmScript === "check:viewer-api-e2e")
      .splitReason;
  });
  const result = check(root);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /check:viewer-api-e2e: a split without CI coverage requires splitReason/,
  );
});

test("a command mentioned only in a comment is not a local gate", () => {
  const root = fixture();
  const file = path.join(root, "scripts/run-quality-gates.mjs");
  fs.writeFileSync(
    file,
    fs
      .readFileSync(file, "utf8")
      .replace(
        '["npm", ["run", "check:provider-sdk-samples"]],',
        '// ["npm", ["run", "check:provider-sdk-samples"]],',
      ),
  );
  const result = check(root);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /check:provider-sdk-samples: missing from scripts\/run-quality-gates/,
  );
});

test("a longer CI command cannot satisfy a missing shorter gate", () => {
  const root = fixture();
  const file = path.join(root, ".github/workflows/quality-gates.yml");
  fs.writeFileSync(
    file,
    fs.readFileSync(file, "utf8").replace(/^\s*- run: npm run build\r?\n/m, ""),
  );
  const result = check(root);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /npm run build: missing from \.github\/workflows\/quality-gates.yml/,
  );
});

for (const script of [
  "check-secret-redaction.test.mjs",
  "check-tooling-hardening.test.mjs",
]) {
  test(`keeps ${script} in CI lint coverage`, () => {
    const root = fixture();
    const file = path.join(root, ".github/workflows/quality-gates.yml");
    fs.writeFileSync(
      file,
      fs.readFileSync(file, "utf8").replace(`          scripts/${script}`, ""),
    );
    const result = check(root);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(`scripts/${script}: missing from Biome lint list`));
  });
}

test.each([
  "scripts/run-release-step.mjs",
  "scripts/check-web-npm-alpha-release.mjs",
  "scripts/check-npm-token-hygiene.mjs",
  "scripts/check-environment-protection.mjs",
  "scripts/check-npm-cli-version.mjs",
  "scripts/check-release-input-version.mjs",
  "scripts/check-release-tag.mjs",
  "scripts/install-pinned-gitleaks.mjs",
  "scripts/write-pack-output.mjs",
  "scripts/record-web-npm-alpha-artifacts.mjs",
  "scripts/verify-web-npm-alpha-release-record.mjs",
  "scripts/verify-web-npm-alpha-publish.mjs",
])("requires %s in both CI lint lists", (script) => {
  const root = fixture();
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "scripts/quality-gate-manifest.json"), "utf8"),
  );
  assert.equal(
    manifest.lintCoverage.requiredScripts.filter((entry) => entry === script).length,
    1,
    `${script}: must be registered exactly once in requiredScripts`,
  );
  for (const workflowPath of [
    ".github/workflows/quality-gates.yml",
    ".github/workflows/test-matrix.yml",
  ]) {
    assert.ok(manifest.lintCoverage.workflows.includes(workflowPath));
    const file = path.join(root, workflowPath);
    const original = fs.readFileSync(file, "utf8");
    const lines = original.split(/\r?\n/);
    assert.equal(lines.filter((line) => line.trim() === script).length, 1);
    try {
      fs.writeFileSync(file, lines.filter((line) => line.trim() !== script).join("\n"));
      const result = check(root);
      assert.equal(result.status, 1);
      assert.ok(
        result.stderr.includes(
          `${script}: missing from Biome lint list in ${workflowPath}`,
        ),
      );
    } finally {
      fs.writeFileSync(file, original);
    }
  }
});
