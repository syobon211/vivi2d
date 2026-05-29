import { spawnSync } from "node:child_process";

const suspiciousPathPattern =
  /(^|[/\\])(\.env(\..*)?|id_rsa|id_dsa|id_ed25519|.*\.(pem|p12|pfx|key|crt|cer|ovpn|kdbx)|secrets?|credentials?|private[-_]?keys?)([/\\].*)?$/i;
const privateAssetPattern =
  /(^|[/\\])(models|weights|checkpoints|private-assets|proprietary|third[-_ ]party)([/\\]|$)|\.(ckpt|safetensors|onnx|pt|pth)$/i;
const generatedMediaPattern = /\.(mp4|mov|webm|wav|mp3|ogg)$/i;
const zundamonPattern = /(zundamon|zunmon|zunda|\u305a\u3093\u3060|\u7e3a\u58f9\uff53)/i;
const lockedMediapipeModelPattern =
  /(^|[/\\])packages[/\\]viewer[/\\]public[/\\]vendor[/\\]mediapipe[/\\]tasks-vision-0\.10\.35[/\\]models[/\\](?:face_landmarker|hand_landmarker|pose_landmarker_lite)\.task$/;

function runGit(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function uniqueSorted(lines) {
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))].sort();
}

const allHistoricalPaths = uniqueSorted(
  runGit(["log", "--all", "--name-only", "--pretty=format:"]).split(/\r?\n/),
);

const failures = [];
const warnings = [];

for (const filePath of allHistoricalPaths) {
  if (lockedMediapipeModelPattern.test(filePath)) {
    continue;
  }
  if (suspiciousPathPattern.test(filePath)) {
    failures.push({ kind: "secret-like path", filePath });
  } else if (privateAssetPattern.test(filePath)) {
    failures.push({ kind: "model/private-asset-like path", filePath });
  } else if (generatedMediaPattern.test(filePath)) {
    warnings.push({ kind: "generated-media path", filePath });
  } else if (zundamonPattern.test(filePath)) {
    warnings.push({ kind: "Zundamon/local character review path", filePath });
  }
}

if (warnings.length > 0) {
  console.warn("[publication-history] manual review warnings:");
  for (const finding of warnings) {
    console.warn(`- ${finding.kind}: ${finding.filePath}`);
  }
}

if (failures.length > 0) {
  console.error("[publication-history] review required:");
  for (const finding of failures) {
    console.error(`- ${finding.kind}: ${finding.filePath}`);
  }
  console.error(
    "\nThis lightweight check reviews historical file names only. Run npm run check:secrets for the current tree, then run gitleaks or trufflehog before public release, rotate any historical secrets, and re-scan after any history rewrite.",
  );
  process.exit(1);
}

console.log(
  "[publication-history] passed lightweight historical path review. Run npm run check:secrets for the current tree and gitleaks/trufflehog for full history before public release.",
);
