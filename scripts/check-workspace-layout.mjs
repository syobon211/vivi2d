import fs from "node:fs";
import path from "node:path";
import { exists, readJson, repoRoot } from "./lib/repo.mjs";

const root = repoRoot;
const packageJson = readJson("package.json");
const failures = [];

for (const workspace of packageJson.workspaces ?? []) {
  if (typeof workspace !== "string") {
    failures.push(`workspace entry must be a string: ${JSON.stringify(workspace)}`);
    continue;
  }

  if (!workspace.endsWith("/*")) continue;

  const baseDir = workspace.slice(0, -2);
  const absoluteBaseDir = path.join(root, baseDir);

  if (!fs.existsSync(absoluteBaseDir)) {
    failures.push(`${workspace}: base directory does not exist`);
    continue;
  }

  const packageDirs = fs
    .readdirSync(absoluteBaseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(baseDir, entry.name))
    .filter((dir) => exists(path.join(dir, "package.json")));

  if (workspace === "apps/*" && packageDirs.length === 0) {
    failures.push("apps/* workspace requires at least one app package.json");
  }
}

if (failures.length > 0) {
  console.error("[workspace-layout] failed");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("[workspace-layout] passed");
