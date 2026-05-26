import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();

run("npm", ["run", "build", "--workspace", "@vivi2d/viewer-api-client"]);
run("npx", [
  "playwright",
  "test",
  "-c",
  "examples/viewer-api-browser-client/playwright.config.ts",
]);

console.log("[viewer-api-browser-sample-smoke] passed");

function run(command, args) {
  const result =
    process.platform === "win32"
      ? spawnSync([command, ...args].map(quoteShellArg).join(" "), {
          cwd: repoRoot,
          encoding: "utf8",
          shell: true,
          stdio: "inherit",
        })
      : spawnSync(command, args, {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: "inherit",
        });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function quoteShellArg(value) {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}
