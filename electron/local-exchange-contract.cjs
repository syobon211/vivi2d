// Closed local host command envelope; the host repeats domain and actual-byte validation.
function validateLocalExchange(_channel, args) {
  const fail = () => {
    throw new Error("Invalid local exchange command.");
  };
  const record = (value, keys) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail();
    if (
      Object.keys(value).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(value, key))
    )
      fail();
    return value;
  };
  const string = (value, pattern) => {
    if (typeof value !== "string" || !pattern.test(value)) fail();
  };
  const count = (value, max = Number.MAX_SAFE_INTEGER) => {
    if (!Number.isSafeInteger(value) || value < 0 || value > max) fail();
  };
  const binary = (value, max) => {
    if (
      !(value instanceof Uint8Array || value instanceof ArrayBuffer) ||
      value.byteLength > max
    )
      fail();
  };
  const identifier = (value) => string(value, /^[A-Za-z0-9_-]{1,128}$/);
  const hash = (value) => string(value, /^[a-f0-9]{64}$/);
  const documentId = (value) =>
    string(
      value,
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
  const head = (value) => {
    record(value, ["version", "revisionId"]);
    count(value.version);
    if (value.revisionId !== null) hash(value.revisionId);
  };
  const selected = (value) => {
    if (!Array.isArray(value) || value.length > 128) fail();
    value.forEach(identifier);
  };
  if (args.length !== 1 || !args[0] || typeof args[0] !== "object") fail();
  const input = args[0];
  const fields = {
    list: [],
    createWorkspace: ["documentId"],
    createReplica: ["cellId"],
    query: ["cellId"],
    publish: ["cellId", "mutationId", "expectedHead", "bytes"],
    queuePublication: ["cellId", "targetCellId", "mutationId", "expectedHead", "bytes"],
    deliver: ["cellId", "mutationId"],
    deliverApproved: ["cellId"],
    submit: ["workspaceId", "submissionKey", "request", "maxAttempts", "resultPolicy"],
    start: ["cellId", "expectedStateVersion"],
    cancel: ["cellId", "expectedStateVersion", "attempt"],
    progress: ["cellId", "attempt"],
    settled: ["cellId", "attempt"],
    fail: ["cellId", "attempt", "reason"],
    complete: ["cellId", "attempt", "result"],
    result: ["cellId"],
    proposal: ["cellId", "selectedIds"],
    reject: ["cellId", "decisionId"],
    candidate: ["cellId"],
    approve: [
      "cellId",
      "decisionId",
      "selectedIds",
      "kind",
      "documentId",
      "bytes",
      "target",
    ],
  };
  if (!Object.hasOwn(fields, input.action)) fail();
  record(input, ["action", ...fields[input.action]]);
  for (const key of ["cellId", "workspaceId", "targetCellId"])
    if (Object.hasOwn(input, key)) hash(input[key]);
  for (const key of ["mutationId", "submissionKey", "decisionId"])
    if (Object.hasOwn(input, key)) identifier(input[key]);
  if (Object.hasOwn(input, "documentId")) documentId(input.documentId);
  if (Object.hasOwn(input, "expectedStateVersion")) count(input.expectedStateVersion);
  if (Object.hasOwn(input, "attempt")) count(input.attempt, 8);
  if (Object.hasOwn(input, "bytes")) binary(input.bytes, 128 * 1024 * 1024);
  if (Object.hasOwn(input, "expectedHead")) head(input.expectedHead);
  if (Object.hasOwn(input, "selectedIds")) selected(input.selectedIds);
  if (input.action === "fail" && !["retryable", "permanent"].includes(input.reason))
    fail();
  if (input.action === "approve") {
    if (!["import-approved", "project-approved"].includes(input.kind)) fail();
    if (input.target !== null) {
      record(input.target, ["cellId", "mutationId", "expectedHead"]);
      hash(input.target.cellId);
      identifier(input.target.mutationId);
      head(input.target.expectedHead);
    }
  }
  if (input.action === "submit") {
    count(input.maxAttempts, 8);
    record(input.resultPolicy, ["maxArtifacts", "maxBytes"]);
    count(input.resultPolicy.maxArtifacts, 128);
    count(input.resultPolicy.maxBytes, 200 * 1024 * 1024);
    const request = record(input.request, [
      "capabilityId",
      "capabilityVersion",
      "endpoint",
      "providerParameters",
      "inputArtifacts",
    ]);
    for (const field of ["capabilityId", "capabilityVersion", "endpoint"])
      if (typeof request[field] !== "string" || request[field].length > 2048) fail();
    if (
      !request.providerParameters ||
      typeof request.providerParameters !== "object" ||
      Array.isArray(request.providerParameters) ||
      Buffer.byteLength(JSON.stringify(request.providerParameters)) > 65536
    )
      fail();
    if (!Array.isArray(request.inputArtifacts) || request.inputArtifacts.length > 128)
      fail();
    let total = 0;
    for (const artifact of request.inputArtifacts) {
      if (
        !artifact ||
        Object.keys(artifact).some(
          (key) =>
            !["id", "kind", "mediaType", "byteLength", "data", "sha256"].includes(key),
        )
      )
        fail();
      identifier(artifact.id);
      binary(artifact.data, 50 * 1024 * 1024);
      total += artifact.data.byteLength;
    }
    if (total > 50 * 1024 * 1024) fail();
  }
  if (input.action === "complete") {
    const result = record(input.result, [
      "requestId",
      "capabilityId",
      "artifacts",
      "warnings",
      "provenance",
    ]);
    if (!Array.isArray(result.artifacts) || result.artifacts.length > 128) fail();
    let total = 0;
    for (const artifact of result.artifacts) {
      if (
        !artifact ||
        Object.keys(artifact).some(
          (key) =>
            ![
              "id",
              "kind",
              "mediaType",
              "byteLength",
              "data",
              "sha256",
              "path",
              "metadata",
            ].includes(key),
        )
      )
        fail();
      identifier(artifact.id);
      binary(artifact.data, 200 * 1024 * 1024);
      total += artifact.data.byteLength;
      if (
        artifact.metadata !== undefined &&
        Buffer.byteLength(JSON.stringify(artifact.metadata)) > 262144
      )
        fail();
    }
    if (
      total > 200 * 1024 * 1024 ||
      !Array.isArray(result.warnings) ||
      result.warnings.length > 64
    )
      fail();
    record(result.provenance, [
      "providerId",
      "providerVersion",
      "capabilityId",
      "generatedAt",
    ]);
  }
}
module.exports = { validateLocalExchange };
