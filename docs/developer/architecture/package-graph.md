# Package Graph

This document summarizes the intended dependency direction between Vivi2D
workspaces. The enforceable contributor rules live in
[`docs/developer/contributing/package-boundaries.md`](../contributing/package-boundaries.md).

## Direction Of Travel

```text
model
  -> loader
  -> runtime / runtime-wasm / runtime-native
  -> renderer-* / web / viewer

core
  -> runtime-facing math and compatibility helpers

editor-core
  -> UI-free editor commands and safe mutation contracts

src/ and electron/
  -> app orchestration, React UI, Electron IPC, and desktop workflows
```

## Ownership

| Area | Owner responsibility |
| --- | --- |
| `packages/model` | File/profile schemas, migrations, public-profile validation, runtime spec constants. |
| `packages/editor-core` | UI-free editor domain commands, safe Auto Setup plans, and authoring safety helpers. |
| `packages/core` | Runtime-neutral math/evaluation compatibility while pre-public refactors continue. |
| `packages/runtime*` | Runtime facade, WASM/native experiments, C ABI checks, and conformance surfaces. |
| `packages/renderer-*` | Renderer adapters that consume runtime snapshots instead of editor project internals. |
| `packages/web` | Experimental browser SDK and Web Component entry points. |
| `packages/viewer` | Standalone viewer app, local Viewer API preview, and viewer UX. |
| `packages/provider-sdk` | Provider capability, artifact, validation, and sample contracts. |
| `packages/provider-comfyui` | Internal adapter from local provider workflows into the provider SDK boundary. |

## Dependency Principles

- Public or experimental packages must not import root editor app internals.
- Runtime packages consume public-profile data, not private authoring drafts.
- Providers are untrusted boundaries and must not mutate projects directly.
- Electron privileged APIs stay behind main/preload IPC contracts.
- Package publication status is tracked in
  [`public-api-status.md`](../quality/public-api-status.md).
