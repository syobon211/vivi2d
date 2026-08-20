# Public API Status

Vivi2D is public and pre-1.0. Package boundaries may change during the alpha
period. This document records the current publication intent so contributors do
not accidentally treat internal workspace entry points as stable APIs.

## Public Terminology

Use Vivi2D-owned names in public APIs, docs, and UI copy wherever practical.

| Term | Use |
| --- | --- |
| `ViviMesh` | Drawable textured mesh nodes in the Vivi2D scene graph. |
| `controller rig` | Parameter-driven bone and IK controller values. It must not store parameter-indexed mesh shape data. |
| `binding point` | Parameter-to-controller interpolation entries for public-safe bone and IK targets. |
| `common 2D rig parameter alias` | Factual interoperability descriptions for parameter-name heuristics. |

## Current Package Status

This section is an internal/reference status inventory. It may name internal
adapter packages that refer to third-party products or ecosystems so maintainers
can track publication boundaries accurately. Those names are allowed here and
in explicitly labeled IP/reference sections only. Public examples, marketing
headings, Viewer API request/event/scope names, contract fixtures, and SDK
package root exports should continue to use Vivi2D-owned or neutral names by
default.

| Package | Status | Notes |
| --- | --- | --- |
| `@vivi2d/core` | Internal | Private runtime/math compatibility package for existing internal callers. Model-owned helpers have moved to `@vivi2d/model`, editor mutations belong in `@vivi2d/editor-core`, and this package must not become public unless it is narrowed to a reviewed dist-only runtime-core surface. |
| `@vivi2d/model` | Internal | Owns file/profile types, Zod project schemas, migrations, public-profile checks, binary serialization, model-owned parameter sanitizers, load limits, and Runtime Spec constants. The bare package entry intentionally exposes only types and schemas; parser, migration, profile, serialization, limits, parameter utilities, and runtime-spec APIs are explicit subpaths while the package remains internal. The reviewed Evaluation Payload v1 builder and Project Format v11 JSON codec are available only through the explicitly internal `./internal/evaluation-payload-v1` and `./internal/project-format-v11` subpaths for the private read-only editor-host integration; neither is a public or experimental API. Their schema validators are deterministic precompiled artifacts, and Project v11 hashing is supplied explicitly by the host, so these internal seams require neither runtime code generation nor ambient Web Crypto. |
| `@vivi2d/editor-core` | Internal | UI-free editor command and safety-contract workspace. It currently owns Safe Auto Setup plan validation and source fingerprinting before wider command extraction. |
| `@vivi2d/editor-host` | Internal | Private read-only authoring host for Project Format v11 parse/capability results, host-injected embedded/referenced atlas readiness, and Evaluation Payload v1 projection. Its `buildRuntimePayload` operation projects data only; the package consumes only the two reviewed internal model friend entry points and intentionally exposes no mutation, undo/redo, ordinary/public serialization, UI, desktop, provider, or runtime engine/renderer dependency or execution surface. |
| `@vivi2d/loader` | Internal | Browser texture extraction helpers over `@vivi2d/model` file data. It must not depend on `@vivi2d/core` or editor internals. |
| `@vivi2d/runtime` | Internal | Narrow Runtime Spec v1 facade over the TypeScript reference runtime. It now builds a small `dist` facade for export-shape review while remaining private/internal until conformance, packaging, and API/legal review are complete. |
| `@vivi2d/runtime-wasm` | Internal | Experimental WASM-wrapper boundary. It now embeds the private native Rust WASM evaluator behind explicit backend diagnostics while keeping portable and TypeScript reference paths for conformance. It remains private until memory-growth failure behavior, fuzz, benchmark, packaging, and export reviews are complete. |
| `@vivi2d/runtime-c-abi` | Internal | Internal C header source paired with private native implementations in `@vivi2d/runtime-native`; ABI 0.2 and strict PNG entry points remain default-off feature builds, with no public support promise. |
| `@vivi2d/runtime-native` | Internal | Private Rust workspace for the future native core, C ABI, WASM bindings, strict PNG decoder, Asset Model v1 resolver foundation, its principal-bound native SQLite store, and a native-only in-process local Asset host orchestration foundation. The resolver validates its tracked approved schema before semantic checks and returns owned snapshots; the host performs bounded materialization, resolution, and activation-plan preflight without connecting editor-host, desktop IPC, capability advertisement, evaluation/GPU activation, or the public C ABI. The workspace has no public support promise. |
| `@vivi2d/renderer-pixi` | Internal | Renderer adapter candidate, but public surface is not frozen. |
| `@vivi2d/renderer-three` | Internal | Renderer adapter candidate, but public surface is not frozen. |
| `@vivi2d/renderer-phaser` | Internal | Renderer adapter candidate, but public surface is not frozen. |
| `@vivi2d/provider-sdk` | Internal | Provider contract, neutral capability identifiers, dist-only preview exports, artifact-root policy helpers, hostile-payload validation, examples, and conformance helpers are in place. It remains private/internal until provider contracts receive external review feedback. |
| `@vivi2d/provider-comfyui` | Internal | SDK-backed ComfyUI adapter. Low-level workflow/client exports remain private implementation details while the package is internal. |
| `@vivi2d/viewer-api-client` | Internal | Node/browser/testing client helpers for the local Viewer API `0.preview` protocol. The package and samples use built public subpaths, but the API remains private/internal until protocol, pairing/token, scope, and security boundaries receive external review feedback. |
| `@vivi2d/viewer` | Internal app | Standalone viewer app, not a library API. It now contains experimental Action System, loopback Viewer API, Prop overlay, and Tracking Calibration internals; these are not stable package exports. |
| `@vivi2d/viewer-bridge-obs` | Internal | Optional viewer bridge adapter for OBS-style scene/source automation. It is isolated from the default viewer core, remains private/internal, and has no public API or distribution promise yet. |
| `@vivi2d/web` | Experimental | The only current npm-style package with `dist` exports and npm alpha release scaffolding. The root import is side-effect free, `./auto-register` owns custom-element registration, `./umd` is isolated for browser-global loading, browser runtime dependencies are bundled into `dist/**`, and public compatibility guarantees are not finalized. |

Future viewer automation APIs must start as disabled-by-default experimental
local protocols, not as stable package APIs. They must use Vivi2D-owned envelope
names, scoped grants, and preview protocol versions until security, IP,
conformance, and documentation review promote them to `1.0` only after external
usage and a final compatibility review.
The current preview Viewer API developer documentation lives in
`docs/developer/api/viewer-api.md`. Contract fixtures live under
`packages/viewer/contracts/viewer-api/0.preview/` and are checked by
`npm run check:viewer-api-contracts`.
The SDK package design and current preview API references live under
`docs/developer/api/`.
Current SDK sample gates are:

- `npm run check:samples` for the `@vivi2d/web` basic example.
- `npm run check:viewer-api-samples` for the Node and browser Viewer API client
  examples, including the browser Origin pairing smoke test.
- `npm run check:provider-sdk-samples` for deterministic provider SDK
  layer-proposal examples, the adapter template conformance smoke, and
  safe-summary log checks.
- `npm run check:sdk-external-consumer` for a public-style tarball consumer
  smoke test. It packs `@vivi2d/web`, `@vivi2d/viewer-api-client`, and
  `@vivi2d/provider-sdk`, installs the tarballs into a temporary external
  TypeScript/Vite app, and verifies the documented package entry points without
  monorepo source imports.

The current `@vivi2d/web` implementation unlock is enforced by
`npm run check:sdk-unlock:web`; it permits only Phase 1 programmatic SDK
implementation, not stable compatibility promises.
`npm run check:web-npm-alpha-release` covers the additional alpha publication
scaffolding: protected environment policy, trusted-publisher/token hygiene,
release workflow shape, pack/record/verify scripts, release notes template, and
required gates. `@vivi2d/web@0.1.0-alpha.3` is the current npm alpha published
through GitHub Actions OIDC Trusted Publishing with npm provenance. The `alpha`
and `latest` npm dist-tags currently both resolve to `0.1.0-alpha.3`; `latest`
is a convenience alias pointing to the current alpha, not a stable API
commitment. The one-time
`0.1.0-alpha.0` bootstrap is complete, deprecated, and remains the only
local-publish exception; later npm alpha publishes still require a final package
release tag and the configured npm Trusted Publisher path.
`npm run check:github-release-alpha` covers the initial repository-level
source/provenance GitHub Release scaffolding: source/provenance-only asset
composition, the draft release workflow, release notes template, checksum
generation, and required gates. That source/provenance workflow must not
publish desktop installers, native/WASM binaries, ComfyUI bundles, or npm
package tarballs as canonical artifacts. Windows installer alpha releases use
the separate `docs/developer/quality/windows-installer-alpha.md` contract and
`npm run check:windows-installer-alpha` gate.
The previous `0.experimental` fixtures remain as migration references. The
Viewer API preview reference defines the current `0.preview` behavior without
changing the `@vivi2d/viewer` package status.
The current viewer automation implementation remains an internal app surface:
actions, props, and calibration profiles are schema-validated viewer-session
state, not model/runtime authoring data.
Existing internal viewer names that reference third-party protocols or products
must be renamed before any viewer API, action schema, calibration schema, or
package entry point is promoted to experimental/public status.
Origin-less Viewer API WebSocket upgrades are allowed only for native loopback
clients and still require token authentication before any read/write request.
Browser requests with an `Origin` header must match a grant allowlist using the
same canonical origin comparison used by authentication, diagnostics, and rate
limits.
Browser `Origin: null` requests, including `file://` and sandboxed pages, are
not treated as native origin-less clients.
Pairing approval is deliberately user-mediated: the renderer/main IPC path must
submit both the client-visible challenge ID and the six-digit code displayed in
the viewer before a token is issued. Revoked grants, including
revoke-and-re-pair flows, must not complete new or in-flight grant-bound
requests.

## Current Public-Safe Naming

- Default viewer tracking IDs use Vivi2D-owned names such as
  `vivi.head.yaw`, `vivi.head.pitch`, `vivi.mouth.open`, and
  `vivi.eye.leftOpen`.
- Third-party-style parameter names may still be detected as user-provided
  aliases by viewer heuristics, but Vivi2D must not present them as default API
  names or product standards.
- Public docs and API examples should use `vivi.*` or neutral project-local
  IDs unless an interoperability example explicitly requires otherwise.

## Rules Before Publishing

- Public packages must export built `dist` entry points, not `src/*`.
- Experimental APIs must use explicit `experimental` entry points.
- Public and experimental packages must not depend on private workspace packages
  unless those dependencies are fully bundled and absent from the published
  dependency manifest.
- Internal packages must remain `private: true`.
- Every package must declare `vivi2d.publication` as `internal`,
  `internal-app`, `experimental`, or `public`.
- New package exports require security, API, and IP/provenance review.
- File-format compatibility must be tested through versioned migration fixtures.
- Public project/profile APIs must reject private-profile deformation fields
  before hydration or export.
- Public viewer/runtime packages must hydrate with the public model boundary,
  not the internal authoring model, so private-profile deformation runtimes do
  not enter public bundles.
- Runtime publication must follow the Runtime Spec index in
  `docs/developer/api/index.md`: the Runtime Spec and TypeScript reference
  runtime stay authoritative while WASM/native implementations remain internal
  until conformance, packaging, security, and API/legal review gates are
  complete.
- Runtime Spec v1 constants and the TypeScript reference facade are currently
  implemented in `packages/model/src/runtime-spec.ts` and
  `packages/core/src/runtime.ts`. `@vivi2d/runtime` re-exports only the narrow
  runtime surface through package `exports` backed by generated `dist/index.js`
  and `dist/index.d.ts`, and is the intended package boundary for future runtime
  publication review.
- `@vivi2d/runtime-wasm` is intentionally internal. Browser smoke coverage lives
  behind `npm run test:runtime-wasm:browser`, and performance comparisons live
  behind `npm run bench:runtime-wasm`. Its `backend: "auto" | "portable" |
  "native"` option is diagnostic-only; `auto` currently selects the embedded
  native Rust WASM backend when validation succeeds, while portable/reference
  paths remain available for conformance and debugging. Passing those gates does
  not by itself make the package public.
- `@vivi2d/runtime-c-abi` remains the reviewed header source of truth. `npm run
  check:runtime-c-abi` validates the frozen header shape and sample host.
- Its tracked `vivi_png.h` is an internal, non-packed contract artifact. The
  default-off Rust `png-v1` feature alone adds `vivi_png_inspect` and
  `vivi_png_decode`; `npm run check:runtime-png` pins the header, dependency
  closure, pack inventory, exact symbol isolation, and C11/C++17 native hosts.
- `@vivi2d/runtime-native` is an internal implementation workspace. `npm run
  check:runtime-native` validates Rust formatting, Clippy, unit tests, strict
  JSON parser preflight, fixture-backed native evaluation, C ABI
  runtime/model-load/update/expression smoke, and native WASM release-artifact
  export/load/snapshot/hit-test validation, but it does not create a public ABI
  support policy or publication promise.
- Its private `vivi-asset-resolver` crate is a foundation boundary only. `npm
  run check:runtime-asset-resolver` pins the approved Asset Model schema and
  static validator evidence, dependency license/checksum closure, Rust toolchain
  metadata, its exact local-store and local-host consumers, and C ABI
  non-expansion.
- Its private native-only `vivi-asset-store-local` crate is a principal-bound,
  immutable SQLite-backed adapter for the resolver traits. `npm run
  check:runtime-asset-store-local` pins its source/schema/configuration and
  dependency inventory, Rust 1.89 native evidence, exact SQLite `UTF-8`
  encoding, rollback-journal mode, and isolation from WASM and language
  bridges. The reviewed dependency is `rusqlite` 0.40.2 with
  `libsqlite3-sys` 0.38.2's bundled SQLite 3.53.2;
  the Rust crates are MIT-licensed and the bundled SQLite source is public
  domain. The store is one logical database, not a promise that SQLite will
  never create a transient rollback-journal sidecar; WAL is outside the
  reviewed boundary. Its only production consumer is the local Asset host.
- Its private native-only `vivi-asset-host-local` crate is a principal-bound,
  in-process orchestration foundation over the resolver and local store. `npm
  run check:runtime-asset-host-local` pins its source and dependency inventory,
  Rust 1.89 native-only evidence, exact consumer graph, bounded embedded
  materialization and referenced resolution attestations, exact manifest-closure
  ingestion, and all-or-nothing activation-plan preflight. Manifest ingestion
  accepts an expected `chunk_manifest` / `image/png` reference and a closure
  containing the raw manifest object plus each unique referenced chunk exactly
  once after case-insensitive digest normalization. The 64 MiB PNG limit permits
  at most nine supplied objects: one manifest plus at most eight unique chunks.
  Invalid, missing, extra, or case-colliding supplied digests are
  `RefSetMismatch`. Expected-reference kind, size, and media preflight precedes
  closure cardinality and payload inspection. Before any write the host then
  validates the resolver's bounded duplicate-aware approved Stage 1/Stage 2
  parser and received-value JCS address, every object digest and declared size,
  and a full strict PNG decode. It then inserts unique chunks in first manifest
  occurrence order, the received raw manifest, and the exact descriptor last.
  The descriptor is the sole logical publication point.
  Chunk or manifest write failure never attempts it and may leave immutable
  unreferenced GC candidates. A Store error after descriptor insertion is
  attempted is outcome-ambiguous because SQLite may have committed before a
  failed post-commit boundary check; an idempotent retry reconciles either
  state. This ingestion path never creates a descriptor for a partial closure.
  An impossible durable-parser divergence during publication is redacted to the
  host `Store` domain without a stable Asset code. Only `VerifiedAtlasAssetV1`
  metadata is returned, never the manifest, chunks, logical PNG, or RGBA
  buffers. The validation payload classes are approximately
  451 MiB at their combined ceilings: up to 65 MiB of caller-supplied unique
  chunks plus raw manifest, 64 MiB each for staged snapshot caching and logical
  reconstruction, 256 MiB of RGBA, and about 2 MiB of raw/JCS manifest work,
  plus parser, allocator, and store overhead. This is a bounded per-call class,
  not an exact total peak-memory guarantee, caller quota, rate limit, or
  concurrency policy. Plans accept at most 32 sorted, unique IDs matching
  `^atlas:[A-Za-z0-9_-]{1,120}$`; each decoded image is at most 8192 pixels in
  either dimension, and the aggregate limits are 67,108,864 pixels and
  268,435,456 RGBA bytes. The host
  accepts request generations only through 9,007,199,254,740,991 and rejects a
  larger value before I/O. The frozen `vivi2d.evaluationTexturePlan.v1`
  bindings require `image/png`, `srgb`, and `straight`, while the decoder
  attestation is `vivi2d.png.rgba8.v1`. Both ready and missing outcomes carry
  the request generation, but the host does not establish generation
  monotonicity or freshness. A later activation coordinator owns
  latest-generation comparison, stale-result rejection, the texture-upload
  transaction, and atomic publication. The Rust API accepts a typed plan, so a
  future bridge must perform bounded raw-JSON parsing, duplicate-key rejection,
  and Stage 1 validation against the approved byte-identical texture-plan schema
  copy before constructing it. The host preserves resolver, local-store, and
  host-plan error domains while keeping diagnostics redacted: AssetRef
  preflight reports the resolver's `MediaTypeMismatch`, `LimitExceeded`, or
  `HashMismatch` codes, store failures remain the neutral host `Store` kind
  with an optional redacted local-store kind, and missing assets remain a
  result state rather than an error.
  Passing any Asset gate does not connect W7a or Electron IPC, add a language
  bridge, C ABI or WASM export, implement path/principal derivation or ACLs,
  quotas, cancellation, orphan cleanup or general GC, or server
  lifecycle, load evaluations, activate or upload GPU textures, advertise
  referenced-asset capability, or authorize publication.

`npm run check:package-boundaries` enforces the most important publication
guard: a package cannot become public while still exporting `src/*`, and
private `src/*` exports must be explicitly marked as internal workspace-only.
`npm run check:pack-contents` validates the actual npm dry-run tarball for
public and experimental packages, including declared entry points, type files,
and absence of private workspace declarations. `npm run check:packages-types`
keeps package source type contracts valid while the final public package surface
is still being designed.
`npm run check:native-artifact-policy` keeps Vivi2D-owned native WASM artifacts
internal-only, generated from the reviewed Rust release artifact, covered by
browser smoke, and absent as raw tracked `.wasm` files until a public native
artifact policy is approved. The locked MediaPipe viewer WASM files are
third-party tracking assets, not `@vivi2d/runtime-wasm` artifacts; they are
controlled by `packages/viewer/mediapipe-assets.lock.json` and
`npm run check:viewer-mediapipe-assets`.
`npm run check:ip-product-profile` also scans built public Web Component
artifacts for private runtime signatures after `npm run build:packages`. It
also checks the public package export allowlist and the Auto Setup workflow
surface so unsafe deformation terminology cannot re-enter generated setup paths.
`check:architecture-boundaries` includes both tracked and untracked
working-tree files by default, which keeps new pre-commit modules inside the
same public-profile checks. Use `--tracked-only` only for local WIP diagnostics
when untracked scratch files are intentionally incomplete.
`docs/backlog/` is intentionally ignored and must not be used as public API
documentation.
