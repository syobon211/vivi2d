const SAFE_METADATA_KEYS = new Set([
  "schema",
  "semantic",
  "confidence",
  "provenance",
  "maskArtifactId",
  "occludedByArtifactId",
]);

export function printProviderSummary(result) {
  console.log(JSON.stringify(summarizeProviderResult(result), null, 2));
}

export function summarizeProviderResult(result) {
  return {
    requestId: result.requestId,
    capabilityId: result.capabilityId,
    artifactKinds: result.artifacts.map((artifact) => artifact.kind),
    warningCount: result.warnings.length,
    provenance: {
      providerId: result.provenance.providerId,
      providerVersion: result.provenance.providerVersion,
      capabilityId: result.provenance.capabilityId,
    },
    artifacts: result.artifacts.map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      mediaType: artifact.mediaType,
      byteLength: artifact.byteLength,
      metadata: summarizeMetadata(artifact.metadata),
    })),
  };
}

function summarizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  const summary = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SAFE_METADATA_KEYS.has(key)) {
      summary[key] = value;
    }
  }
  if (isProviderNotes(metadata.provider)) {
    summary.provider = { notes: metadata.provider.notes.slice(0, 240) };
  }
  return summary;
}

function isProviderNotes(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.notes === "string"
  );
}
