# @vivi2d/provider-sdk

Internal preview SDK for Vivi2D provider integrations.

Providers propose bounded artifacts such as layer masks, alpha mattes, underpaint
images, layer manifests, and quality reports. The SDK validates provider
manifests, requests, progress updates, artifacts, limits, and result provenance.
It does not send data to remote services, manage provider credentials, or apply
provider output to a Vivi2D project automatically.

## Status

This package is private/internal while the provider contract is being tested.
The package already builds to `dist` and uses release-shaped package exports,
but the API may still change before it becomes experimental.

## Quickstart

```ts
import {
  createProviderResult,
  defineViviProvider,
  VIVI_PROVIDER_CAPABILITIES,
  VIVI_PROVIDER_SDK_VERSION,
} from "@vivi2d/provider-sdk";
import { invokeProvider } from "@vivi2d/provider-sdk/invocation";

const provider = defineViviProvider({
  manifest: {
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
        maxInputBytes: 50 * 1024 * 1024,
        maxOutputBytes: 200 * 1024 * 1024,
        timeoutMs: 120_000,
      },
    ],
  },
  async invoke(request, context) {
    context?.onProgress?.({
      requestId: request.requestId,
      phase: "processing",
      step: 1,
      total: 1,
    });

    return createProviderResult(provider.manifest, request, [
      {
        id: "hair-mask",
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

const result = await invokeProvider(provider, {
  requestId: "request-1",
  capabilityId: VIVI_PROVIDER_CAPABILITIES.maskProposal,
  inputArtifacts: [
    {
      id: "source",
      kind: "inputImage",
      mediaType: "image/png",
      byteLength: 4,
      data: new Uint8Array([1, 2, 3, 4]).buffer,
    },
  ],
});

console.log({
  artifactKinds: result.artifacts.map((artifact) => artifact.kind),
  byteLengths: result.artifacts.map((artifact) => artifact.byteLength),
});
```

## Public Shape

Root exports:

- `defineViviProvider`
- `createProviderResult`
- `validateProviderManifest`
- `validateProviderRequest`
- `validateProviderResult`
- `normalizeProviderArtifactPath`
- `isViviProviderError`
- `ViviProviderError`
- `VIVI_PROVIDER_CAPABILITIES`
- `VIVI_PROVIDER_SDK_VERSION`

Subpaths:

- `@vivi2d/provider-sdk/invocation`: host-side `invokeProvider` wrapper.
- `@vivi2d/provider-sdk/artifact-policy`
- `@vivi2d/provider-sdk/testing`

## Capabilities

Built-in capability IDs describe neutral artifact transformations:

- `vivi2d.provider.layerDecompose.v1`
- `vivi2d.provider.promptToLayerManifest.v1`
- `vivi2d.provider.manifestToPsd.v1`
- `vivi2d.provider.maskProposal.v1`
- `vivi2d.provider.alphaMatte.v1`
- `vivi2d.provider.amodalUnderpaint.v1`

Provider-specific data belongs in bounded metadata, not new artifact kinds.
Provider-specific artifact kinds are intentionally not allowed in this preview.

## Artifact Safety

Artifacts can be in-memory `ArrayBuffer` payloads or provider-local relative
paths. Path artifacts must stay under a host-provided `artifactRoot`, must point
to regular files, and must include `byteLength` plus `sha256`. Hosts should
validate and copy path artifacts into their own immutable store before use.

`validateProviderResult(result, limits, referenceArtifacts)` accepts optional
reference artifacts from the original request. Pass `request.inputArtifacts`
when validating results that contain an `alphaMatte` referencing an input
`maskProposal`. Without reference artifacts, result validation intentionally
requires alpha mattes to reference masks in the same result payload.

Mask and matte proposals are review inputs. Provider-owned masks and mattes
cannot claim protected `face`, `eye`, or `mouth` semantics. Those regions must
come from source data, user review, or another trusted workflow.

Underpaint artifacts must use `generatedHidden` provenance so hosts can keep
them distinct from user-authored source art.

## Conformance

Use the testing subpath for sample and adapter checks. Conformance should run
against deterministic requests before an adapter is wired into the editor:

```ts
import { runViviProviderConformance } from "@vivi2d/provider-sdk/testing";

await runViviProviderConformance(provider, [
  {
    name: "mask proposal",
    request,
    expectArtifactKinds: ["maskProposal"],
  },
]);
```

The adapter template in `examples/provider-sdk-adapter-template/` shows the
recommended split between a provider module and a conformance smoke script.
The smoke script prints only provider id, case names, artifact counts, and
warning counts.

## Validation Commands

Run these from the repository root after changing the provider contract:

```sh
npm run build --workspace @vivi2d/provider-sdk
npm run test --workspace @vivi2d/provider-sdk
npm run check:provider-conformance
npm run check:provider-sdk-samples
npm run check:package-boundaries
npm run check:pack-contents
```

`npm run check:provider-sdk-samples` runs the deterministic layer-proposal
examples plus the adapter template conformance smoke. It verifies that logs
contain only safe summaries, not raw artifact payloads, paths, hashes, tokens,
or protected semantic proposals.

## Security

Report vulnerabilities through the repository `SECURITY.md`. Provider boundary
escapes, unsafe artifact paths, token or credential exposure, path traversal,
symlink or hardlink escapes, and unbounded payload handling are security bugs.
