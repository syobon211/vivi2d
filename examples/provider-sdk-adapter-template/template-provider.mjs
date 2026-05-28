import {
  createProviderResult,
  defineViviProvider,
  VIVI_PROVIDER_CAPABILITIES,
  VIVI_PROVIDER_SDK_VERSION,
} from "@vivi2d/provider-sdk";

export const templateProviderManifest = {
  id: "example-adapter-template-provider",
  displayName: "Example Adapter Template Provider",
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

export const templateProvider = defineViviProvider({
  manifest: templateProviderManifest,
  async invoke(request, context) {
    context?.onProgress?.({
      requestId: request.requestId,
      phase: "processing",
      step: 1,
      total: 1,
      message: "creating template mask proposal",
    });

    return createProviderResult(templateProviderManifest, request, [
      {
        id: "template-hair-mask",
        kind: "maskProposal",
        mediaType: "image/png",
        byteLength: 4,
        data: new Uint8Array([0, 255, 255, 0]).buffer,
        metadata: {
          schema: "vivi2d.provider.maskProposalMetadata.v1",
          semantic: "hair",
          confidence: 0.8,
          provenance: "providerProposal",
        },
      },
    ]);
  },
});

export function createTemplateMaskRequest() {
  return {
    requestId: "request-template-mask",
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
  };
}
