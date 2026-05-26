import {
  createProviderResult,
  DEFAULT_PROVIDER_LIMITS,
  defineViviProvider,
  VIVI_PROVIDER_CAPABILITIES,
  VIVI_PROVIDER_SDK_VERSION,
  ViviProviderError,
  type ViviProvider,
  type ViviProviderArtifactKind,
  type ViviProviderContext,
  type ViviProviderManifest,
  type ViviProviderRequest,
  type ViviProviderResult,
} from "./index.js";
import { invokeProvider, type ViviProviderInvocationOptions } from "./invocation.js";

export interface FakeProviderOptions {
  manifest?: ViviProviderManifest;
  invoke?: (
    request: ViviProviderRequest,
    context: ViviProviderContext,
  ) => Promise<ViviProviderResult> | ViviProviderResult;
}

export function createFakeProvider(options: FakeProviderOptions = {}): ViviProvider {
  const manifest = options.manifest ?? createFakeProviderManifest();
  return defineViviProvider({
    manifest,
    async invoke(request, context = {}) {
      if (options.invoke) {
        return options.invoke(request, context);
      }
      return createProviderResult(manifest, request, []);
    },
  });
}

export interface ViviProviderConformanceCase {
  name: string;
  request: ViviProviderRequest;
  expectArtifactKinds?: readonly ViviProviderArtifactKind[];
}

export interface ViviProviderConformanceReport {
  providerId: string;
  cases: Array<{
    name: string;
    artifactCount: number;
    warningCount: number;
  }>;
}

export async function runViviProviderConformance(
  provider: ViviProvider,
  cases: readonly ViviProviderConformanceCase[],
  options: ViviProviderInvocationOptions = {},
): Promise<ViviProviderConformanceReport> {
  const checkedProvider = defineViviProvider(provider);
  const results: ViviProviderConformanceReport["cases"] = [];
  for (const conformanceCase of cases) {
    const result = await invokeProvider(
      checkedProvider,
      conformanceCase.request,
      options,
    );
    if (conformanceCase.expectArtifactKinds) {
      const actualKinds = result.artifacts.map((artifact) => artifact.kind).sort();
      const expectedKinds = [...conformanceCase.expectArtifactKinds].sort();
      if (JSON.stringify(actualKinds) !== JSON.stringify(expectedKinds)) {
        throw new ViviProviderError(
          "VIVI_PROVIDER_BAD_ARTIFACT",
          `Provider conformance case ${conformanceCase.name} returned artifact kinds ${actualKinds.join(",")} instead of ${expectedKinds.join(",")}.`,
          {
            name: conformanceCase.name,
            actualKinds,
            expectedKinds,
          },
        );
      }
    }
    results.push({
      name: conformanceCase.name,
      artifactCount: result.artifacts.length,
      warningCount: result.warnings.length,
    });
  }
  return {
    providerId: checkedProvider.manifest.id,
    cases: results,
  };
}

export function createFakeProviderManifest(): ViviProviderManifest {
  return {
    id: "fake-provider",
    displayName: "Fake Provider",
    version: "0.1.0",
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
    ],
  };
}
