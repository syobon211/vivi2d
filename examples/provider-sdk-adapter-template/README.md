# Provider SDK Adapter Template

This template shows the smallest safe shape for a local provider adapter:

- declare a neutral capability in the manifest;
- validate through `defineViviProvider` and `invokeProvider`;
- return bounded artifacts with review-safe metadata;
- run `runViviProviderConformance` before wiring the adapter into the editor.

Run from the repository root:

```sh
npm run build --workspace @vivi2d/provider-sdk
node examples/provider-sdk-adapter-template/conformance-smoke.mjs
npm run check:provider-sdk-samples
```

The smoke command prints only a conformance summary. It does not print artifact
bytes, paths, hashes, prompts, credentials, or provider-private payloads.
