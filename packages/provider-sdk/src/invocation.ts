import {
  isViviProviderError,
  mergeProviderLimits,
  validateProviderManifest,
  validateProviderRequest,
  validateProviderResult,
  VIVI_PROVIDER_PROGRESS_PHASES,
  ViviProviderError,
  type ViviProvider,
  type ViviProviderContext,
  type ViviProviderLimits,
  type ViviProviderManifest,
  type ViviProviderProgress,
  type ViviProviderRequest,
  type ViviProviderResult,
} from "./index.js";

export interface ViviProviderInvocationOptions extends ViviProviderContext {
  limits?: ViviProviderLimits;
}

export async function invokeProvider(
  provider: ViviProvider,
  request: ViviProviderRequest,
  options: ViviProviderInvocationOptions = {},
): Promise<ViviProviderResult> {
  const manifest = validateProviderManifest(provider.manifest);
  const limits = mergeProviderLimits(options.limits ?? request.limits);
  validateProviderRequest(request, limits);
  ensureCapabilityAvailable(manifest, request.capabilityId);
  throwIfAborted(options.signal);

  const context: ViviProviderContext = {
    signal: options.signal,
    onProgress(progress) {
      validateProviderProgress(progress, request.requestId);
      options.onProgress?.(progress);
    },
  };

  try {
    const result = await provider.invoke(request, context);
    throwIfAborted(options.signal);
    validateProviderResult(result, limits, request.inputArtifacts);
    validateProviderResultMatchesRequest(result, manifest, request);
    return result;
  } catch (error) {
    if (isViviProviderError(error)) {
      throw error;
    }
    if (isAbortError(error)) {
      throw createCancelledError();
    }
    throw new ViviProviderError(
      "VIVI_PROVIDER_INTERNAL",
      "Provider invocation failed.",
      { cause: getErrorMessage(error) },
    );
  }
}

function validateProviderProgress(
  progress: ViviProviderProgress,
  requestId: string,
): void {
  if (progress.requestId !== requestId) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      "Provider progress requestId must match the active request.",
    );
  }
  if (!VIVI_PROVIDER_PROGRESS_PHASES.includes(progress.phase)) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      `Provider progress phase is invalid: ${progress.phase}`,
    );
  }
  if (
    !Number.isInteger(progress.total) ||
    progress.total <= 0 ||
    !Number.isInteger(progress.step) ||
    progress.step < 0 ||
    progress.step > progress.total
  ) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      "Provider progress step must be an integer between 0 and total.",
    );
  }
  if (progress.message !== undefined && typeof progress.message !== "string") {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      "Provider progress message must be a string.",
    );
  }
}

function ensureCapabilityAvailable(
  manifest: ViviProviderManifest,
  capabilityId: string,
): void {
  if (!manifest.capabilities.some((capability) => capability.id === capabilityId)) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_CAPABILITY_UNAVAILABLE",
      `Provider does not support capability: ${capabilityId}`,
    );
  }
}

function validateProviderResultMatchesRequest(
  result: ViviProviderResult,
  manifest: ViviProviderManifest,
  request: ViviProviderRequest,
): void {
  if (result.requestId !== request.requestId) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      "Provider result requestId must match the active request.",
    );
  }
  if (result.capabilityId !== request.capabilityId) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      "Provider result capabilityId must match the active request.",
    );
  }
  if (
    result.provenance.providerId !== manifest.id ||
    result.provenance.providerVersion !== manifest.version ||
    result.provenance.capabilityId !== request.capabilityId
  ) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      "Provider result provenance must match the active provider and request.",
    );
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createCancelledError();
  }
}

function createCancelledError(): ViviProviderError {
  return new ViviProviderError(
    "VIVI_PROVIDER_CANCELLED",
    "Provider invocation was cancelled.",
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
