# Public API Status

Vivi2D is still pre-public and pre-1.0. Package boundaries may change before
the first OSS release. This document records the current publication intent so
contributors do not accidentally treat internal workspace entry points as stable
APIs.

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
| `@vivi2d/model` | Internal | Owns file/profile types, Zod project schemas, migrations, public-profile checks, binary serialization, model-owned parameter sanitizers, load limits, and Runtime Spec constants. The bare package entry intentionally exposes only types and schemas; parser, migration, profile, serialization, limits, parameter utilities, and runtime-spec APIs are explicit subpaths while the package remains internal. |
| `@vivi2d/editor-core` | Internal | UI-free editor command and safety-contract workspace. It currently owns Safe Auto Setup plan validation and source fingerprinting before wider command extraction. |
| `@vivi2d/loader` | Internal | Browser texture extraction helpers over `@vivi2d/model` file data. It must not depend on `@vivi2d/core` or editor internals. |
| `@vivi2d/runtime` | Internal | Narrow Runtime Spec v1 facade over the TypeScript reference runtime. It now builds a small `dist` facade for export-shape review while remaining private/internal until conformance, packaging, and API/legal review are complete. |
| `@vivi2d/runtime-wasm` | Internal | Experimental WASM-wrapper boundary. It now embeds the private native Rust WASM evaluator behind explicit backend diagnostics while keeping portable and TypeScript reference paths for conformance. It remains private until memory-growth failure behavior, fuzz, benchmark, packaging, and export reviews are complete. |
| `@vivi2d/runtime-c-abi` | Internal | Header-only C ABI design-freeze workspace. It has no native implementation or public support promise yet. |
| `@vivi2d/runtime-native` | Internal | Private Rust workspace for the future native core, C ABI, and WASM bindings. It currently includes strict JSON preflight plus fixture-backed native evaluation for static meshes, parameters, expression presets, binding, skinning, IK, hit testing, and pendulum physics, but has no public support promise. |
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
implementation, not npm publication or stable compatibility promises.
`npm run check:web-npm-alpha-release` covers the additional alpha publication
scaffolding: protected environment policy, trusted-publisher/token hygiene,
release workflow shape, pack/record/verify scripts, release notes template, and
required gates. A real publish still requires a final release tag and npm
trusted publisher configuration outside the repository.
`npm run check:github-release-alpha` covers the repository-level GitHub Release
alpha scaffolding: source/provenance-only asset composition, the draft release
workflow, release notes template, checksum generation, and required gates. A
GitHub Release alpha does not publish desktop installers, native/WASM binaries,
ComfyUI bundles, or npm package tarballs as canonical artifacts.
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
- `@vivi2d/runtime-native` is an internal implementation workspace. `npm run
  check:runtime-native` validates Rust formatting, Clippy, unit tests, strict
  JSON parser preflight, fixture-backed native evaluation, C ABI
  runtime/model-load/update/expression smoke, and native WASM release-artifact
  export/load/snapshot/hit-test validation, but it does not create a public ABI
  support policy or publication promise.

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
