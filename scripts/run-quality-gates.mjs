import { spawnSync } from "node:child_process";

const includeCoverage = process.argv.includes("--coverage");
const includeE2eSmoke = process.argv.includes("--e2e-smoke");
const includeE2eWorkflows = process.argv.includes("--e2e-workflows");
const recordE2eWorkflows = process.argv.includes("--e2e-workflow-record");

const commands = [
  ["npx", ["tsc", "--noEmit"]],
  ["npm", ["run", "check:packages-types"]],
  ["npm", ["run", "check:workspace-layout"]],
  ["npm", ["run", "check:docs-architecture"]],
  ["npm", ["run", "check:task-guide-paths"]],
  ["npm", ["run", "check:task-guide-gates"]],
  ["npm", ["run", "check:pr-recipe-gates"]],
  ["npm", ["run", "check:troubleshooting-content"]],
  ["npm", ["run", "check:content-safety-integrity"]],
  ["npm", ["run", "check:escalation-template"]],
  ["npm", ["run", "docs:user:check"]],
  ["npm", ["run", "docs:user:check:release"]],
  ["npm", ["run", "docs:media:check"]],
  ["npm", ["run", "check:docs-public-surface"]],
  ["npm", ["run", "check:quality-gate-drift"]],
  ["npm", ["run", "check:e2e-project-coverage"]],
  ["npm", ["run", includeCoverage ? "test:coverage" : "test"]],
  ["npm", ["run", "i18n:check:all"]],
  ["npm", ["run", "check:ipc-contract"]],
  ["npm", ["run", "check:ipc-contract-sync"]],
  ["npm", ["run", "check:ip-markers"]],
  ["npm", ["run", "check:ip-product-profile"]],
  ["npm", ["run", "check:local-motion-marker-catalogs"]],
  ["npm", ["run", "check:local-motion-private-markers"]],
  ["npm", ["run", "check:local-motion-worker-fixtures"]],
  ["npm", ["run", "check:clean-room-coverage"]],
  ["npm", ["run", "check:auto-setup-ip-compliance"]],
  ["npm", ["run", "check:architecture-boundaries"]],
  ["npm", ["run", "check:direct-model-mutations"]],
  ["npm", ["run", "check:ui-module-budget"]],
  ["npm", ["run", "check:import-cycles"]],
  ["npm", ["run", "check:license-policy"]],
  ["npm", ["run", "check:secrets"]],
  ["npm", ["run", "check:history-secrets"]],
  ["npm", ["run", "check:source-comments"]],
  ["npm", ["run", "check:viewer-mediapipe-assets"]],
  ["npm", ["run", "check:viewer-tests"]],
  ["npm", ["run", "check:provider-conformance"]],
  ["npm", ["run", "check:provider-sdk-samples"]],
  ["npm", ["run", "check:samples-public-surface"]],
  ["npm", ["run", "check:core-model-current-fixtures"]],
  ["npm", ["run", "check:model-fixtures"]],
  ["npm", ["run", "check:viewer-api-samples"]],
  ["npm", ["run", "check:samples:static"]],
  ["npm", ["run", "check:viewer-api-contracts"]],
  ["npm", ["run", "check:viewer-api-e2e"]],
  ["npm", ["run", "check:security-patterns"]],
  ["npm", ["run", "check:package-boundaries"]],
  ["npm", ["run", "check:sdk-unlock:web", "--", "--self-only"]],
  ["npm", ["run", "check:publication-history"]],
  ["npm", ["run", "check:hosted-release-surfaces"]],
  ["npm", ["run", "check:workflow-artifact-safety"]],
  ["npm", ["run", "check:source-review-archive"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "build:packages"]],
  ["npm", ["run", "check:bundle"]],
  ["npm", ["run", "check:pack-contents"]],
  ["npm", ["run", "check:release-surface"]],
  ["npm", ["run", "check:runtime-c-abi"]],
  ["npm", ["run", "check:runtime-c-abi-link"]],
  ["npm", ["run", "check:runtime-native"]],
  ["npm", ["run", "check:native-artifact-policy"]],
  ["npm", ["run", "test:runtime-wasm:browser"]],
  ["npm", ["run", "notices:check"]],
  ["npm", ["run", "check:sbom"]],
  ["npm", ["run", "audit:all"]],
  ["npm", ["run", "audit:prod"]],
  ["npm", ["run", "check:npm-token-hygiene"]],
  ["npm", ["run", "check:environment-protection"]],
  ["npm", ["run", "check:web-npm-alpha-release"]],
  ["npm", ["run", "check:oss-readiness"]],
];

if (includeE2eSmoke) {
  commands.push(["npm", ["run", "test:e2e:smoke"]]);
}

if (recordE2eWorkflows) {
  commands.push(["npm", ["run", "test:e2e:workflow-record"]]);
} else if (includeE2eWorkflows) {
  commands.push(["npm", ["run", "test:e2e:workflows"]]);
}

for (const [command, args] of commands) {
  console.log(`\n[quality] ${command} ${args.join(" ")}`);
  const result =
    process.platform === "win32"
      ? spawnSync([command, ...args].map(quoteShellArg).join(" "), {
          shell: true,
          stdio: "inherit",
        })
      : spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\n[quality] passed");

function quoteShellArg(value) {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}
