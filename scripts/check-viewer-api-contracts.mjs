import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  VIVI_VIEWER_API_NAME,
  VIVI_VIEWER_API_VERSION,
  makeResponse,
  parseViewerApiMessage,
} = require("../packages/viewer/electron/viewer-api-schema.cjs");
const {
  createViewerApiServer,
} = require("../packages/viewer/electron/viewer-api-server.cjs");

const repoRoot = process.cwd();
const contractRoot = path.join(
  repoRoot,
  "packages",
  "viewer",
  "contracts",
  "viewer-api",
  "0.preview",
);
const legacyContractRoot = path.join(
  repoRoot,
  "packages",
  "viewer",
  "contracts",
  "viewer-api",
  "0.experimental",
);

const requiredFiles = [
  "auth.authenticate.response.json",
  "auth.challenge.completed.response.json",
  "auth.challenge.pending.response.json",
  "capabilities.authenticated.response.json",
  "capabilities.pre-auth.response.json",
  "error.scope-denied.response.json",
  "events.unsubscribe.clear.request.json",
  "events.unsubscribe.remove.request.json",
  "prop.load.file-picker-asset.request.json",
  "prop.load.inline.request.json",
  "prop.load.inline.response.json",
  "props.list.response.json",
  "events.subscribe.add.request.json",
  "events.subscribe.replace.request.json",
  "events.subscribe.request.json",
  "events.dropped.response.json",
];

const errorFixtureCases = [
  {
    file: "errors.invalid-request.response.json",
    code: "invalid_request",
    details: { field: "data.type", reason: "type" },
  },
  { file: "errors.unauthenticated.response.json", code: "unauthenticated" },
  {
    file: "errors.scope-denied.response.json",
    code: "scope_denied",
    details: { requiredScopes: ["write:props"] },
  },
  { file: "errors.origin-mismatch.response.json", code: "origin_mismatch" },
  {
    file: "errors.rate-limited.response.json",
    code: "rate_limited",
    details: { bucket: "origin", retryAfterMs: 1000 },
  },
  {
    file: "errors.payload-too-large.response.json",
    code: "payload_too_large",
    details: { limitBytes: 49152 },
  },
  {
    file: "errors.asset-unavailable.response.json",
    code: "asset_unavailable",
    details: { reason: "wrong_grant" },
  },
  { file: "errors.pairing-required.response.json", code: "pairing_required" },
  { file: "errors.pairing-closed.response.json", code: "pairing_closed" },
  {
    file: "errors.pairing-code-mismatch.response.json",
    code: "pairing_code_mismatch",
    details: { attemptsRemaining: 4 },
  },
  { file: "errors.grant-revoked.response.json", code: "grant_revoked" },
  {
    file: "errors.host-capability-unavailable.response.json",
    code: "host_capability_unavailable",
  },
  { file: "errors.renderer-unavailable.response.json", code: "renderer_unavailable" },
  {
    file: "errors.renderer-timeout.response.json",
    code: "renderer_timeout",
    details: { timeoutMs: 5000 },
  },
  {
    file: "errors.unsupported.response.json",
    code: "unsupported",
    details: { feature: "viewer.model.get" },
  },
  { file: "errors.internal-error.response.json", code: "internal_error" },
];

requiredFiles.push(...errorFixtureCases.map((fixture) => fixture.file));

const rendererBackedHandlers = [
  "viewer.props.list",
  "viewer.prop.load",
  "viewer.prop.update",
  "viewer.prop.remove",
  "viewer.prop.group.cycle",
  "viewer.calibration.get",
];

const errors = [];

const forbiddenFixturePatterns = [
  /C:[\\/]/i,
  /\/Users\//i,
  /\\\\[^"\\]+\\/,
  /"pairingCode"\s*:/i,
  /"code"\s*:\s*"[0-9]{6}"/i,
];

await assertFixtureSet();
await assertLegacyFixtureSet();
await assertFixturesArePublicSafe();
await assertLegacyFixturesArePublicSafe();
await assertRequestFixturesParse();
await assertResponseFixtures();
await assertCapabilitiesFixtures();
await assertSampleClientsUnderstandCanonicalErrors();
await assertPublicDocsCoverProtocol();

if (errors.length > 0) {
  for (const error of errors) console.error(`[viewer-api-contracts] ${error}`);
  process.exit(1);
}

console.log("[viewer-api-contracts] passed");

async function assertFixtureSet() {
  const entries = new Set(await readdir(contractRoot));
  for (const file of requiredFiles) {
    if (!entries.has(file)) errors.push(`missing fixture: ${file}`);
  }
}

async function assertLegacyFixtureSet() {
  let entries;
  try {
    entries = new Set(await readdir(legacyContractRoot));
  } catch {
    errors.push(
      "missing legacy fixture directory: packages/viewer/contracts/viewer-api/0.experimental",
    );
    return;
  }
  for (const file of requiredFiles.filter(
    (file) =>
      !file.startsWith("auth.") &&
      !file.startsWith("errors.") &&
      file !== "events.subscribe.add.request.json" &&
      file !== "events.subscribe.replace.request.json" &&
      file !== "events.unsubscribe.remove.request.json" &&
      file !== "events.unsubscribe.clear.request.json",
  )) {
    if (!entries.has(file)) errors.push(`missing legacy fixture: ${file}`);
  }
}

async function assertRequestFixturesParse() {
  for (const file of [
    "prop.load.file-picker-asset.request.json",
    "prop.load.inline.request.json",
    "events.subscribe.request.json",
    "events.subscribe.add.request.json",
    "events.subscribe.replace.request.json",
    "events.unsubscribe.clear.request.json",
    "events.unsubscribe.remove.request.json",
  ]) {
    const fixture = await readFixture(file);
    try {
      parseViewerApiMessage(JSON.stringify(fixture));
    } catch (error) {
      errors.push(`${file} is not accepted by schema: ${error.message}`);
    }
  }
}

async function assertFixturesArePublicSafe() {
  for (const file of requiredFiles) {
    const text = await readFile(path.join(contractRoot, file), "utf8");
    for (const pattern of forbiddenFixturePatterns) {
      if (pattern.test(text)) {
        errors.push(
          `${file} contains fixture data that must stay out of public contracts`,
        );
      }
    }
    const parsed = JSON.parse(text);
    assertNoFixtureSecrets(file, parsed);
  }
}

async function assertLegacyFixturesArePublicSafe() {
  let entries = [];
  try {
    entries = await readdir(legacyContractRoot);
  } catch {
    return;
  }
  for (const file of entries.filter((name) => name.endsWith(".json"))) {
    const text = await readFile(path.join(legacyContractRoot, file), "utf8");
    for (const pattern of forbiddenFixturePatterns) {
      if (pattern.test(text)) {
        errors.push(
          `${file} contains fixture data that must stay out of legacy Viewer API fixtures`,
        );
      }
    }
    const parsed = JSON.parse(text);
    assertNoFixtureSecrets(file, parsed);
  }
}

async function assertResponseFixtures() {
  const scopeDenied = await readFixture("error.scope-denied.response.json");
  assertEqualFixture(
    "error.scope-denied.response.json",
    scopeDenied,
    makeResponse("request-id", "viewer.prop.load.result", false, {}, "scope denied", {
      requiredScopes: ["write:props"],
    }),
  );

  const propsList = await readFixture("props.list.response.json");
  assertEnvelope("props.list.response.json", propsList, {
    type: "viewer.props.list.result",
    ok: true,
  });

  const propLoad = await readFixture("prop.load.inline.response.json");
  assertEnvelope("prop.load.inline.response.json", propLoad, {
    type: "viewer.prop.load.result",
    ok: true,
  });
  if (JSON.stringify(propLoad).includes("iVBOR")) {
    errors.push("prop.load.inline.response.json must not include inline image bytes");
  }
  if (typeof propLoad.data?.prop?.source?.bytes !== "number") {
    errors.push("prop.load.inline.response.json must expose source.bytes as a number");
  }

  const dropped = await readFixture("events.dropped.response.json");
  assertEqualFixture("events.dropped.response.json", dropped, {
    api: VIVI_VIEWER_API_NAME,
    version: VIVI_VIEWER_API_VERSION,
    type: "viewer.events.dropped",
    ok: true,
    eventId: "evt-1",
    timestamp: 0,
    data: {
      category: "queue_overflow",
      count: 1,
    },
  });

  const authPending = await readFixture("auth.challenge.pending.response.json");
  assertEnvelope("auth.challenge.pending.response.json", authPending, {
    type: "viewer.auth.challenge.result",
    ok: true,
  });
  if (
    authPending.data?.phase !== "pending" ||
    authPending.data?.code !== "<pairing-code>"
  ) {
    errors.push(
      "auth.challenge.pending.response.json must use a redacted pending challenge code",
    );
  }

  const authCompleted = await readFixture("auth.challenge.completed.response.json");
  assertEnvelope("auth.challenge.completed.response.json", authCompleted, {
    type: "viewer.auth.challenge.completed",
    ok: true,
  });
  if (
    authCompleted.data?.phase !== "completed" ||
    authCompleted.data?.token !== "<token-redacted>"
  ) {
    errors.push(
      "auth.challenge.completed.response.json must use the redacted token sentinel",
    );
  }

  const authResult = await readFixture("auth.authenticate.response.json");
  assertEnvelope("auth.authenticate.response.json", authResult, {
    type: "viewer.auth.authenticate.result",
    ok: true,
  });

  for (const fixture of errorFixtureCases) {
    assertEqualFixture(
      fixture.file,
      await readFixture(fixture.file),
      makeResponse(
        "request-id",
        "viewer.error",
        false,
        {},
        { code: fixture.code, details: fixture.details },
      ),
    );
  }
}

async function assertCapabilitiesFixtures() {
  const server = createViewerApiServer({
    handlers: Object.fromEntries(
      rendererBackedHandlers.map((type) => [type, () => ({ accepted: true })]),
    ),
  });
  const authenticated = await readFixture("capabilities.authenticated.response.json");
  const preAuth = await readFixture("capabilities.pre-auth.response.json");
  assertEqualFixture(
    "capabilities.authenticated.response.json",
    authenticated,
    makeResponse("request-id", "viewer.api.capabilities.get.result", true, {
      capabilities: server.getCapabilities({ authenticated: true }),
    }),
  );
  assertEqualFixture(
    "capabilities.pre-auth.response.json",
    preAuth,
    makeResponse("request-id", "viewer.api.capabilities.get.result", true, {
      capabilities: server.getCapabilities({ authenticated: false }),
    }),
  );
  const requestTypes = authenticated.data?.capabilities?.requestTypes ?? [];
  const coreRequestTypes =
    authenticated.data?.capabilities?.core?.requestTypes?.map(
      (request) => request.name,
    ) ?? [];
  const extensionRequestTypes =
    authenticated.data?.capabilities?.extensions?.requestTypes?.map(
      (request) => request.name,
    ) ?? [];
  const propSourceKinds = authenticated.data?.capabilities?.propSourceKinds ?? [];
  for (const type of rendererBackedHandlers) {
    if (
      ![...requestTypes, ...coreRequestTypes, ...extensionRequestTypes].includes(type)
    ) {
      errors.push(`authenticated capabilities fixture is missing ${type}`);
    }
  }
  const capabilityLimits = authenticated.data?.capabilities?.limits ?? {};
  if (
    Math.ceil((capabilityLimits.maxInlinePropBytes ?? 0) / 3) * 4 + 1024 >
    capabilityLimits.maxWebSocketTextFrameBytes
  ) {
    errors.push(
      "authenticated capabilities fixture advertises inline prop bytes that cannot fit in one WebSocket frame",
    );
  }
  if (!propSourceKinds.includes("filePickerAsset")) {
    errors.push("authenticated capabilities fixture must advertise filePickerAsset");
  }
}

async function assertSampleClientsUnderstandCanonicalErrors() {
  const sampleFiles = [
    path.join(repoRoot, "examples", "viewer-api-node-client", "client.mjs"),
    path.join(repoRoot, "examples", "viewer-api-browser-client", "src", "client.ts"),
  ];
  for (const file of sampleFiles) {
    const source = await readFile(file, "utf8");
    if (
      !source.includes("ViviViewerApiClientError") ||
      !source.includes("unknown_error")
    ) {
      errors.push(
        `${path.relative(repoRoot, file)} must parse canonical error.code values`,
      );
    }
    for (const marker of [
      "validateCapabilities",
      "stability",
      "surface",
      "Requesting scopes",
    ]) {
      if (!source.includes(marker)) {
        errors.push(
          `${path.relative(repoRoot, file)} must include capability negotiation marker: ${marker}`,
        );
      }
    }
    if (
      !source.includes("@vivi2d/viewer-api-client") &&
      !source.includes("packages/viewer-api-client/dist/browser.js")
    ) {
      errors.push(`${path.relative(repoRoot, file)} must use the Viewer API SDK package`);
    }
  }
  const scopeDenied = await readFixture("error.scope-denied.response.json");
  const error = scopeDenied.error;
  if (
    !error ||
    typeof error.code !== "string" ||
    typeof error.message !== "string" ||
    typeof error.retryable !== "boolean"
  ) {
    errors.push("error.scope-denied.response.json must use canonical error object shape");
  }
}

async function assertPublicDocsCoverProtocol() {
  const docsPath = path.join(repoRoot, "docs", "developer", "api", "viewer-api.md");
  let docs = "";
  try {
    docs = await readFile(docsPath, "utf8");
  } catch {
    errors.push(
      "docs/developer/api/viewer-api.md is required for the public Viewer API surface",
    );
    return;
  }

  const requiredPhrases = [
    "Pairing Flow",
    "Token Storage And Revocation",
    "Browser Origin Binding",
    "Scopes",
    "Canonical Errors",
    "Event Subscriptions",
    "Prop Loading",
    "Unsupported Surfaces",
    "Migration Notes From `0.experimental`",
    "filePickerAsset",
    "error.code",
  ];
  for (const phrase of requiredPhrases) {
    if (!docs.includes(phrase)) {
      errors.push(
        `docs/developer/api/viewer-api.md is missing required section or phrase: ${phrase}`,
      );
    }
  }
}

function assertEnvelope(file, fixture, expected) {
  if (fixture.api !== VIVI_VIEWER_API_NAME) {
    errors.push(`${file} has invalid api`);
  }
  if (fixture.version !== VIVI_VIEWER_API_VERSION) {
    errors.push(`${file} has invalid version`);
  }
  for (const [key, value] of Object.entries(expected)) {
    try {
      assert.deepEqual(fixture[key], value);
    } catch {
      errors.push(`${file} has unexpected ${key}`);
    }
  }
}

function assertEqualFixture(file, actual, expected) {
  try {
    assert.deepEqual(actual, expected);
  } catch (error) {
    errors.push(`${file} drifted: ${error.message}`);
  }
}

async function readFixture(file) {
  return JSON.parse(await readFile(path.join(contractRoot, file), "utf8"));
}

function assertNoFixtureSecrets(file, value, pathSegments = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertNoFixtureSecrets(file, item, [...pathSegments, String(index)]);
    });
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      assertNoFixtureSecrets(file, child, [...pathSegments, key]);
    }
    return;
  }
  if (typeof value !== "string") return;
  const fieldPath = pathSegments.join(".");
  if (fieldPath === "token" || fieldPath.endsWith(".token")) {
    const allowed =
      file === "auth.challenge.completed.response.json" && value === "<token-redacted>";
    if (!allowed) {
      errors.push(
        `${file} contains a token-like fixture field outside the auth continuation allowlist`,
      );
    }
  }
  if (/Bearer\s+[A-Za-z0-9._-]+/i.test(value)) {
    errors.push(`${file} contains a bearer-like fixture value`);
  }
  if (/Live2D|VTube Studio|Cubism/i.test(value)) {
    errors.push(
      `${file} contains a third-party product name in Viewer API contract data`,
    );
  }
}
