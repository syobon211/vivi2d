import { spawnSync } from "node:child_process";

const commands = [
  ["npm", ["run", "check:" + "local-" + "motion-marker-catalogs"]],
  ["npm", ["run", "check:" + "local-" + "motion-private-markers"]],
  ["npm", ["run", "check:clean-room-coverage"]],
  ["npm", ["run", "check:ip-product-profile"]],
  ["npm", ["run", "check:docs-public-surface"]],
];

const requiredGateScripts = [
  "check:" + "local-" + "motion-marker-catalogs",
  "check:" + "local-" + "motion-private-markers",
  "check:clean-room-coverage",
  "check:ip-product-profile",
  "check:docs-public-surface",
];

const listedGateScripts = commands
  .filter(([command, args]) => command === "npm" && args[0] === "run")
  .map(([, args]) => args[1]);

if (process.argv.includes("--list")) {
  console.log(JSON.stringify({ scripts: listedGateScripts }, null, 2));
  process.exit(0);
}

for (const script of requiredGateScripts) {
  if (!listedGateScripts.includes(script)) {
    console.error(`[auto-setup-ip-compliance] missing wrapped gate: ${script}`);
    process.exit(1);
  }
}

for (const [command, args] of commands) {
  console.log(`[auto-setup-ip-compliance] ${command} ${args.join(" ")}`);
  const result =
    process.platform === "win32"
      ? spawnSync([command, ...args].map(quoteShellArg).join(" "), {
          shell: true,
          stdio: "inherit",
        })
      : spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("[auto-setup-ip-compliance] passed");

function quoteShellArg(value) {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}
