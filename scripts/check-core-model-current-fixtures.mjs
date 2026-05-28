import { spawnSync } from "node:child_process";
import { repoRoot } from "./lib/repo.mjs";

const fixtureTests = [
  "packages/model/src/__tests__/entrypoints.test.ts",
  "packages/core/src/__tests__/integration-v5-roundtrip.test.ts",
  "packages/core/src/__tests__/integration-vivid-parser.test.ts",
  "packages/core/src/__tests__/ip-product-profile.test.ts",
  "packages/core/src/__tests__/project-parser.test.ts",
  "packages/core/src/__tests__/project-schema.import-metadata.test.ts",
  "packages/core/src/__tests__/project-schema.source-kind.test.ts",
  "packages/core/src/__tests__/runtime.test.ts",
  "packages/core/src/__tests__/semantic-role-source-roundtrip.test.ts",
  "packages/core/src/__tests__/type-guards.test.ts",
  "packages/core/src/__tests__/vivib-format.test.ts",
  "packages/core/src/__tests__/vivid-format.test.ts",
];

const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npx";
const args =
  process.platform === "win32"
    ? ["/d", "/s", "/c", "npx", "vitest", "run", ...fixtureTests, "--no-coverage"]
    : ["vitest", "run", ...fixtureTests, "--no-coverage"];

const result = spawnSync(command, args, {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("[core-model-current-fixtures] passed");
