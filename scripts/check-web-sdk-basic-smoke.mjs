import { spawnSync } from "node:child_process";

const commands = [
  ["npm", ["run", "build:fixtures", "--", "--check"]],
  ["npm", ["run", "build", "--workspace", "@vivi2d/web"]],
  ["npx", ["playwright", "test", "-c", "examples/web-sdk-basic/playwright.config.ts"]],
];

for (const [command, args] of commands) {
  const result =
    process.platform === "win32"
      ? spawnSync([command, ...args].map(quoteShellArg).join(" "), {
          encoding: "utf8",
          shell: true,
          stdio: "inherit",
        })
      : spawnSync(command, args, { encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("[web-sdk-samples:smoke] passed");

function quoteShellArg(value) {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}
