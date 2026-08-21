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
| `packages/runtime*` | Runtime facade, WASM/native experiments, C ABI checks, conformance surfaces, the private Evaluation Payload validation foundation, the private Asset Model resolver foundation, its native-only principal-bound local store adapter, the private in-process local Asset host, their private native-only preactivation coordinator, and the consumer-zero Evaluation lowering foundation. |
| `packages/renderer-*` | Renderer adapters that consume runtime snapshots instead of editor project internals. |
| `packages/web` | Experimental browser SDK and Web Component entry points. |
| `packages/viewer` | Standalone viewer app, local Viewer API preview, and viewer UX. |
| `packages/provider-sdk` | Provider capability, artifact, validation, and sample contracts. |
| `packages/provider-comfyui` | Internal adapter from local provider workflows into the provider SDK boundary. |

## Dependency Principles

- Public or experimental packages must not import root editor app internals.
- Runtime packages consume public-profile data, not private authoring drafts.
- `vivi-runtime-native-evaluation` is a private Rust foundation whose exact
  sole production consumer is `vivi-runtime-native-preactivation`.
  It performs bounded duplicate-aware parsing, byte-identical approved-schema
  Stage 1 validation, semantic Stage 2 validation, and deterministic stable
  texture-binding inventory construction for Evaluation Payload v1. Stage 1
  rejects unknown structural fields before Stage 2 semantics; producer-side
  forbidden scanning is outside this crate, and opaque `skins`,
  `bindPoseInverse`, and expression-`values` keys remain data. Its ceilings are
  67,108,864 raw bytes, depth 64, 8,000,000 JSON tokens, and 67,108,864 UTF-8
  bytes per decoded string. Accepted numeric values are finite and
  binary64-normalized; source number lexemes and negative zero are not
  preserved. It accepts caller generation across the full `u64` range as
  opaque data, and sorts
  `atlas:<sourceAtlasId>` bindings by UTF-8 bytes. Its Runtime Spec v1.0
  loader-preflight policy rejects nonempty `clips` or `stateMachines` as
  unsupported only after Stage 1 and Stage 2; it is not a generic parser for
  every schema-valid payload. Success returns only a validated,
  inventory-bearing Runtime Spec v1.0 loader-preflight candidate, eligible only
  for the isolated preactivation correlation boundary. Adopted Amendment 1
  A-09 remains normative: its nested wire shape and arbitrary finite binary64
  domain are not pending or reopened. Evaluation Lowering Contract v1 is adopted
  for its direct binary64-to-binary32 projection, all 13 blend-mode
  dispositions, feature precedence, and consumer-zero foundation scope. Exact
  derived-evaluation operation/FMA/checkpoint and transcendental math policy is
  still a separately reviewed connection prerequisite. Explicit
  fallible reservations and input ceilings do not claim recoverable handling for every
  hidden `serde_json::Map` or serializer allocation failure. It compiles
  for native and `wasm32-unknown-unknown`, but has no runtime-native core edge,
  model lowering or evaluation, `f32` conversion, C ABI/editor symbol or header,
  WASM export, language/IPC bridge, filesystem or network I/O, unsafe code,
  GPU upload, or capability advertisement. EDH-01 remains open and requires a
  separately reviewed slice.
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
- `vivi-runtime-native-preactivation` is the private native-only coordinator and
  the exact sole production consumer of both
  `vivi-runtime-native-evaluation` and `vivi-asset-host-local`. It consumes a
  validated candidate and typed `vivi2d.evaluationTexturePlan.v1` value. Before
  any Asset/store read it requires an explicit out-of-band
  `request_generation` to equal the candidate generation and satisfy the host
  JavaScript-safe bound of 9,007,199,254,740,991, passes that same value to the
  host, and correlates exact schema/count plus case-sensitive positional
  equality for every `id`, `width`, and `height`. The candidate's at-most-32
  strict UTF-8 byte-sorted inventory fixes the plan count/order. The existing
  host preflight, rather than duplicated policy, owns frozen `image/png`,
  `srgb`, `straight`, and `AssetRef` shape checks. Generation mismatch is
  `Correlation` before the safe ceiling or plan; equal above-ceiling input is
  `ResourceLimitExceeded`; safe schema/count/tuple mismatch is `Correlation`;
  host fixed-plan, resolver, store, and output contradictions retain
  `InvalidTexturePlan`, `Asset`, `Store`, and `Internal` respectively.
  The Evaluation parser's full `u64` candidate contract remains unchanged.
  After reads start, Missing accumulation continues and a later Asset or Store
  hard error wins. Hard errors and Missing outcomes expose no partial Ready
  values. Ready postconditions recheck generation, count, order, IDs,
  references, decoded dimensions, and checked pixel/RGBA totals before moving
  the candidate, typed plan, and resolver-owned texture set into one private,
  all-or-nothing owned result. The coordinator implementation moves ownership
  and does not clone logical PNG or RGBA buffers. Only preactivation
  wrapper/error `Debug` is redacted; authorized accessors expose the host set
  and `ReadyPng` metadata with the dependency's existing `Debug`/`Clone`, which
  remains a future bridge/logging carry-forward boundary. Correlation and
  postcondition checks add no collection allocation; owned inputs and host
  outputs are moved, while dependency allocations retain their own reviewed
  bounds. This is not a global recoverable-OOM claim, and a future coordinator
  collection allocation must use fallible reservation. A pure correlation seam
  returns one move-only correlated-input token after the generation mismatch,
  JavaScript-safe ceiling, and exact tuple checks. The existing host path and
  the lowering foundation both use that seam so correlation executes exactly
  once. Preactivation's exact sole production consumer is
  `vivi-runtime-native-evaluation-lowering`. It does not establish
  generation freshness,
  reject stale work, lower to runtime-native core, evaluate, convert values to
  `f32`, expose C ABI/editor headers or symbols, connect runtime-native WASM or
  a language/IPC bridge, upload GPU resources, atomically publish a runtime
  model, or advertise a capability.
- `vivi-runtime-native-evaluation-lowering` is a private native-only,
  consumer-zero Rust foundation with exact direct production dependencies on
  `vivi-runtime-native-preactivation` and `serde_json`. It reuses the move-only
  pure correlation seam exactly once and proves only overall phases 1–3 plus
  lowering categories 1–9: allocation-free categories 1–8 feature/direct-
  projection preflight, then category-9 checked/fallible reservation and single
  direct-projection materialization. Its output is explicitly
  foundation/preflight state, not a
  complete `LoweredEvaluationCandidateV1`; it does not claim the mandatory
  zero-step derived evaluator, complete initial snapshots, texture attachment,
  or activation boundary. The source pins the exact approved Evaluation
  Lowering Contract v1 draft/vector/approval identities. It preserves blend
  values `normal=0`, `multiply=1`, `screen=2`, and `add=3`, rejects the nine
  extended modes and approved unsupported structures before host reads, and
  uses one round-to-nearest-ties-to-even binary32 projection with accepted-zero
  canonicalization plus fail-closed overflow, underflow, and subnormal
  classification. Category 10 derived evaluation and category 11 topology,
  identity, mask-command construction, invariant sealing, and model-ready
  output remain absent. The Foundation exposes only generation and aggregate
  counts; it has no public candidate/value/plan/`AssetRef`/ID accessor or
  consuming `into_parts`. Parameter bindings, physics, IK, skinning, and every
  other derived evaluator path remain absent. The crate has no direct Asset-host
  dependency, host/store argument, or host call, and no runtime-native core, C
  ABI/editor, WASM, TypeScript, language/IPC, GPU, publication, or capability
  edge. Connecting derived evaluation requires a separately adopted
  exact primitive operation graph, FMA policy, non-finite checkpoint schedule,
  and deterministic transcendental kernel or proven safe-domain/margin policy.
  EDH-01 remains open.
- `editor-host` consumes only the reviewed internal Project Format v11 and Evaluation Payload v1 model friends. `buildRuntimePayload` is a data projection; UI, desktop, provider, runtime engine/renderer dependencies or execution, mutation, and ordinary/public save surfaces stay outside it.
- Providers are untrusted boundaries and must not mutate projects directly.
- Electron privileged APIs stay behind main/preload IPC contracts.
- Package publication status is tracked in
  [`public-api-status.md`](../quality/public-api-status.md).
