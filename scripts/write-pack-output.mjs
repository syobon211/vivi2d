import crypto from "node:crypto";
import fs from "node:fs";
import { readSinglePackEntry } from "./lib/npm-pack-result.mjs";

const args = parseArgs(process.argv.slice(2));
const packResultPath = args["pack-result"];
if (!packResultPath) {
  console.error("[write-pack-output] --pack-result is required.");
  process.exit(1);
}

let entry;
try {
  entry = readSinglePackEntry(packResultPath);
} catch (error) {
  console.error(
    `[write-pack-output] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
const filename = entry.filename;
if (!filename || !fs.existsSync(filename)) {
  console.error(`[write-pack-output] packed tarball is missing: ${filename}`);
  process.exit(1);
}

const bytes = fs.readFileSync(filename);
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");

console.log(`filename=${filename}`);
console.log(`sha256=${sha256}`);
console.log(`size=${bytes.byteLength}`);
if (entry.integrity) console.log(`integrity=${entry.integrity}`);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    parsed[arg.slice(2)] = argv[index + 1];
    index += 1;
  }
  return parsed;
}
