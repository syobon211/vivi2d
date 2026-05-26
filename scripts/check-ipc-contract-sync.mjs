import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = process.cwd();
const failures = [];

const SURFACES = [
  {
    name: "editor",
    preload: "electron/preload.cjs",
    contract: "electron/ipc-contract.cjs",
  },
  {
    name: "viewer",
    preload: "packages/viewer/electron/preload.cjs",
    contract: "packages/viewer/electron/ipc-contract.cjs",
  },
];

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function collectInvokedChannels(preloadPath) {
  const text = readText(preloadPath);
  const channels = new Set();
  const invokePattern = /ipcRenderer\.invoke\(\s*["']([^"']+)["']/g;
  for (const match of text.matchAll(invokePattern)) {
    channels.add(match[1]);
  }
  return [...channels].sort();
}

function collectContractChannels(contractPath) {
  const contract = require(path.join(root, contractPath));
  if (typeof contract.listIpcChannels !== "function") {
    failures.push(`${contractPath} must export listIpcChannels().`);
    return [];
  }
  return contract.listIpcChannels();
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

for (const surface of SURFACES) {
  const invoked = collectInvokedChannels(surface.preload);
  const contracted = collectContractChannels(surface.contract);
  const missingContracts = difference(invoked, contracted);
  const unusedContracts = difference(contracted, invoked);

  if (missingContracts.length > 0) {
    failures.push(
      `${surface.name} preload invokes channels missing from contract: ${missingContracts.join(
        ", ",
      )}`,
    );
  }
  if (unusedContracts.length > 0) {
    failures.push(
      `${surface.name} contract has channels missing from preload: ${unusedContracts.join(
        ", ",
      )}`,
    );
  }
}

if (failures.length > 0) {
  console.error("[ipc-contract-sync] failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("[ipc-contract-sync] passed");
