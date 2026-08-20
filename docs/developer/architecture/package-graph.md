# Package Graph

This document summarizes the intended dependency direction between Vivi2D
workspaces. The enforceable contributor rules live in
[`docs/developer/contributing/package-boundaries.md`](../contributing/package-boundaries.md).

## Direction Of Travel

```text
model
  -> editor-host
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
| `packages/editor-host` | Read-only, host-neutral Project Format v11 parsing, host-injected atlas resolution/materialization attestations, and Evaluation Payload v1 projection over the two reviewed model friend entry points. |
| `packages/core` | Runtime-neutral math/evaluation compatibility while alpha refactors continue. |
| `packages/runtime*` | Runtime facade, WASM/native experiments, C ABI checks, conformance surfaces, the private Asset Model resolver foundation, and its native-only principal-bound local store adapter. |
| `packages/renderer-*` | Renderer adapters that consume runtime snapshots instead of editor project internals. |
| `packages/web` | Experimental browser SDK and Web Component entry points. |
| `packages/viewer` | Standalone viewer app, local Viewer API preview, and viewer UX. |
| `packages/provider-sdk` | Provider capability, artifact, validation, and sample contracts. |
| `packages/provider-comfyui` | Internal adapter from local provider workflows into the provider SDK boundary. |

## Dependency Principles

- Public or experimental packages must not import root editor app internals.
- Runtime packages consume public-profile data, not private authoring drafts.
- `vivi-asset-resolver` is an internal data-integrity foundation: it may depend
  on the approved Asset Model schema and `vivi-png-ref`, but it does not own W7a
  host wiring, Electron IPC, capability advertisement, GPU upload, or C ABI
  symbols. Those connections require separately reviewed slices.
- `vivi-asset-store-local` is the resolver's only production consumer. It owns
  native SQLite persistence for a principal-bound immutable local store. The
  store is one logical database in rollback-journal mode; SQLite may create a
  transient journal sidecar while committing, and WAL is not part of this
  boundary. Its schema starts at `user_version=1`, requires SQLite `UTF-8`
  encoding, and rejects unknown schema identities rather than migrating them in
  this slice. Its narrow ingestion seam accepts only raw-SHA-verified 1-8 MiB
  chunks or manifests accepted by the
  approved strict parser and JCS-address calculation; it exposes no arbitrary
  address, update, or delete API. It does not own server lifecycle/GC, W7a or
  Electron wiring, activation, capability advertisement, C ABI symbols, or
  WASM exports. A future reviewed native host adapter may invoke this Rust API
  while owning lifecycle and IPC policy; the database path and principal are
  not an IPC contract in this slice.
- `editor-host` consumes only the reviewed internal Project Format v11 and Evaluation Payload v1 model friends. `buildRuntimePayload` is a data projection; UI, desktop, provider, runtime engine/renderer dependencies or execution, mutation, and ordinary/public save surfaces stay outside it.
- Providers are untrusted boundaries and must not mutate projects directly.
- Electron privileged APIs stay behind main/preload IPC contracts.
- Package publication status is tracked in
  [`public-api-status.md`](../quality/public-api-status.md).
