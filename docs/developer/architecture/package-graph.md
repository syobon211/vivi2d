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
| `packages/runtime*` | Runtime facade, WASM/native experiments, C ABI checks, conformance surfaces, the private Asset Model resolver foundation, its native-only principal-bound local store adapter, and the private in-process local Asset host orchestration foundation. |
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
- `vivi-asset-store-local` and `vivi-asset-host-local` are the resolver's exact
  reviewed production consumers. The store owns
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
  WASM exports. Its only production consumer is `vivi-asset-host-local`; the
  database path and principal are not an IPC contract in either slice.
- `vivi-asset-host-local` is a private native-only, principal-bound Rust
  orchestration foundation. It opens a trusted absolute local-store path with
  an opaque principal, fully decodes and materializes bounded embedded PNGs,
  fully resolves referenced assets, and returns redacted attestations. Its
  manifest-ingestion seam accepts an expected `chunk_manifest` / `image/png`
  reference, one raw manifest object, and each unique chunk object exactly once.
  The host-specific 64 MiB PNG ceiling bounds that closure to at most nine
  objects: one manifest plus at most eight unique chunks. The exact normalized
  closure includes the manifest object; repeated chunk digests in the manifest
  are supplied once, while an invalid, missing, extra, or case-colliding
  supplied digest is `RefSetMismatch`. Expected-reference kind, size, and media
  preflight precedes closure cardinality and payload inspection. The host then
  validates the duplicate-aware approved manifest Stage 1/Stage 2 and
  received-value JCS address, every supplied object's digest and declared size,
  and the fully reconstructed strict PNG decode before the first store write.
  It then writes unique chunks in first-manifest-occurrence order, the received
  raw manifest, and finally the exact descriptor. That descriptor is the sole
  logical publication point. A chunk or manifest write failure never attempts
  it and may leave immutable, unreferenced GC candidates. Once descriptor
  insertion is attempted, a returned store error is outcome-ambiguous because
  SQLite may have committed before the post-commit boundary check failed; an
  idempotent retry reconciles either state. This ingestion path never creates a
  descriptor for a partial closure. The result is only `VerifiedAtlasAssetV1`
  metadata, not manifest, chunk, logical PNG, or RGBA bytes. An impossible
  durable-parser divergence during publication is redacted to the host `Store`
  domain without a stable Asset code. The validation work is bounded per call
  but is not a quota, rate limit, concurrency limit, or exact total peak-memory
  guarantee. Its activation-plan preflight accepts at most 32 sorted, unique
  IDs matching `^atlas:[A-Za-z0-9_-]{1,120}$`,
  checks the reviewed dimension and aggregate decoded-byte budgets, re-resolves
  every reference, and returns an owned `ReadyPng` set or deterministic missing
  IDs atomically. It carries a caller generation from 0 through JavaScript's
  maximum safe integer and rejects a larger generation before I/O. The frozen
  `vivi2d.evaluationTexturePlan.v1` bindings use `image/png`, `srgb`, and
  `straight`. The generation is correlation data only: this host does not
  establish monotonicity or freshness. A later activation coordinator owns the
  latest-generation comparison, stale-result rejection, texture upload
  transaction, and atomic publication. This Rust API accepts an already typed
  plan; a future bridge owns bounded raw-JSON parsing, duplicate-key rejection,
  and approved-schema Stage 1 validation for that texture-plan value. The
  manifest ingestion above instead reuses the resolver's already approved
  bounded, duplicate-aware parser. The host does not own path/principal
  derivation or ACLs, quotas, cancellation, orphan cleanup or general GC,
  server lifecycle, a language bridge, IPC, C ABI or WASM exports, evaluation
  loading, GPU activation, or capability advertisement. Those connections
  require separately reviewed slices.
- `editor-host` consumes only the reviewed internal Project Format v11 and Evaluation Payload v1 model friends. `buildRuntimePayload` is a data projection; UI, desktop, provider, runtime engine/renderer dependencies or execution, mutation, and ordinary/public save surfaces stay outside it.
- Providers are untrusted boundaries and must not mutate projects directly.
- Electron privileged APIs stay behind main/preload IPC contracts.
- Package publication status is tracked in
  [`public-api-status.md`](../quality/public-api-status.md).
