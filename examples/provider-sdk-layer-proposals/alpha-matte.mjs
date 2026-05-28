import {
  createProviderResult,
  defineViviProvider,
  VIVI_PROVIDER_CAPABILITIES,
  VIVI_PROVIDER_SDK_VERSION,
} from "@vivi2d/provider-sdk";
import { invokeProvider } from "@vivi2d/provider-sdk/invocation";
import { printProviderSummary } from "./summary.mjs";

const manifest = {
  id: "example-alpha-matte-provider",
  displayName: "Example Alpha Matte Provider",
  version: "0.1.0",
  sdkVersion: VIVI_PROVIDER_SDK_VERSION,
  capabilities: [
    {
      id: VIVI_PROVIDER_CAPABILITIES.alphaMatte,
      version: "1.0.0",
      inputKinds: ["inputImage", "maskProposal"],
      outputKinds: ["alphaMatte"],
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
        id: "hair-matte",
        kind: "alphaMatte",
        mediaType: "image/png",
        byteLength: 4,
        data: new Uint8Array([0, 128, 255, 0]).buffer,
        metadata: {
          schema: "vivi2d.provider.alphaMatteMetadata.v1",
          maskArtifactId: "reviewed-hair-mask",
          confidence: 0.78,
          provenance: "providerProposal",
        },
      },
    ]);
  },
});

const result = await invokeProvider(provider, {
  requestId: "request-alpha",
  capabilityId: VIVI_PROVIDER_CAPABILITIES.alphaMatte,
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
