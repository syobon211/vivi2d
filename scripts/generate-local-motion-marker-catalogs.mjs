import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");

const contractPath = "scripts/internal-contracts/local-motion-forbidden-markers.contract.json";
const contract = readJson(contractPath);

assertContract(contract);

const generated = new Map([
  [
    "packages/model/src/generated/private-local-motion-markers.ts",
    renderModelCatalog(contract),
  ],
  [
    "packages/provider-sdk/src/generated/private-local-motion-markers.ts",
    renderProviderCatalog(contract),
  ],
  ["scripts/generated/local-motion-marker-scan-catalog.json", renderScannerCatalog(contract)],
]);

let driftFound = false;
for (const [relativePath, content] of generated) {
  const absolutePath = path.join(root, relativePath);
  if (checkOnly) {
    const current = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
    if (current !== content) {
      console.error(`[local-motion-marker-catalogs] ${relativePath} is out of date`);
      driftFound = true;
    }
    continue;
  }
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

if (driftFound) {
  console.error(
    "[local-motion-marker-catalogs] run npm run generate:local-motion-marker-catalogs",
  );
  process.exit(1);
}

console.log(
  checkOnly
    ? "[local-motion-marker-catalogs] generated catalogs are current"
    : "[local-motion-marker-catalogs] generated catalogs updated",
);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function assertContract(value) {
  if (!value || typeof value !== "object") {
    throw new Error(`${contractPath} must be a JSON object`);
  }
  if (value.schemaVersion !== 1) {
    throw new Error(`${contractPath} schemaVersion must be 1`);
  }
  assertPartList(value.model?.rawKeyParts, "model.rawKeyParts");
  assertPartList(value.model?.kindOrTypeParts, "model.kindOrTypeParts");
  assertPartList(value.model?.highSignalStringParts, "model.highSignalStringParts");
  assertStringList(value.provider?.forbiddenKeys, "provider.forbiddenKeys");
  assertPartList(value.provider?.forbiddenMarkerParts, "provider.forbiddenMarkerParts");
  assertPartList(value.scanner?.payloadMarkerParts, "scanner.payloadMarkerParts");
}

function assertPartList(value, label) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some(
      (parts) =>
        !Array.isArray(parts) ||
        parts.length === 0 ||
        parts.some((part) => typeof part !== "string" || part.length === 0),
    )
  ) {
    throw new Error(`${contractPath} ${label} must be a non-empty string[][]`);
  }
}

function assertStringList(value, label) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((entry) => typeof entry !== "string" || entry.length === 0)
  ) {
    throw new Error(`${contractPath} ${label} must be a non-empty string[]`);
  }
}

function renderModelCatalog(value) {
  const rawKeyParts = normalizePartList(value.model.rawKeyParts, "model.rawKeyParts");
  const kindOrTypeParts = normalizePartList(
    value.model.kindOrTypeParts,
    "model.kindOrTypeParts",
  );
  const highSignalStringParts = normalizePartList(
    value.model.highSignalStringParts,
    "model.highSignalStringParts",
  );
  return `${header()}
const privatePreviewMarker = (...parts: string[]) => parts.join("");

${renderPartsArray("MODEL_FORBIDDEN_RAW_KEYS", rawKeyParts)}

${renderPartsArray("MODEL_FORBIDDEN_KIND_OR_TYPE", kindOrTypeParts)}

${renderPartsArray("MODEL_HIGH_SIGNAL_STRING_MARKERS", highSignalStringParts)}
`;
}

function renderProviderCatalog(value) {
  const forbiddenKeys = normalizeStringList(
    value.provider.forbiddenKeys,
    "provider.forbiddenKeys",
  );
  const forbiddenMarkerParts = normalizePartList(
    value.provider.forbiddenMarkerParts,
    "provider.forbiddenMarkerParts",
  );
  return `${header()}
const privatePreviewMarker = (...parts: string[]) => parts.join("");

export const PROVIDER_LOCAL_MOTION_FORBIDDEN_KEYS = new Set<string>([
${forbiddenKeys.map((key) => `  ${JSON.stringify(key)},`).join("\n")}
]);

${renderPartsArray(
  "PROVIDER_LOCAL_MOTION_FORBIDDEN_MARKERS",
  forbiddenMarkerParts,
)}
`;
}

function renderScannerCatalog(value) {
  const payloadMarkers = normalizePartList(
    value.scanner.payloadMarkerParts,
    "scanner.payloadMarkerParts",
  ).map((parts) => parts.join(""));
  return `${JSON.stringify(
    {
      schemaVersion: value.schemaVersion,
      sourceContract: contractPath,
      payloadMarkers,
    },
    null,
    2,
  )}\n`;
}

function renderPartsArray(name, entries) {
  return `export const ${name} = Object.freeze([
${entries.map((parts) => `  privatePreviewMarker(${parts.map((part) => JSON.stringify(part)).join(", ")}),`).join("\n")}
]) as readonly string[];`;
}

function normalizePartList(entries, label) {
  const seen = new Set();
  const normalized = [];
  for (const parts of entries) {
    const joined = parts.join("");
    const key = joined;
    if (seen.has(key)) {
      throw new Error(`${contractPath} ${label} contains duplicate marker ${joined}`);
    }
    seen.add(key);
    normalized.push(parts);
  }
  return normalized.sort((first, second) =>
    compareCodePointStrings(first.join(""), second.join("")),
  );
}

function normalizeStringList(entries, label) {
  const seen = new Set();
  const normalized = [];
  for (const entry of entries) {
    const key = entry;
    if (seen.has(key)) {
      throw new Error(`${contractPath} ${label} contains duplicate entry ${entry}`);
    }
    seen.add(key);
    normalized.push(entry);
  }
  return normalized.sort(compareCodePointStrings);
}

function compareCodePointStrings(first, second) {
  if (first < second) return -1;
  if (first > second) return 1;
  return 0;
}

function header() {
  return `// This file is generated by scripts/generate-local-motion-marker-catalogs.mjs.
// Do not edit it directly. Update ${contractPath} instead.
`;
}
