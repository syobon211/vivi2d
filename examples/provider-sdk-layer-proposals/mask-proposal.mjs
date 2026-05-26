import {
  createProviderResult,
  defineViviProvider,
  VIVI_PROVIDER_CAPABILITIES,
  VIVI_PROVIDER_SDK_VERSION,
} from "@vivi2d/provider-sdk";
import { invokeProvider } from "@vivi2d/provider-sdk/invocation";
import { printProviderSummary } from "./summary.mjs";

const manifest = {
  id: "example-mask-provider",
  displayName: "Example Mask Provider",
  version: "0.1.0",
  sdkVersion: VIVI_PROVIDER_SDK_VERSION,
  capabilities: [
    {
      id: VIVI_PROVIDER_CAPABILITIES.maskProposal,
      version: "1.0.0",
      inputKinds: ["inputImage"],
      outputKinds: ["maskProposal"],
      maxInputBytes: 1024,
      maxOutputBytes: 4096,
      timeoutMs: 1000,
    },
  ],
};

const provider = defineViviProvider({
  manifest,
  async invoke(request, context) {
    context?.onProgress?.({
      requestId: request.requestId,
      phase: "processing",
      step: 1,
      total: 1,
      message: "creating mask proposal",
    });

    return createProviderResult(manifest, request, [
      {
        id: "hair-mask",
        kind: "maskProposal",
        mediaType: "image/png",
        byteLength: 4,
        data: new Uint8Array([0, 255, 255, 0]).buffer,
        metadata: {
          schema: "vivi2d.provider.maskProposalMetadata.v1",
          semantic: "hair",
          confidence: 0.84,
          provenance: "providerProposal",
        },
      },
    ]);
  },
});

const result = await invokeProvider(provider, {
  requestId: "request-mask",
  capabilityId: VIVI_PROVIDER_CAPABILITIES.maskProposal,
  inputArtifacts: [
    {
      id: "source-image",
      kind: "inputImage",
      mediaType: "image/png",
      byteLength: 4,
      data: new Uint8Array([1, 2, 3, 4]).buffer,
    },
  ],
});

printProviderSummary(result);
