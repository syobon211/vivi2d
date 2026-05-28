import {
  createProviderResult,
  defineViviProvider,
  VIVI_PROVIDER_CAPABILITIES,
  VIVI_PROVIDER_SDK_VERSION,
} from "@vivi2d/provider-sdk";
import { invokeProvider } from "@vivi2d/provider-sdk/invocation";
import { printProviderSummary } from "./summary.mjs";

const manifest = {
  id: "example-underpaint-provider",
  displayName: "Example Underpaint Provider",
  version: "0.1.0",
  sdkVersion: VIVI_PROVIDER_SDK_VERSION,
  capabilities: [
    {
      id: VIVI_PROVIDER_CAPABILITIES.amodalUnderpaint,
      version: "1.0.0",
      inputKinds: ["inputImage", "maskProposal"],
      outputKinds: ["underpaint", "qualityReport"],
      maxInputBytes: 1024,
      maxOutputBytes: 4096,
      timeoutMs: 1000,
    },
  ],
};

const provider = defineViviProvider({
  manifest,
  async invoke(request) {
    return createProviderResult(manifest, request, [
      {
        id: "hair-underpaint",
        kind: "underpaint",
        mediaType: "image/png",
        byteLength: 4,
        data: new Uint8Array([32, 32, 32, 255]).buffer,
        metadata: {
          schema: "vivi2d.provider.underpaintMetadata.v1",
          occludedByArtifactId: "reviewed-hair-mask",
          confidence: 0.68,
          provenance: "generatedHidden",
        },
      },
      {
        id: "underpaint-quality",
        kind: "qualityReport",
        mediaType: "application/json",
        byteLength: 2,
        data: new Uint8Array([123, 125]).buffer,
        metadata: {
          provider: {
            notes: "Example report. Hosts should review before applying output.",
          },
        },
      },
    ]);
  },
});

const result = await invokeProvider(provider, {
  requestId: "request-underpaint",
  capabilityId: VIVI_PROVIDER_CAPABILITIES.amodalUnderpaint,
  inputArtifacts: [
    {
      id: "source-image",
      kind: "inputImage",
      mediaType: "image/png",
      byteLength: 4,
      data: new Uint8Array([1, 2, 3, 4]).buffer,
    },
    {
      id: "reviewed-hair-mask",
      kind: "maskProposal",
      mediaType: "image/png",
      byteLength: 4,
      data: new Uint8Array([0, 255, 255, 0]).buffer,
      metadata: {
        schema: "vivi2d.provider.maskProposalMetadata.v1",
        semantic: "hair",
        confidence: 0.9,
        provenance: "user",
      },
    },
  ],
});

printProviderSummary(result);
