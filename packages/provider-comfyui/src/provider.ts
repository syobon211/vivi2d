import {
  createProviderResult,
  DEFAULT_PROVIDER_LIMITS,
  isViviProviderError,
  normalizeProviderArtifactPath,
  VIVI_PROVIDER_CAPABILITIES,
  VIVI_PROVIDER_SDK_VERSION,
  type ViviProvider,
  type ViviProviderArtifact,
  type ViviProviderContext,
  ViviProviderError,
  type ViviProviderManifest,
  type ViviProviderProgressPhase,
  type ViviProviderRequest,
} from "@vivi2d/provider-sdk";
import type { ComfyUIClient } from "./client";
import {
  decomposeImageToNativeImportBundleCompat,
  exportCompatManifestToPsd,
  generateFromPromptToNativeImportBundleCompat,
} from "./orchestrator";
import type { DecomposeOptions, GenerateProgress, PromptGenerateOptions } from "./types";
import type {
  ViviCompatDecomposeOptions,
  ViviCompatExportOptions,
  ViviCompatNativeImportBundle,
} from "./vivi2d-compat";
import { parseViviCompatOutputRef } from "./vivi2d-compat";

export const COMFYUI_PROVIDER_ID = "vivi2d.provider.comfyui";
export const COMFYUI_PROVIDER_VERSION = "0.1.0";

export const COMFYUI_PROVIDER_MANIFEST: ViviProviderManifest = {
  id: COMFYUI_PROVIDER_ID,
  displayName: "ComfyUI Provider",
  version: COMFYUI_PROVIDER_VERSION,
  sdkVersion: VIVI_PROVIDER_SDK_VERSION,
  capabilities: [
    {
      id: VIVI_PROVIDER_CAPABILITIES.layerDecompose,
      version: "1.0.0",
      inputKinds: ["inputImage"],
      outputKinds: ["manifest", "layerImage"],
      maxInputBytes: DEFAULT_PROVIDER_LIMITS.maxInputBytes,
      maxOutputBytes: DEFAULT_PROVIDER_LIMITS.maxOutputBytes,
      timeoutMs: DEFAULT_PROVIDER_LIMITS.timeoutMs,
    },
    {
      id: VIVI_PROVIDER_CAPABILITIES.promptToLayerManifest,
      version: "1.0.0",
      inputKinds: [],
      outputKinds: ["manifest", "layerImage"],
      maxInputBytes: 1,
      maxOutputBytes: DEFAULT_PROVIDER_LIMITS.maxOutputBytes,
      timeoutMs: DEFAULT_PROVIDER_LIMITS.timeoutMs,
    },
    {
      id: VIVI_PROVIDER_CAPABILITIES.manifestToPsd,
      version: "1.0.0",
      inputKinds: ["manifest"],
      outputKinds: ["psd"],
      maxInputBytes: DEFAULT_PROVIDER_LIMITS.maxMetadataBytes,
      maxOutputBytes: DEFAULT_PROVIDER_LIMITS.maxOutputBytes,
      timeoutMs: DEFAULT_PROVIDER_LIMITS.timeoutMs,
    },
  ],
};

export function createComfyUIProvider(client: ComfyUIClient): ViviProvider {
  return {
    manifest: COMFYUI_PROVIDER_MANIFEST,
    async invoke(request, context = {}) {
      throwIfAborted(context);
      switch (request.capabilityId) {
        case VIVI_PROVIDER_CAPABILITIES.layerDecompose:
          return invokeSeeThroughDecompose(client, request, context);
        case VIVI_PROVIDER_CAPABILITIES.promptToLayerManifest:
          return invokePromptToLayerManifest(client, request, context);
        case VIVI_PROVIDER_CAPABILITIES.manifestToPsd:
          return invokeManifestToPsd(client, request, context);
        default:
          throw new ViviProviderError(
            "VIVI_PROVIDER_CAPABILITY_UNAVAILABLE",
            `ComfyUI provider does not support capability: ${request.capabilityId}`,
          );
      }
    },
  };
}

async function invokeSeeThroughDecompose(
  client: ComfyUIClient,
  request: ViviProviderRequest,
  context: ViviProviderContext,
) {
  const inputImage = requireInputArtifact(request, "inputImage");
  const bundle = await runComfyUIOperation(() =>
    decomposeImageToNativeImportBundleCompat(
      client,
      requireArtifactData(inputImage),
      readDecomposeOptions(request.parameters),
      createProgressReporter(request, context),
    ),
  );
  throwIfAborted(context);
  return createProviderResult(
    COMFYUI_PROVIDER_MANIFEST,
    request,
    createManifestBundleArtifacts(bundle),
  );
}

async function invokePromptToLayerManifest(
  client: ComfyUIClient,
  request: ViviProviderRequest,
  context: ViviProviderContext,
) {
  const bundle = await runComfyUIOperation(() =>
    generateFromPromptToNativeImportBundleCompat(
      client,
      readPromptOptions(request.parameters),
      createProgressReporter(request, context),
    ),
  );
  throwIfAborted(context);
  return createProviderResult(
    COMFYUI_PROVIDER_MANIFEST,
    request,
    createManifestBundleArtifacts(bundle),
  );
}

async function invokeManifestToPsd(
  client: ComfyUIClient,
  request: ViviProviderRequest,
  context: ViviProviderContext,
) {
  const manifestPath = readStringParameter(request.parameters, "manifestPath");
  const validatedManifestPath = normalizeCompatOutputPath(manifestPath);
  const psdBuffer = await runComfyUIOperation(() =>
    exportCompatManifestToPsd(
      client,
      validatedManifestPath,
      readExportOptions(request.parameters),
      createProgressReporter(request, context),
    ),
  );
  throwIfAborted(context);
  return createProviderResult(COMFYUI_PROVIDER_MANIFEST, request, [
    {
      id: "psd",
      kind: "psd",
      mediaType: "image/vnd.adobe.photoshop",
      byteLength: psdBuffer.byteLength,
      path: "outputs/comfyui-export.psd",
      data: psdBuffer,
    },
  ]);
}

function createManifestBundleArtifacts(
  bundle: ViviCompatNativeImportBundle,
): ViviProviderArtifact[] {
  const manifestData = new TextEncoder().encode(JSON.stringify(bundle.manifest));
  const artifacts: ViviProviderArtifact[] = [
    {
      id: "manifest",
      kind: "manifest",
      mediaType: "application/json",
      byteLength: manifestData.byteLength,
      path: normalizeCompatOutputPath(bundle.manifestPath),
      data: manifestData.buffer,
      metadata: {
        manifestPath: bundle.manifestPath,
        layerCount: bundle.manifest.layers.length,
      },
    },
  ];

  for (const [index, asset] of bundle.layerAssets.entries()) {
    artifacts.push({
      id: `layer-${index}`,
      kind: "layerImage",
      mediaType: "image/png",
      byteLength: asset.imageData.byteLength,
      path: normalizeProviderArtifactPath(asset.image_path),
      data: asset.imageData,
      metadata: {
        imagePath: asset.image_path,
      },
    });
  }
  return artifacts;
}

function createProgressReporter(
  request: ViviProviderRequest,
  context: ViviProviderContext,
): (progress: GenerateProgress) => void {
  return (progress) => {
    throwIfAborted(context);
    const total = coerceProgressTotal(progress.total);
    context.onProgress?.({
      requestId: request.requestId,
      phase: mapProgressPhase(progress.phase),
      step: coerceProgressStep(progress.step, total),
      total,
      message: progress.phaseLabel,
    });
  };
}

function requireInputArtifact(
  request: ViviProviderRequest,
  kind: ViviProviderArtifact["kind"],
): ViviProviderArtifact {
  const artifact = request.inputArtifacts.find((candidate) => candidate.kind === kind);
  if (!artifact) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      `ComfyUI provider requires a ${kind} input artifact.`,
    );
  }
  return artifact;
}

function requireArtifactData(artifact: ViviProviderArtifact): ArrayBuffer {
  if (!artifact.data) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      `ComfyUI provider requires in-memory data for artifact ${artifact.id}.`,
    );
  }
  return artifact.data;
}

function readDecomposeOptions(
  parameters: Record<string, unknown> | undefined,
): ViviCompatDecomposeOptions {
  return {
    ...readBaseOptions(parameters),
    filenamePrefix: readOptionalStringParameter(parameters, "filenamePrefix"),
  };
}

function readPromptOptions(
  parameters: Record<string, unknown> | undefined,
): PromptGenerateOptions & ViviCompatDecomposeOptions {
  const prompt = readStringParameter(parameters, "prompt");
  return {
    ...readDecomposeOptions(parameters),
    prompt,
    negativePrompt: readOptionalStringParameter(parameters, "negativePrompt"),
    imageSteps: readOptionalNumberParameter(parameters, "imageSteps"),
    cfg: readOptionalNumberParameter(parameters, "cfg"),
  };
}

function readExportOptions(
  parameters: Record<string, unknown> | undefined,
): ViviCompatExportOptions {
  return {
    filenamePrefix: readOptionalStringParameter(parameters, "filenamePrefix"),
  };
}

function readBaseOptions(
  parameters: Record<string, unknown> | undefined,
): DecomposeOptions {
  return {
    seed: readOptionalNumberParameter(parameters, "seed"),
    resolution: readOptionalNumberParameter(parameters, "resolution"),
    numSteps: readOptionalNumberParameter(parameters, "numSteps"),
    tblrSplit: readOptionalBooleanParameter(parameters, "tblrSplit"),
    useLama: readOptionalBooleanParameter(parameters, "useLama"),
    quantMode: readOptionalQuantModeParameter(parameters, "quantMode"),
    groupOffload: readOptionalBooleanParameter(parameters, "groupOffload"),
  };
}

function readStringParameter(
  parameters: Record<string, unknown> | undefined,
  key: string,
): string {
  const value = parameters?.[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      `ComfyUI provider parameter ${key} must be a non-empty string.`,
    );
  }
  return value;
}

function readOptionalStringParameter(
  parameters: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = parameters?.[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      `ComfyUI provider parameter ${key} must be a string.`,
    );
  }
  return value;
}

function readOptionalNumberParameter(
  parameters: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = parameters?.[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      `ComfyUI provider parameter ${key} must be a finite number.`,
    );
  }
  return value;
}

function readOptionalBooleanParameter(
  parameters: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined {
  const value = parameters?.[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      `ComfyUI provider parameter ${key} must be a boolean.`,
    );
  }
  return value;
}

function readOptionalQuantModeParameter(
  parameters: Record<string, unknown> | undefined,
  key: string,
): DecomposeOptions["quantMode"] {
  const value = parameters?.[key];
  if (value === undefined || value === "none" || value === "nf4") {
    return value;
  }
  throw new ViviProviderError(
    "VIVI_PROVIDER_INVALID_REQUEST",
    `ComfyUI provider parameter ${key} must be none or nf4.`,
  );
}

function normalizeCompatOutputPath(outputPath: string): string {
  const location = parseViviCompatOutputRef(outputPath);
  const relativePath = location.subfolder
    ? `${location.subfolder}/${location.filename}`
    : location.filename;
  return normalizeProviderArtifactPath(relativePath);
}

function mapProgressPhase(phase: GenerateProgress["phase"]): ViviProviderProgressPhase {
  switch (phase) {
    case "uploading":
      return "uploading";
    case "downloading":
      return "downloading";
    case "assembling":
      return "assembling";
    case "decomposing":
    case "depth":
    case "postprocess":
      return "processing";
  }
  throw new ViviProviderError(
    "VIVI_PROVIDER_INVALID_REQUEST",
    `Unknown ComfyUI progress phase: ${String(phase)}`,
  );
}

function coerceProgressTotal(total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 100;
  return Math.max(1, Math.round(total));
}

function coerceProgressStep(step: number, total: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(total, Math.round(step)));
}

function throwIfAborted(context: ViviProviderContext): void {
  if (context.signal?.aborted) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_CANCELLED",
      "ComfyUI provider invocation was cancelled.",
    );
  }
}

async function runComfyUIOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isViviProviderError(error)) {
      throw error;
    }
    const message = getErrorMessage(error);
    if (
      message.includes("Compat layer asset path") ||
      message.includes("Invalid Vivi2D compat output ref")
    ) {
      throw new ViviProviderError("VIVI_PROVIDER_BAD_ARTIFACT", message);
    }
    throw new ViviProviderError(
      "VIVI_PROVIDER_INTERNAL",
      "ComfyUI provider operation failed.",
      { cause: message },
    );
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
