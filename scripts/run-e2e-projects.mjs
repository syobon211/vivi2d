import { spawnSync } from "node:child_process";

const FULL_PROJECTS = [
  "full-a11y",
  "full-rig",
  "full-editor",
  "full-io",
  "full-animation",
  "full-dialogs",
  "full-integrations",
  "full-misc",
];
const WORKFLOW_PROJECTS = ["workflow-auto-setup"];
const DEFAULT_PROJECTS = [
  "smoke",
  ...WORKFLOW_PROJECTS,
  "visual",
  "perf",
  ...FULL_PROJECTS,
];
const PROJECT_ALIASES = new Map([
  ["full", FULL_PROJECTS],
  ["workflows", WORKFLOW_PROJECTS],
]);
const VALID_PROJECTS = new Set([...DEFAULT_PROJECTS, ...PROJECT_ALIASES.keys()]);

const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";

function printUsage() {
  console.log(`Usage: node scripts/run-e2e-projects.mjs [options] [-- <playwright args>]

Options:
  --project=<name>       Run one project. Use full to run all full-* splits.
  --projects=a,b         Run a comma-separated list of projects.
  --no-build             Skip npm run build:e2e.
  --record               Record workflow project videos as Playwright .webm artifacts.

Examples:
  npm run test:e2e
  npm run test:e2e:full
  npm run test:e2e:workflows -- --record
  npm run test:e2e -- --project=smoke --headed
  npm run test:e2e -- --project=full-rig e2e/specs/auto-setup-workflow.spec.ts`);
}

function run(command, args) {
  const isWindows = process.platform === "win32";
  const result = spawnSync(
    isWindows ? "cmd.exe" : command,
    isWindows ? ["/d", "/s", "/c", command, ...args] : args,
    {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: "inherit",
    },
  );

  if (result.error) {
    console.error(result.error.message);
    return 1;
  }

  return result.status ?? 1;
}

function parseArgs(argv) {
  const projects = [];
  const playwrightArgs = [];
  let shouldBuild = true;
  let recordWorkflows = false;
  let passthrough = false;

  for (const arg of argv) {
    if (passthrough) {
      playwrightArgs.push(arg);
      continue;
    }

    if (arg === "--") {
      passthrough = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (arg === "--no-build") {
      shouldBuild = false;
    } else if (arg === "--record") {
      recordWorkflows = true;
    } else if (arg.startsWith("--project=")) {
      projects.push(arg.slice("--project=".length));
    } else if (arg.startsWith("--projects=")) {
      projects.push(
        ...arg
          .slice("--projects=".length)
          .split(",")
          .map((project) => project.trim())
          .filter(Boolean),
      );
    } else {
      playwrightArgs.push(arg);
    }
  }

  const requestedProjects = projects.length > 0 ? projects : DEFAULT_PROJECTS;
  for (const project of requestedProjects) {
    if (!VALID_PROJECTS.has(project)) {
      console.error(`Unknown E2E project: ${project}`);
      printUsage();
      process.exit(1);
    }
  }
  const selectedProjects = requestedProjects.flatMap(
    (project) => PROJECT_ALIASES.get(project) ?? [project],
  );

  return {
    projects: [...new Set(selectedProjects)],
    playwrightArgs,
    recordWorkflows,
    shouldBuild,
  };
}

const { projects, playwrightArgs, recordWorkflows, shouldBuild } = parseArgs(
  process.argv.slice(2),
);

if (recordWorkflows) {
  process.env.VIVI2D_RECORD_E2E_WORKFLOWS = "1";
}

if (shouldBuild) {
  console.log("\n[e2e] Building once for all selected projects...\n");
  const buildStatus = run(npmBin, ["run", "build:e2e"]);
  if (buildStatus !== 0) {
    process.exit(buildStatus);
  }
}

const failures = [];
for (const project of projects) {
  console.log(`\n[e2e] Running Playwright project: ${project}\n`);
  const status = run(npxBin, [
    "playwright",
    "test",
    "--config=e2e/playwright.config.ts",
    `--project=${project}`,
    ...playwrightArgs,
  ]);
  if (status !== 0) {
    failures.push({ project, status });
  }
}

if (failures.length > 0) {
  console.error(
    `\n[e2e] Failed projects: ${failures
      .map(({ project, status }) => `${project}(${status})`)
      .join(", ")}`,
  );
  process.exit(failures[0].status);
}

console.log(`\n[e2e] Completed projects: ${projects.join(", ")}`);
