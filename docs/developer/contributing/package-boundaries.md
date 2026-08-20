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
| Private local Asset resolution, persistence, manifest-closure ingestion, or activation preflight | `packages/runtime-native/crates/vivi-asset-{resolver,store-local,host-local}/` | Keep the host native-only and principal-bound. Preflight the expected reference, exact normalized closure, all object bytes, and strict decode before writes; attempt the descriptor last as the sole logical publication point and return only redacted attestations. Treat database paths as trusted host input, and keep bridges, IPC, ACL/path derivation, capability advertisement, evaluation/GPU activation, orphan cleanup, and lifecycle policy in separately reviewed slices. |
| Renderer adapter | `packages/renderer-pixi/`, `packages/renderer-three/`, or `packages/renderer-phaser/` | Prefer `RuntimeMeshSnapshot` and `getRenderList()` over editor-project structural access. |
| Provider integration | `packages/provider-sdk/` or a separate provider repository | Treat providers as untrusted; validate paths, outputs, cancellation, and payload size. |
| Viewer API origin, auth, permissions, rate limits, or transport | `packages/viewer/electron/viewer-api-*.cjs` plus `packages/viewer/src/__tests__/viewer-api-*.test.ts` | Keep protocol/security helpers testable without rendering React. |
| Web Component package | `packages/web/` | Public-facing exports must come from built `dist` files and pass package-surface checks. |
| Repository automation | `scripts/` | Add new checks to `scripts/quality-gate-manifest.json` and CI lint lists. |
| Documentation | `README.md`, `CONTRIBUTING.md`, `docs/` | Update the doc map when package names, public APIs, or release gates change. |

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
