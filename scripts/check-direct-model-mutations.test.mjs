import fs from "node:fs";
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
});
