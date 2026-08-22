# Contributing Architecture Guide

This guide maps common contribution types to the package and safety boundary
that should own the change.

## Where Changes Belong

| Change type | Preferred location | Notes |
| --- | --- | --- |
| React editor UI | `src/` | UI should orchestrate domain commands instead of mutating nested project state directly. |
| Electron IPC, files, URLs | `electron/` and `electron/ipc-contract.cjs` | Update contract tests and security checks with every payload or permission change. |
| Project schema or migration | `packages/model/` | Keep public/private profile markers explicit and update hostile fixture coverage. |
| Read-only authoring parse, atlas readiness, or evaluation projection | `packages/editor-host/` | Consume only `@vivi2d/model/internal/project-format-v11` and `@vivi2d/model/internal/evaluation-payload-v1`; inject atlas resolver/materializer ports. `buildRuntimePayload` projects data only; keep mutation, ordinary/public save, UI, desktop, provider, and runtime engine/renderer dependencies or execution outside this package. |
| Runtime evaluation | `packages/core/src/runtime.ts`, `packages/runtime/`, `packages/runtime-wasm/`, `packages/runtime-native/` | Runtime packages must consume public-profile data and stay independent from editor stores. |
| Private Evaluation Payload v1 validation or stable binding inventory | `packages/runtime-native/crates/vivi-runtime-native-evaluation/` | Keep this foundation native/wasm-compatible with exactly one production consumer, `vivi-runtime-native-preactivation`. Stage 1 rejects unknown structural fields before Stage 2 semantics; producer-side forbidden scanning is outside this crate, and opaque map keys remain data. Preserve finite, binary64-normalized numeric values without claiming source-lexeme or negative-zero preservation, and preserve the full opaque `u64` generation range; derive `atlas:<sourceAtlasId>` bindings in UTF-8 byte order. Runtime Spec v1.0 loader preflight rejects nonempty `clips` or `stateMachines` as unsupported only after both validation stages; success means a loader-preflight candidate, not every schema-valid payload, and permits only the separately isolated preactivation correlation seam. Adopted Amendment 1 A-09 remains normative: its nested wire shape and arbitrary finite binary64 domain are not pending or reopened. Evaluation Lowering Contract v1 adopts the downstream direct projection, feature, blend, and consumer-zero foundation boundary without changing this parser. Evaluation Deterministic Math Contract v1 adopts downstream operation/FMA/checkpoint and transcendental policy without connecting it here. Do not claim recoverable handling for every hidden `serde_json::Map`/serializer allocation failure. This crate must not lower into runtime-native core, evaluate, convert values to `f32`, add C ABI/editor or WASM symbols, perform filesystem/network I/O, or connect editor, GPU, and capability boundaries. Category-10 implementation/connection gates and EDH-01 remain open. |
| Private local Asset resolution, persistence, manifest-closure ingestion, or activation preflight | `packages/runtime-native/crates/vivi-asset-{resolver,store-local,host-local}/` | Keep the host native-only and principal-bound. Preflight the expected reference, exact normalized closure, all object bytes, and strict decode before writes; attempt the descriptor last as the sole logical publication point and return only redacted attestations. Treat database paths as trusted host input, and keep bridges, IPC, ACL/path derivation, capability advertisement, evaluation/GPU activation, orphan cleanup, and lifecycle policy in separately reviewed slices. |
| Private Evaluation candidate/texture preactivation correlation | `packages/runtime-native/crates/vivi-runtime-native-preactivation/` | Keep this coordinator native-only, with exactly two production dependencies: Evaluation validation and the local Asset host, and exactly one production consumer: `vivi-runtime-native-evaluation-lowering`. Consume the candidate, typed plan, and explicit out-of-band `request_generation`. Before reads, require that value to equal the candidate generation within the host JavaScript-safe ceiling. Return one move-only pure correlated-input token after exact schema/count and case-sensitive positional `id`/`width`/`height` correlation; both the existing host path and lowering consume this seam so correlation runs exactly once. Pass the same generation to the host. The candidate's at-most-32 strict UTF-8 byte-sorted inventory fixes plan count/order. Leave frozen `image/png`/`srgb`/`straight` and `AssetRef` shape checks to the existing host preflight rather than duplicating policy. Preserve exact error precedence: generation mismatch `Correlation`, equal above-ceiling `ResourceLimitExceeded`, safe tuple mismatch `Correlation`, then host `InvalidTexturePlan`/`Asset`/`Store`, with contradictory trusted output as `Internal`. After reads, let a later hard Asset/Store error win over accumulated Missing and never expose partial Ready values. Defend Ready postconditions before returning one private owned all-or-nothing bundle. The coordinator implementation must move and not clone logical PNG/RGBA buffers. Redaction covers only preactivation wrapper/error `Debug`; authorized accessors expose the host set and `ReadyPng` metadata with existing dependency `Debug`/`Clone`, which a future bridge/logger must handle. Correlation/postcondition checks add no collection allocation; dependency allocations retain their reviewed bounds. Make any future coordinator collection reservation fallible without a global recoverable-OOM claim. Do not add freshness/stale policy, core lowering/evaluation/`f32`, C ABI/editor or WASM exports, bridges/IPC, GPU upload/runtime publication, or capability advertisement. Derived-evaluation math closure and EDH-01 remain open. |
| Private Evaluation lowering foundation | `packages/runtime-native/crates/vivi-runtime-native-evaluation-lowering/` | Keep this foundation native-only and consumer-zero, with exact direct production dependencies on preactivation and `serde_json`. Reuse the move-only pure correlation seam exactly once; never duplicate correlation or call the Asset host. Prove only overall phases 1–3 plus lowering categories 1–9: allocation-free categories 1–8 feature/direct-projection preflight, then category-9 checked/fallible reservation and single typed-plan/direct-projection materialization. Pin the separately approved Category 9 contract at 41,002 bytes, vector and byte-identical tracked fixture at 210,149 bytes, and approval record at 18,793 bytes. Independently derive the 39-site/failure bijection, all 82 formula programs, 30 fixed layouts, concrete census totals, and 37-test requirement corpus instead of trusting self-validation flags. Run the native library corpus, the post-reservation allocator trap with one test thread, and a host `wasm_compile` test that invokes pinned Rust 1.89 `rustc` for `wasm32-unknown-unknown` over exact production `error.rs`, `model.rs`, `reservation.rs`, and `lower.rs`; test-only dependency stubs plus an actual `lower_evaluation_foundation_v1` probe make the census, reserve, and materialize call graph compile/codegen-visible. Add no full-package wasm target and claim no wasm execution, parity, product/dependency WASM support, or runtime-WASM edge. Preserve blend values 0..3 for `normal`/`multiply`/`screen`/`add`; reject all nine extended modes and approved unsupported structures before reads. Project exactly once with round-to-nearest-ties-to-even, canonicalize accepted zero to positive zero, and reject overflow, nonzero-to-zero underflow, and nonzero binary32 subnormal results. Keep the result named and scoped as foundation/preflight state, never `LoweredEvaluationCandidateV1`, and expose only generation/aggregate counts—no public candidate/value/plan/`AssetRef`/ID accessor or consuming `into_parts`. Category 10 derived evaluation and category 11 topology, identity, mask-command construction, invariant sealing, and model-ready output remain absent. Evaluation Deterministic Math Contract v1 now adopts the exact primitive graph, FMA, non-finite checkpoint, and transcendental kernel policy, but do not execute parameter bindings, physics, IK, skinning, or other derived evaluator work until its remaining category-10 implementation/connection gates pass. The crate has no direct Asset-host dependency, host/store argument, or host call; do not add runtime-native core, C ABI/editor, WASM, TypeScript, bridge/IPC, GPU, publication, activation, or capability edges; keep EDH-01 open. |
| Private deterministic-math oracle foundation | `packages/runtime-native/crates/vivi-runtime-native-evaluation-math/` | Keep this production rlib consumer-zero, unpublished, `no_std`, and `forbid(unsafe_code)`, with no public product API. Its exact direct production dependencies are `fpmath =0.1.1` with default features disabled and only `soft-float`, plus direct `rustc_apfloat =0.2.3` with default features disabled; Cargo requirements ignore build metadata, so separately pin the complete `0.2.3+llvm-462a31f5a5ab` lock/source/archive/checker identity, transitive `bitflags 2.13.1` and `smallvec 1.15.2`, licenses, checksums, requested/resolved features, and build-script scope. Pin exact member bytes/hashes and function/call anchors for the reviewed 18-member `fpmath`, two-member APFloat, and four-member `bitflags` selected runtime semantic source projection; treat it as fail-closed implementation-review evidence, not a formal whole-program/compiler reachability proof or whole-dependency audit. Keep the callable raw-`D64` wrapper crate-private and limited to raw-bit construction/classification/finiteness, `+ - * / c_fmod neg abs`, `sin cos atan2 acos sqrt`, and quiet comparisons. Preserve signed zero/subnormals and canonicalize NaN. Reject host `f64` arithmetic/libm, FMA/`mul_add`, reassociation, IEEE remainder, decimal or host conversion, `SoftF32`, serde, I/O, filesystem, network, FFI, and production exports. Pin the byte-identical approved vector fixture and exact source/test identities. Native corpus and single-thread allocator-trap execution plus Rust 1.89 rustfmt/Clippy/rustdoc and `wasm32-unknown-unknown` compile/Clippy instrumentation belong in the focused gate, but compile-only wasm is not raw-bit execution or parity evidence. The allocator trap is a separate test-only crate with necessary `unsafe` system-allocator forwarding; do not extend the production rlib's `forbid(unsafe_code)` claim to that harness or dependencies. Add no lowering/core/TypeScript/C ABI/editor/runtime-WASM/GPU/activation/publication/capability edge. Keep the oracle consumer-zero and disconnected from the separate Category 9 lowering implementation candidate, whose own implementation review remains required; keep category 10 disconnected pending supported-target native and test-only wasm execution, expanded transcendental coverage, machine DAG/checkpoint bijection, complete compound traces, obligation bindings, and the remaining separate implementation reviews; keep category 11 and EDH-01 open. |
| Renderer adapter | `packages/renderer-pixi/`, `packages/renderer-three/`, or `packages/renderer-phaser/` | Prefer `RuntimeMeshSnapshot` and `getRenderList()` over editor-project structural access. |
| Provider integration | `packages/provider-sdk/` or a separate provider repository | Treat providers as untrusted; validate paths, outputs, cancellation, and payload size. |
| Viewer API origin, auth, permissions, rate limits, or transport | `packages/viewer/electron/viewer-api-*.cjs` plus `packages/viewer/src/__tests__/viewer-api-*.test.ts` | Keep protocol/security helpers testable without rendering React. |
| Web Component package | `packages/web/` | Public-facing exports must come from built `dist` files and pass package-surface checks. |
| Repository automation | `scripts/` | Add new checks to `scripts/quality-gate-manifest.json` and CI lint lists. |
| Documentation | `README.md`, `CONTRIBUTING.md`, `docs/` | Update the doc map when package names, public APIs, or release gates change. |

The deterministic-math oracle boundary above is exactly the 21 raw-bit
callables. It does not implement checkpoints, graph scheduling, or status
mapping; those obligations remain future category-10 evaluator work.

The deterministic-math integration check may enumerate repository paths, but
it must never open, hash, or scan the three protected user-owned dirty bodies
whose exact path set is pinned in
`scripts/check-runtime-native-evaluation-math.mjs`.

## Import Rules

Use package boundaries instead of reaching through another package's internals.

Allowed examples:

```ts
import { ViviRuntime } from "@vivi2d/runtime";
import type { ViviFileData } from "@vivi2d/model/types";
import { PixiViviRenderer } from "@vivi2d/renderer-pixi";
```

Avoid examples:

```ts
import { useProjectStore } from "@/stores/projectStore";
import { privateHelper } from "@vivi2d/provider-comfyui/internal";
import { RuntimeModel } from "@vivi2d/core/src/runtime";
```

The architecture and package-boundary checks intentionally reject public or
experimental packages that expose `src/*` or import editor/provider internals.
`@vivi2d/editor-host` is a narrower private friend boundary: its production
sources may import the two reviewed internal model friends only, and its root
entry point must remain read-only. Ordinary/public save and mutable editor
commands belong to later host or application slices.

An editor-host instance is scoped to one trust principal: its opaque session ID
is not an authorization token, must not be exposed directly through shared IPC
or a multi-tenant service, and any future bridge must bind calls to that
principal.

Asset readiness is an initialization-time runtime-atlas validation snapshot,
not a storage lease or pin: resolve missing assets and re-initialize the
session, while extension `blobRefs` remain edit-only and outside W7a Evaluation
readiness.

Local manifest ingestion takes one exact closure: the raw manifest object plus
each unique referenced chunk exactly once after case-insensitive digest
normalization, with at most nine objects under the host's 64 MiB PNG ceiling.
Validate reference kind, size, and media before inspecting the closure. Then
validate the complete set and strict reconstructed PNG before the first write,
insert chunks in first manifest occurrence order, then the raw manifest, and
publish only by inserting the descriptor last. A chunk or manifest write
failure may leave immutable unreferenced objects for a future GC policy, but
must not make a partial closure resolvable. A Store error returned after
descriptor insertion is attempted is outcome-ambiguous because its SQLite
commit may precede a failed post-commit boundary check; retry the immutable
operation to reconcile either state. Do not log or return manifest, chunk,
reconstructed PNG, RGBA,
database-path, principal, or native-store detail. These per-call validation
bounds are not a caller quota, rate limit, or concurrency policy.

## Adding A Domain Command

When a UI workflow changes model state:

1. Put the mutation logic in the closest domain package or feature helper.
2. Validate inputs at the command boundary.
3. Return a serializable patch, result object, or explicit error.
4. Keep React components responsible for user intent, loading state, and display.
5. Add unit tests for the command and an E2E test when the workflow is user-facing.

## Adding A Provider Adapter

Provider adapters must assume local services and generated files are untrusted.

Required review points:

- path allowlisting, traversal rejection, artifact-root containment, and
  SHA-256 verification for path artifacts
- payload byte limits and cancellation behavior
- failure UX for unavailable services
- license and distribution boundary
- no provider dependency from `@vivi2d/web`, runtime packages, or renderers

Optional provider plugins should live outside this repository unless the
public-release checklist explicitly approves their license and artifact boundary.

## Adding Model Fields Or Load Paths

Model/schema changes must stay owned by `@vivi2d/model`.

1. Update the relevant schema or migration under `packages/model/src/`.
2. Decide whether the field is public-profile data or private authoring data.
3. Update public-profile allowlists or fail-closed tests when the public profile
   changes.
4. Add hostile fixture coverage when the field crosses file, binary, provider,
   runtime, or SDK boundaries.
5. Run `npm run check:model-fixtures`,
   `npm run check:core-model-current-fixtures`, and
   `npm run check:packages-types`.

## Adding Viewer API Requests

Viewer API changes are security-sensitive even while the protocol is preview.

1. Add request/event/scope metadata in the schema registry.
2. Keep auth, permission, origin, rate-limit, and transport changes in small
   helpers under `packages/viewer/electron/viewer-api-*.cjs`.
3. Add protocol tests that run without React rendering.
4. Add UI tests only for viewer controls or visual states.
5. Run `npm run check:viewer-tests`,
   `npm run check:viewer-api-contracts`, and
   `npm run check:viewer-api-e2e` when protocol behavior changes.

## Adding Runtime Fixtures

Runtime behavior should be specified through conformance fixtures before native
or WASM implementations are expanded.

1. Add or update a fixture under `tests/conformance/runtime-v1/`.
2. Extend `tests/conformance/runtime-v1/runner.ts` expected output validation.
3. Update TypeScript runtime tests first.
4. Mirror behavior in `packages/runtime-wasm/` and `packages/runtime-native/`.
5. Run `npm run check:quality`.

## CODEOWNERS Expectations

Every new public, experimental, release, security-sensitive, provider, or
runtime/native path must be covered by `.github/CODEOWNERS` in the same change
that creates it.

Default owner while the project is solo-maintained is `@syobon211`. Replace that with
a team before publication if maintainer ownership changes.
