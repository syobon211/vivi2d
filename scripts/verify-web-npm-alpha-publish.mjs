import crypto from "node:crypto";
import fs from "node:fs";
import { readSinglePackEntry } from "./lib/npm-pack-result.mjs";

const args = parseArgs(process.argv.slice(2));
const packageName = args.package;
const version = args.version;
const packResultPath = args["pack-result"];
const runId = args["run-id"];
const failures = [];
const releaseRecordPath = "web-npm-alpha-release-record.json";

if (packageName !== "@vivi2d/web") failures.push("--package must be @vivi2d/web.");
if (!version) failures.push("--version is required.");
if (!packResultPath) failures.push("--pack-result is required.");
if (!runId) failures.push("--run-id is required.");

const packEntry = packResultPath ? safeReadSinglePackEntry(packResultPath) : null;
const localDigest =
  packEntry?.filename && fs.existsSync(packEntry.filename)
    ? sha256File(packEntry.filename)
    : null;
if (!localDigest) failures.push("Local packed tarball is required for verification.");
const releaseRecord = fs.existsSync(releaseRecordPath)
  ? JSON.parse(fs.readFileSync(releaseRecordPath, "utf8"))
  : null;
if (!releaseRecord) failures.push(`${releaseRecordPath} is required.`);

if (failures.length === 0) {
  const metadata = await readRegistryMetadata(packageName, version);
  if (metadata.version !== version)
    failures.push(`Registry returned version ${metadata.version}.`);
  if (metadata.name !== packageName)
    failures.push(`Registry returned package ${metadata.name}.`);
  if (!metadata.dist?.tarball)
    failures.push("Registry metadata is missing dist.tarball.");
  if (packEntry?.integrity && metadata.dist?.integrity !== packEntry.integrity) {
    failures.push("Registry integrity does not match local npm pack integrity.");
  }
  if (metadata.dist?.tarball) {
    const publishedBytes = await fetchBytes(metadata.dist.tarball);
    const publishedDigest = crypto
      .createHash("sha256")
      .update(publishedBytes)
      .digest("hex");
    if (publishedDigest !== localDigest) {
      failures.push("Published tarball SHA-256 does not match local release record.");
    }
  }
  try {
    const attestations = await readNpmAttestations(packageName, version);
    validateAttestations(attestations, {
      localSha256: localDigest,
      localSha512: integritySha512Hex(packEntry.integrity),
      packageName,
      releaseRecord,
      runId,
      version,
    });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}

if (failures.length > 0) {
  console.error("[web-npm-alpha-publish-verify] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[web-npm-alpha-publish-verify] passed");

function validateAttestations(
  attestations,
  { localSha256, localSha512, packageName, releaseRecord, runId, version },
) {
  if (attestations.length === 0) {
    failures.push(
      "npm did not return provenance attestations for the published package.",
    );
    return;
  }

  const payloads = attestations.flatMap(decodedAttestationPayloads);
  const combined = JSON.stringify({ attestations, payloads });
  const requiredNeedles = [
    packageName,
    version,
    releaseRecord.sourceCommit,
    releaseRecord.github?.repository,
    releaseRecord.github?.workflowRef,
    ".github/workflows/publish-web-alpha.yml",
    releaseRecord.releaseTag,
    `refs/tags/${releaseRecord.releaseTag}`,
    releaseRecord.github?.runnerEnvironment,
    runId,
  ].filter(Boolean);

  for (const needle of requiredNeedles) {
    if (!combined.includes(String(needle))) {
      failures.push(`npm provenance attestation is missing expected value: ${needle}`);
    }
  }

  const digestNeedles = [
    localSha256,
    localSha512,
    releaseRecord.tarball?.sha256,
    releaseRecord.tarball?.npmIntegrity,
  ].filter(Boolean);
  if (!digestNeedles.some((needle) => combined.includes(String(needle)))) {
    failures.push(
      "npm provenance attestation subject digest does not match the local tarball digest.",
    );
  }
}

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

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function safeReadSinglePackEntry(file) {
  try {
    return readSinglePackEntry(file);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function readRegistryMetadata(name, version) {
  const url = `https://registry.npmjs.org/${encodeNpmPackageName(name)}/${encodeURIComponent(version)}`;
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Registry metadata request failed with ${response.status}.`);
  }
  return response.json();
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Tarball download failed with ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

async function readNpmAttestations(name, version) {
  const candidates = [
    `https://registry.npmjs.org/-/npm/v1/attestations/${encodeURIComponent(`${name}@${version}`)}`,
    `https://registry.npmjs.org/-/npm/v1/attestations/${encodeNpmPackageName(name)}@${encodeURIComponent(version)}`,
  ];
  const errors = [];
  for (const url of candidates) {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (response.ok) return normalizeAttestationResponse(await response.json());
    errors.push(`${url}: HTTP ${response.status}`);
  }
  throw new Error(`Could not fetch npm attestations: ${errors.join("; ")}`);
}

function encodeNpmPackageName(name) {
  return name.split("/").map(encodeURIComponent).join("%2F");
}

function normalizeAttestationResponse(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.attestations)) return value.attestations;
  if (value?.attestation) return [value.attestation];
  return [];
}

function decodedAttestationPayloads(value) {
  const payloads = [];
  visit(value);
  return payloads;

  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (typeof node.payload === "string") {
      const decoded = decodeBase64Json(node.payload);
      if (decoded) payloads.push(decoded);
    }
    for (const child of Object.values(node)) visit(child);
  }
}

function decodeBase64Json(value) {
  try {
    const text = Buffer.from(value, "base64").toString("utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function integritySha512Hex(integrity) {
  const match = /^sha512-([A-Za-z0-9+/=]+)$/.exec(integrity ?? "");
  if (!match) return null;
  return Buffer.from(match[1], "base64").toString("hex");
}
