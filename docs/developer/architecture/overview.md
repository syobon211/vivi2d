# Architecture

This document describes the repository structure that is currently implemented.
Vivi2D is still pre-1.0, so package boundaries may change before the first OSS
release, but the checked-in code currently follows the boundaries below.

## Current Repository Layers

```text
electron/                  Electron main, preload, IPC contract, and security checks
src/                       React editor renderer
  components/              Editor UI, dialogs, panels, and canvas controls
  hooks/                   Renderer orchestration hooks
  lib/                     Editor workflow logic, import helpers, auto setup, and workers
  public-profile/          Public profile fixtures and safety checks
  stores/                  Zustand editor state and project I/O actions
  workers/                 Browser worker entry points
e2e/                       Playwright projects, fixtures, and workflow helpers
scripts/                   Quality, release, security, and publication checks
packages/
  core/                    Runtime-neutral evaluation, validation, math, and compatibility shims
  model/                   File/profile types, schemas, migrations, serialization, and runtime spec constants
  editor-core/             UI-free editor command and safe plan contracts
  loader/                  Browser texture extraction helpers over the model contract
  runtime/                 Narrow Runtime Spec facade and conformance entry point
  runtime-wasm/            Private WASM evaluator wrapper and browser smoke target
  runtime-c-abi/           Private C ABI header and native host-test boundary
  runtime-native/          Private Rust native evaluator workspace
  renderer-pixi/           Pixi rendering and editor/runtime sync boundary
  renderer-three/          Three.js runtime adapter
  renderer-phaser/         Phaser runtime adapter
  provider-sdk/            Provider capability and artifact contracts
  web/                     Experimental Web Component package
  viewer/                  Standalone Electron viewer app
  viewer-bridge-obs/       Optional internal viewer bridge adapter
  provider-comfyui/        SDK-backed ComfyUI provider adapter
```

Long-form design notes and exploratory plans are local-only and belong under
ignored `docs/backlog/`. Release-facing docs should stay in tracked `docs/`.
Optional provider plugins, such as the Python ComfyUI custom-node scaffold, live
in separate repositories outside this Apache-2.0 editor/runtime repo unless the
release checklist records separate license, dependency, and distribution review.
A local development checkout may sit next to this repository, but it is not part
of the Vivi2D workspace or release artifact. The current ComfyUI custom-node
install layout is tracked in
[`comfyui-plugin-layout.md`](comfyui-plugin-layout.md).

User-facing documentation is a separate public surface from developer docs. Its
locale, media, frontmatter, and future website route contract is tracked in
[`user-docs-site.md`](user-docs-site.md).

## Dependency Rules

- `packages/model` owns runtime-neutral file/profile contracts, migrations,
  parsers, binary serialization, and public Runtime Spec constants.
- `packages/loader` may depend on `packages/model` but must not depend on
  `packages/core` or editor internals.
- `packages/editor-core` owns UI-free editor safety contracts and command
  extraction targets. It may depend on `packages/core` and `packages/model`,
  but must not depend on React, Electron, renderer adapters, providers, or
  Zustand stores.
- `packages/core` is intentionally kept as a private runtime/math
  compatibility package for the pre-public refactor. Schema, parser,
  public-profile, load-limit, Runtime Spec, and model-owned parameter sanitizer
  exports live in `packages/model`; editor mutation commands live in
  `packages/editor-core`. `packages/core` may keep narrow compatibility shims
  for existing internal callers while Q3/Q6 migration continues, but it must
  stay runtime-neutral and avoid React, DOM, Electron, Pixi, ComfyUI, providers,
  or editor stores.
- Electron main/preload code is the only code with privileged desktop APIs.
- Renderer code must cross privileged boundaries through the documented IPC
  contract in `electron/ipc-contract.cjs`.
- `packages/viewer` has its own Electron IPC contract under
  `packages/viewer/electron/ipc-contract.cjs`.
- `packages/provider-sdk` owns provider capability IDs, request/result limits,
  artifact path policy, and hostile-payload validation. Provider adapters must
  return artifacts or proposals through this boundary instead of mutating
  projects directly.
- `packages/provider-comfyui` adapts the private ComfyUI workflow client to the
  provider SDK boundary. ComfyUI and returned artifacts are untrusted local
  input.
- Public-facing load paths must hydrate through `publicProfileV1` and fail
  closed on private-profile deformation fields.
- Auto Setup must route generated operations through `SafeAutoSetupPlan` and
  public-profile validation before applying them.
- `npm run check:architecture-boundaries` enforces the current lightweight
  dependency rules.
- `npm run check:import-cycles` enforces the R1 import-cycle baseline recorded
  in `docs/developer/quality/baselines/import-cycles.json`.

## Public API Rules

- The root package remains `private: true`.
- `@vivi2d/web` is the only current experimental npm-style package with
  `dist` exports. Its root import is side-effect free; custom-element
  registration happens through `defineViviModelElement()` or the guarded
  `@vivi2d/web/auto-register` subpath.
- Other workspace packages are internal or internal-app packages until their
  public API surfaces are reviewed.
- Public packages export built `dist` entry points, not `src/*`. The private
  `@vivi2d/runtime` facade already follows this export shape through package
  `exports` for review, even though it is not public yet.
- Package publication intent is encoded in `package.json` under
  `vivi2d.publication`.
- `npm run check:package-boundaries` blocks accidental public `src/*` exports.
- `npm run check:pack-contents` validates npm dry-run tarballs for public and
  experimental packages.
- `npm run check:packages-types` type-checks package source boundaries.
- Current package publication intent is tracked in `docs/developer/quality/public-api-status.md`.
- Runtime Spec and TypeScript reference runtime status is tracked in
  `docs/developer/api/index.md` and
  `docs/developer/quality/public-api-status.md`.
- The implementation-facing Runtime Spec v1 is tracked in
  `docs/developer/api/spec/runtime-spec-v1.md` and backed by `packages/model/src/runtime-spec.ts`.
- Large UI and local-API split budgets are guarded by
  `npm run check:ui-module-budget` and
  `docs/developer/quality/baselines/ui-module-budget.json`.
- `@vivi2d/runtime` is the internal package boundary for the narrow runtime
  facade; it must not export editor mutation APIs or authoring-only model
  structures. Its package export points at generated `dist` facade files, and
  `npm run build:packages` builds it before the experimental web package.
- Renderer adapters should draw from runtime render snapshots
  (`getRenderList()` / `getMeshSnapshot()`) rather than editor project layers.
  Temporary structural adapters may exist only to bridge current app callers
  while the runtime facade migration is in progress.

## Electron IPC Boundary

- Renderer-to-main channels are documented in `electron/ipc-contract.cjs` and
  `packages/viewer/electron/ipc-contract.cjs`.
- Security wrappers verify trusted senders and validate contracted payloads
  before dispatching to privileged handlers.
- Handler modules still perform semantic checks such as path allowlists,
  file-size limits, loopback URL policy, and ComfyUI path validation.
- Changes to preload APIs must update the contract and run
  `npm run check:ipc-contract` plus `npm run check:ipc-contract-sync`.

## Quality Gate Entry Points

- `npm run check:quality` runs the core local release gate, including native
  WASM browser smoke in Chromium, Firefox, and WebKit. It is implemented by
  `scripts/run-quality-gates.mjs`. Fresh local environments should run
  `npx playwright install chromium firefox webkit` once first. The full local
  gate also requires the Rust toolchain used by `@vivi2d/runtime-native`.
- `npm run check:quality:coverage` adds coverage collection.
- `npm run check:quality:e2e-smoke` adds smoke E2E.
- `npm run check:quality:e2e-workflow-record` adds smoke E2E and records the
  Auto Setup workflow project.
- Full Playwright coverage is split by project through
  `scripts/run-e2e-projects.mjs` to avoid one timeout-prone monolithic run.
