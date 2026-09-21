import { createHash } from "node:crypto";
import {
  canonicalizeJsonV11,
  decodeUtf8Fatal,
  encodeUtf8,
  type LocalArtifact,
  type LocalBlob,
  parseJsonV11,
  PROJECT_FORMAT_V11_JSON_LIMITS,
} from "@vivi2d/model/internal/local-exchange";
import {
  COMFYUI_PROVIDER_MANIFEST,
  MAX_VIVI2D_MANIFEST_LAYERS,
  parseViviCompatOutputRef,
  parseViviSeeThroughManifest,
} from "@vivi2d/provider-comfyui";
import {
  DEFAULT_PROVIDER_LIMITS,
  normalizeProviderArtifactPath,
  validateProviderRequest,
  validateProviderResult,
  VIVI_PROVIDER_CAPABILITIES,
  type ViviProviderArtifact,
  type ViviProviderRequest,
  type ViviProviderResult,
} from "@vivi2d/provider-sdk";
import { validateBaseUrl } from "./security.cjs";

export class ExchangeFault extends Error {
  constructor(readonly code: string) {
    super(`Local exchange failed (${code}).`);
  }
}
export function insist(value: unknown, code = "BINDING"): asserts value {
  if (!value) throw new ExchangeFault(code);
}
export function sha(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
export function jsonBytes(value: unknown, limit: number): Uint8Array {
  return encodeUtf8(
    canonicalizeJsonV11(value, {
      testLimits: {
        maxInputUtf8Bytes: Math.min(
          limit,
          PROJECT_FORMAT_V11_JSON_LIMITS.maxInputUtf8Bytes,
        ),
        maxDecodedStringUtf8Bytes: Math.min(
          limit,
          PROJECT_FORMAT_V11_JSON_LIMITS.maxDecodedStringUtf8Bytes,
        ),
      },
    }),
  );
}
export function readJson(bytes: Uint8Array, limit: number): unknown {
  insist(bytes.length <= limit, "LIMIT");
  return parseJsonV11(decodeUtf8Fatal(bytes), {
    testLimits: {
      maxInputUtf8Bytes: Math.min(
        limit,
        PROJECT_FORMAT_V11_JSON_LIMITS.maxInputUtf8Bytes,
      ),
      maxDecodedStringUtf8Bytes: Math.min(
        limit,
        PROJECT_FORMAT_V11_JSON_LIMITS.maxDecodedStringUtf8Bytes,
      ),
      maxTokens: Math.min(limit, PROJECT_FORMAT_V11_JSON_LIMITS.maxTokens),
    },
  });
}
export function same(left: unknown, right: unknown): boolean {
  return canonicalizeJsonV11(left) === canonicalizeJsonV11(right);
}
export function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  insist(value !== null && typeof value === "object" && !Array.isArray(value), "SHAPE");
  const properties = Object.getOwnPropertyDescriptors(value);
  insist(Reflect.ownKeys(properties).length === keys.length, "SHAPE");
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const property = properties[key];
    insist(property && "value" in property && property.enumerable, "SHAPE");
    result[key] = property.value;
  }
  return result;
}
export function id(value: unknown): string {
  insist(typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value), "SHAPE");
  return value;
}
export function hashId(value: unknown): string {
  insist(typeof value === "string" && /^[a-f0-9]{64}$/.test(value), "SHAPE");
  return value;
}
export function counter(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
  insist(
    typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= maximum,
    "LIMIT",
  );
  return value;
}
export function ownBytes(value: unknown, limit: number): Uint8Array {
  insist(value instanceof Uint8Array || value instanceof ArrayBuffer, "SHAPE");
  const view = value instanceof Uint8Array ? value : new Uint8Array(value);
  insist(view.byteLength <= limit, "LIMIT");
  return new Uint8Array(view);
}

export interface AdapterWrapper {
  adapterVersion: 1;
  providerId: string;
  providerVersion: string;
  endpoint: string;
  providerParameters: Record<string, unknown>;
  inputKinds: { id: string; kind: ViviProviderArtifact["kind"] }[];
}
export interface ComfySubmission {
  capabilityId: string;
  capabilityVersion: string;
  endpoint: string;
  providerParameters: Record<string, unknown>;
  inputArtifacts: ViviProviderArtifact[];
}
export interface OwnedInputs {
  wrapper: AdapterWrapper;
  artifacts: LocalArtifact[];
  blobs: LocalBlob[];
}
export function freezeSubmission(input: ComfySubmission): OwnedInputs {
  exact(input, [
    "capabilityId",
    "capabilityVersion",
    "endpoint",
    "providerParameters",
    "inputArtifacts",
  ]);
  const capability = COMFYUI_PROVIDER_MANIFEST.capabilities.find(
    (item) => item.id === input.capabilityId && item.version === input.capabilityVersion,
  );
  insist(capability, "UNSUPPORTED");
  const endpoint = validateBaseUrl(input.endpoint);
  insist(
    !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash,
    "SHAPE",
  );
  const parameters = readJson(
    jsonBytes(input.providerParameters, 65536),
    65536,
  ) as Record<string, unknown>;
  insist(
    parameters !== null && typeof parameters === "object" && !Array.isArray(parameters),
    "SHAPE",
  );
  const base = [
    "seed",
    "resolution",
    "numSteps",
    "tblrSplit",
    "useLama",
    "quantMode",
    "groupOffload",
    "filenamePrefix",
  ];
  const allowed =
    input.capabilityId === VIVI_PROVIDER_CAPABILITIES.manifestToPsd
      ? ["manifestPath", "filenamePrefix"]
      : input.capabilityId === VIVI_PROVIDER_CAPABILITIES.promptToLayerManifest
        ? [...base, "prompt", "negativePrompt", "imageSteps", "cfg"]
        : base;
  insist(
    Object.keys(parameters).every((key) => allowed.includes(key)),
    "SHAPE",
  );
  for (const [key, value] of Object.entries(parameters)) {
    if (
      [
        "prompt",
        "negativePrompt",
        "filenamePrefix",
        "manifestPath",
        "quantMode",
      ].includes(key)
    )
      insist(typeof value === "string", "SHAPE");
    else if (["tblrSplit", "useLama", "groupOffload"].includes(key))
      insist(typeof value === "boolean", "SHAPE");
    else insist(typeof value === "number" && Number.isFinite(value), "SHAPE");
  }
  if (parameters.quantMode !== undefined)
    insist(parameters.quantMode === "none" || parameters.quantMode === "nf4", "SHAPE");
  if (input.capabilityId === VIVI_PROVIDER_CAPABILITIES.promptToLayerManifest)
    insist(typeof parameters.prompt === "string" && parameters.prompt.trim(), "SHAPE");
  if (input.capabilityId === VIVI_PROVIDER_CAPABILITIES.manifestToPsd) {
    insist(typeof parameters.manifestPath === "string", "SHAPE");
    parseViviCompatOutputRef(parameters.manifestPath);
  }
  insist(
    Array.isArray(input.inputArtifacts) && input.inputArtifacts.length <= 128,
    "LIMIT",
  );
  const artifacts: LocalArtifact[] = [];
  const blobs: LocalBlob[] = [];
  const inputKinds: AdapterWrapper["inputKinds"] = [];
  let total = 0;
  for (const artifact of input.inputArtifacts) {
    insist(
      Object.keys(artifact).every((key) =>
        ["id", "kind", "mediaType", "byteLength", "data", "sha256"].includes(key),
      ),
      "SHAPE",
    );
    insist(capability.inputKinds.includes(artifact.kind), "BINDING");
    const bytes = ownBytes(artifact.data, 50 * 1024 * 1024);
    total += bytes.length;
    insist(total <= capability.maxInputBytes && total <= 50 * 1024 * 1024, "LIMIT");
    insist(artifact.byteLength === bytes.length, "INTEGRITY");
    const digest = sha(bytes);
    if (artifact.sha256 !== undefined)
      insist(artifact.sha256.toLowerCase() === digest, "INTEGRITY");
    artifacts.push({
      id: id(artifact.id),
      mediaType: artifact.mediaType,
      byteLength: bytes.length,
      sha256: digest,
    });
    blobs.push({ id: artifact.id, bytes });
    inputKinds.push({ id: artifact.id, kind: artifact.kind });
  }
  insist(
    inputKinds.length === capability.inputKinds.length &&
      capability.inputKinds.every(
        (kind) => inputKinds.filter((item) => item.kind === kind).length === 1,
      ),
    "BINDING",
  );
  inputKinds.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    wrapper: {
      adapterVersion: 1,
      providerId: COMFYUI_PROVIDER_MANIFEST.id,
      providerVersion: COMFYUI_PROVIDER_MANIFEST.version,
      endpoint: endpoint.href.replace(/\/$/, ""),
      providerParameters: parameters,
      inputKinds,
    },
    artifacts,
    blobs,
  };
}

export function sdkRequest(
  jobId: string,
  attempt: number,
  input: OwnedInputs,
  resultPolicy: { maxBytes: number; maxArtifacts: number },
  capabilityId: string,
): ViviProviderRequest {
  const request: ViviProviderRequest = {
    requestId: `${jobId}_${attempt}`,
    capabilityId,
    parameters: input.wrapper.providerParameters,
    limits: {
      maxOutputBytes: resultPolicy.maxBytes,
      maxArtifacts: resultPolicy.maxArtifacts,
      timeoutMs: 120000,
    },
    inputArtifacts: input.artifacts.map((artifact) => {
      const kind = input.wrapper.inputKinds.find((item) => item.id === artifact.id)?.kind;
      const bytes = input.blobs.find((item) => item.id === artifact.id)?.bytes;
      insist(kind && bytes, "INTEGRITY");
      return { ...artifact, kind, data: new Uint8Array(bytes).buffer };
    }),
  };
  validateProviderRequest(request);
  return request;
}
export interface SdkArtifact extends LocalArtifact {
  kind: ViviProviderArtifact["kind"];
  path: string;
  metadata: Record<string, unknown>;
}
export interface ResultManifest {
  format: 1;
  jobId: string;
  attempt: number;
  requestId: string;
  providerId: string;
  providerVersion: string;
  capabilityId: string;
  capabilityVersion: string;
  artifacts: SdkArtifact[];
}
export function freezeResult(
  jobId: string,
  attempt: number,
  capabilityVersion: string,
  request: ViviProviderRequest,
  raw: ViviProviderResult,
): { manifest: ResultManifest; blobs: LocalBlob[] } {
  exact(raw, ["requestId", "capabilityId", "artifacts", "warnings", "provenance"]);
  insist(
    Array.isArray(raw.artifacts) &&
      raw.artifacts.length <= (request.limits?.maxArtifacts ?? 128),
    "LIMIT",
  );
  const blobs: LocalBlob[] = [];
  const artifacts: SdkArtifact[] = [];
  let total = 0;
  for (const artifact of raw.artifacts) {
    insist(
      Object.keys(artifact).every((key) =>
        [
          "id",
          "kind",
          "mediaType",
          "byteLength",
          "data",
          "sha256",
          "path",
          "metadata",
        ].includes(key),
      ),
      "SHAPE",
    );
    const bytes = ownBytes(
      artifact.data,
      request.limits?.maxOutputBytes ?? 200 * 1024 * 1024,
    );
    total += bytes.length;
    insist(total <= (request.limits?.maxOutputBytes ?? 200 * 1024 * 1024), "LIMIT");
    const digest = sha(bytes);
    insist(bytes.length === artifact.byteLength, "INTEGRITY");
    if (artifact.sha256 !== undefined)
      insist(artifact.sha256.toLowerCase() === digest, "INTEGRITY");
    insist(typeof artifact.path === "string", "SHAPE");
    const label = normalizeProviderArtifactPath(artifact.path);
    const metadata = readJson(
      jsonBytes(artifact.metadata ?? {}, 262144),
      262144,
    ) as Record<string, unknown>;
    if (artifact.kind === "manifest") {
      exact(metadata, ["manifestPath", "layerCount"]);
      insist(typeof metadata.manifestPath === "string", "SHAPE");
      const location = parseViviCompatOutputRef(metadata.manifestPath);
      insist(
        normalizeProviderArtifactPath(
          location.subfolder
            ? `${location.subfolder}/${location.filename}`
            : location.filename,
        ) === label,
        "BINDING",
      );
      counter(metadata.layerCount, MAX_VIVI2D_MANIFEST_LAYERS);
    } else if (artifact.kind === "layerImage") {
      exact(metadata, ["imagePath"]);
      insist(
        typeof metadata.imagePath === "string" &&
          normalizeProviderArtifactPath(metadata.imagePath) === label,
        "BINDING",
      );
    } else if (artifact.kind === "psd") exact(metadata, []);
    else throw new ExchangeFault("UNSUPPORTED");
    artifacts.push({
      id: id(artifact.id),
      kind: artifact.kind,
      mediaType: artifact.mediaType,
      byteLength: bytes.length,
      sha256: digest,
      path: label,
      metadata,
    });
    blobs.push({ id: artifact.id, bytes });
  }
  insist(
    Array.isArray(raw.warnings) &&
      raw.warnings.length <= DEFAULT_PROVIDER_LIMITS.maxWarnings,
    "LIMIT",
  );
  exact(raw.provenance, ["providerId", "providerVersion", "capabilityId", "generatedAt"]);
  const detached: ViviProviderResult = {
    requestId: raw.requestId,
    capabilityId: raw.capabilityId,
    warnings: [...raw.warnings],
    provenance: { ...raw.provenance },
    artifacts: artifacts.map((artifact, index) => ({
      ...artifact,
      data: new Uint8Array(blobs[index]!.bytes).buffer,
    })),
  };
  validateProviderResult(
    detached,
    { ...DEFAULT_PROVIDER_LIMITS, ...request.limits },
    request.inputArtifacts,
  );
  insist(
    detached.requestId === request.requestId &&
      detached.capabilityId === request.capabilityId &&
      detached.provenance.providerId === COMFYUI_PROVIDER_MANIFEST.id &&
      detached.provenance.providerVersion === COMFYUI_PROVIDER_MANIFEST.version &&
      detached.provenance.capabilityId === request.capabilityId,
    "BINDING",
  );
  const capability = COMFYUI_PROVIDER_MANIFEST.capabilities.find(
    (item) => item.id === request.capabilityId && item.version === capabilityVersion,
  );
  insist(
    capability &&
      artifacts.every((artifact) => capability.outputKinds.includes(artifact.kind)),
    "BINDING",
  );
  artifacts.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    manifest: {
      format: 1,
      jobId,
      attempt,
      requestId: request.requestId,
      providerId: COMFYUI_PROVIDER_MANIFEST.id,
      providerVersion: COMFYUI_PROVIDER_MANIFEST.version,
      capabilityId: request.capabilityId,
      capabilityVersion,
      artifacts,
    },
    blobs,
  };
}

/** Reject ambiguous effective labels before any Map or importer is constructed. */
export function validateResultSelection(
  manifest: ResultManifest,
  selectedIds: readonly string[],
  blobs: readonly LocalBlob[],
): void {
  insist(
    selectedIds.length > 0 &&
      selectedIds.length <= 128 &&
      new Set(selectedIds).size === selectedIds.length,
    "BINDING",
  );
  const selected = selectedIds.map((selectedId) => {
    const artifact = manifest.artifacts.find((item) => item.id === selectedId);
    insist(artifact, "BINDING");
    return artifact;
  });
  if (selected.length === 1 && selected[0]!.kind === "psd") return;
  const manifests = selected.filter((item) => item.kind === "manifest");
  insist(manifests.length === 1, "BINDING");
  const manifestBytes = blobs.find((item) => item.id === manifests[0]!.id)?.bytes;
  insist(manifestBytes, "INTEGRITY");
  const parsed = parseViviSeeThroughManifest(new Uint8Array(manifestBytes).buffer);
  const labels: string[] = [];
  for (const artifact of selected) {
    if (artifact.kind === "manifest") continue;
    insist(
      artifact.kind === "layerImage" && typeof artifact.metadata.imagePath === "string",
      "BINDING",
    );
    const label = normalizeProviderArtifactPath(artifact.metadata.imagePath);
    insist(!labels.includes(label), "BINDING");
    labels.push(label);
  }
  const referenced = [...new Set(parsed.layers.map((layer) => layer.image_path))].sort();
  insist(same(labels.sort(), referenced), "BINDING");
}
