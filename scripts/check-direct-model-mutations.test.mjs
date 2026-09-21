import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIRECT_MODEL_MUTATION_EXCLUDED_PATHS,
  shouldScanDirectModelMutationPath,
} from "./lib/direct-model-mutation-scan.mjs";
import { resolveRepoPath } from "./lib/repo.mjs";

const PERF_PROBE_PATH = "src/lib/e2e-perf-probe.ts";

describe("direct model mutation scan paths", () => {
  it("excludes E2E-only perf instrumentation without weakening production scans", () => {
    expect(DIRECT_MODEL_MUTATION_EXCLUDED_PATHS).toContain(PERF_PROBE_PATH);
    expect(shouldScanDirectModelMutationPath(PERF_PROBE_PATH)).toBe(false);
    expect(shouldScanDirectModelMutationPath("src/lib/project-loader.ts")).toBe(true);
  });

  it("keeps excluded instrumentation out of the reviewed baseline", () => {
    const baseline = JSON.parse(
      fs.readFileSync(
        resolveRepoPath("docs/developer/quality/baselines/direct-model-mutations.json"),
        "utf8",
      ),
    );

    expect(baseline.excludedPaths).toEqual(DIRECT_MODEL_MUTATION_EXCLUDED_PATHS);
    expect(baseline.entries.some((entry) => entry.path === PERF_PROBE_PATH)).toBe(false);
  });

  it("the actual CLI distinguishes unary reads from property writes", () => {
    const temporaryRoot = resolveRepoPath("tmp");
    fs.mkdirSync(temporaryRoot, { recursive: true });
    const fixtureRoot = fs.mkdtempSync(path.join(temporaryRoot, "mutation-classifier-"));
    if (
      path.dirname(fixtureRoot) !== temporaryRoot ||
      !path.basename(fixtureRoot).startsWith("mutation-classifier-")
    )
      throw new Error("Unexpected mutation fixture cleanup target");
    const run = (command, args) =>
      spawnSync(command, args, {
        cwd: fixtureRoot,
        encoding: "utf8",
        timeout: 30000,
        maxBuffer: 64 * 1024,
        windowsHide: true,
      });
    try {
      // Copy the real CLI and its path helpers unchanged: repoRoot is module-relative.
      // The fixture remains below this checkout so the actual TypeScript resolves.
      for (const source of [
        "scripts/check-direct-model-mutations.mjs",
        "scripts/lib/direct-model-mutation-scan.mjs",
        "scripts/lib/repo.mjs",
      ]) {
        const destination = path.join(fixtureRoot, source);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(resolveRepoPath(source), destination);
      }
      fs.writeFileSync(path.join(fixtureRoot, "package.json"), '{"type":"module"}\n');
      expect(run("git", ["init", "--quiet"]).status).toBe(0);
      const relative = "src/lib/classification.ts";
      const sourcePath = path.join(fixtureRoot, relative);
      const baselinePath = path.join(
        fixtureRoot,
        "docs/developer/quality/baselines/direct-model-mutations.json",
      );
      fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
      fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
      const writeBaseline = (entries) =>
        fs.writeFileSync(
          baselinePath,
          JSON.stringify({
            excludedPaths: DIRECT_MODEL_MUTATION_EXCLUDED_PATHS,
            entries,
          }),
        );
      const reads = ["!model.x;", "-model.x;", "+model.x;", '~model["flags"];'];
      fs.writeFileSync(sourcePath, `${reads.join("\n")}\n`);
      writeBaseline([]);
      const invoke = () =>
        run(process.execPath, ["scripts/check-direct-model-mutations.mjs"]);
      const readResult = invoke();
      expect(readResult.status, readResult.stderr).toBe(0);
      expect(readResult.stdout).toContain("passed (0 baseline entries)");

      const writes = [
        ["update", "++model.x"],
        ["update", "model.x++"],
        ["update", '--model["x"]'],
        ["update", 'model["x"]--'],
        ["assignment", "model.x = 1"],
        ["mutating-call", "model.items.push(1)"],
      ];
      const expected = writes.map(([kind, text], index) => ({
        kind,
        path: relative,
        line: reads.length + index + 1,
        text,
        signature: `${relative}:${kind}:${text}`,
      }));
      fs.appendFileSync(
        sourcePath,
        `${writes.map(([, text]) => `${text};`).join("\n")}\n`,
      );
      const rejected = invoke();
      expect(rejected.status).toBe(1);
      expect(rejected.stderr.trim().split(/\r?\n/)).toEqual([
        "[direct-model-mutations] new unreviewed mutation hotspots:",
        ...[...expected]
          .sort((a, b) => a.signature.localeCompare(b.signature))
          .map((entry) => `- ${relative}:${entry.line} ${entry.kind}: ${entry.text}`),
      ]);
      writeBaseline(expected);
      const accepted = invoke();
      expect(accepted.status, accepted.stderr).toBe(0);
      expect(accepted.stdout).toContain("passed (6 baseline entries)");
    } finally {
      // Never clean a repository or shared temp root; this exact child is test-owned.
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
