import { spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const failures = [];
const tag = args.tag;
const ref = args.ref;
const expectedSha = args.sha;

if (!tag) failures.push("--tag is required.");
if (!ref) failures.push("--ref is required.");
if (!expectedSha) failures.push("--sha is required.");
if (tag && ref && tag !== ref) failures.push(`Release ref ${ref} must equal tag ${tag}.`);

if (tag && !runGit(["rev-parse", "-q", "--verify", `refs/tags/${tag}^{tag}`]).ok) {
  failures.push(`${tag} must be an annotated release tag.`);
}

if (tag && expectedSha) {
  const resolved = runGit(["rev-list", "-n", "1", tag]);
  if (!resolved.ok) {
    failures.push(`Could not resolve ${tag}: ${resolved.stderr}`);
  } else if (resolved.stdout.trim() !== expectedSha.trim()) {
    failures.push(
      `${tag} resolves to ${resolved.stdout.trim()}, expected ${expectedSha}.`,
    );
  }
}

if (failures.length > 0) {
  console.error("[release-tag] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[release-tag] passed");

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

function runGit(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? result.error?.message ?? "",
  };
}
