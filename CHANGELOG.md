# Changelog

## 2026-06-01

### Web SDK npm alpha.2

- Published `@vivi2d/web@0.1.0-alpha.2` as a small Trusted Publishing
  follow-up release focused on package metadata, public install guidance, and
  copied-out sample instructions.
- Published through GitHub Actions OIDC Trusted Publishing with npm provenance
  attestation.
- Kept `latest` out of the supported alpha channel. The package and examples
  continue to direct users to `npm install @vivi2d/web@alpha` or exact version
  pins rather than plain `npm install @vivi2d/web`.
- Clarified that alpha.2 does not add new API surface, runtime artifacts,
  native/WASM distribution, or third-party compatibility claims.

### Web SDK npm alpha Trusted Publishing

- Published `@vivi2d/web@0.1.0-alpha.1` through GitHub Actions OIDC Trusted
  Publishing with npm provenance attestation.
- Moved the npm `alpha` dist-tag to `0.1.0-alpha.1`; public install guidance is
  `npm install @vivi2d/web@alpha` or an exact
  `@vivi2d/web@0.1.0-alpha.1` pin.
- Deprecated the bootstrap-only `@vivi2d/web@0.1.0-alpha.0` package with a
  message that points users to `npm install @vivi2d/web@alpha`.
- Noted that npm still keeps `latest` on the deprecated `0.1.0-alpha.0`
  bootstrap package because removing the only original `latest` tag was
  rejected. A post-`0.1.0-alpha.1` `latest` removal attempt also returned a
  registry `400 Bad Request`, so `latest` is not a stable Vivi2D channel.

### Web SDK npm alpha bootstrap

- Published `@vivi2d/web@0.1.0-alpha.0` through the one-time local bootstrap
  path because npm Trusted Publisher settings require the package to exist
  before configuration.
- Recorded that `0.1.0-alpha.0` has no npm provenance attestation. The
  published tarball SHA-256 is
  `982dc5369f35cb0246c04bcdaf9dbfbad5f3a720dc0db86434f16e581babea09`, npm
  integrity is
  `sha512-/I/WiO+HB4c8RxTS71aUYO16NJAJ5BKs92sSWVKRT1KD+pBoYQM0CLm8tnRsK9q0akBwdvEJdgmNsFqAj90yzA==`,
  and npm shasum is `5a60a49f81c18fa8169569942a751d337e8ff977`.
- Configured npm Trusted Publishing for later Web SDK alpha releases through
  GitHub Actions OIDC with repository `syobon211/vivi2d`, workflow
  `publish-web-alpha.yml`, and environment `npm-alpha`.
- Disabled the bootstrap publish script after the one-time package creation so
  future Web SDK publishes must use the Trusted Publishing workflow.
- Noted npm registry behavior for the first package version: npm initially
  attached both `alpha` and `latest` to `0.1.0-alpha.0` and rejected removal of
  `latest` while it was the only version. Public install guidance remains
  `@vivi2d/web@alpha` or an exact pinned version; `latest` is not a stable
  channel promise.

## 2026-05-23

### OSS publication defaults

- Changed first-run Editor and Viewer startup defaults to English document
  language and dark theme, while keeping explicit persisted locale and theme
  choices authoritative.
- Added startup coverage for persisted Japanese/Korean locales and persisted
  light theme so the new defaults do not overwrite user-selected settings.
- Downstream pre-hydration styling that targets `:lang(...)` or
  `[data-theme=...]` should note that the static HTML now starts as
  `lang="en"` and `data-theme="dark"` until the bootstrap code restores any
  persisted user preference.
- Startup no longer reads `prefers-color-scheme`; downstream builds that want
  OS-linked theme selection should reintroduce that policy explicitly around
  the editor bootstrap or theme store.
- Legacy persisted theme objects now preserve their stored `theme` value during
  migration instead of falling through to the default.

## 2026-05-15

### Viewer public-readiness polish

- Reworked the viewer shell around a context toolbar and side sheet so session,
  connection, item, adjustment, and input controls are easier to scan.
- Tightened Japanese and English locale coverage for no-model and loaded-model
  viewer states.
- Added focused viewer locale and accessibility E2E coverage, including
  no-model and loaded-model regression paths.
- Clarified local Viewer API availability and improved dark-theme contrast for
  interactive controls and status badges.

## 2026-05-13

### Source-preserving Auto Setup diagnostics

- Added Layer Graph and Safe Plan diagnostics for Auto Setup so detected parts,
  generated controller bones, held weight data, and preservation decisions are
  visible before applying a setup.
- Added a collapsible diagnostics panel and rig-map preview to keep the main
  Auto Setup dialog readable while still exposing review details when needed.
- Added focused WebM recording helpers plus character PSD workflow recording
  coverage for debugging Auto Setup review states.
- Updated workflow E2E expectations so unreviewed generated weight data remains
  out of the persisted project until an explicit safety gate accepts it.
- Documented Safe Auto Setup diagnostic paths as bracket-quoted, host-path-free
  review strings so public tooling does not rely on filesystem-like paths.

## 2026-05-12

### OSS release hardening

- Moved editor-domain mutation flows into `@vivi2d/editor-core` command modules
  with transaction/rollback coverage for safer refactoring and contribution.
- Added provider SDK boundaries, provider conformance tests, and the
  SDK-backed ComfyUI provider adapter so optional generation integrations stay
  separated from the Apache-2.0 editor/runtime distribution.
- Refactored Pixi, Three.js, and Phaser renderers onto Runtime Spec snapshots
  instead of editor-owned project internals.
- Added the internal `@vivi2d/runtime` package facade plus SBOM, package
  boundary, release-surface, and pack-content gates.
- Hardened native/runtime review findings around translated mesh hit testing,
  runtime metadata validation, generated WASM freshness, and renderer blend
  state synchronization.

## 2026-05-09

### Runtime native/WASM milestone

- Added the internal native Rust WASM evaluator behind `@vivi2d/runtime-wasm`
  with explicit `native`, `portable`, and `auto` backend diagnostics.
- Changed pre-public runtime-wasm diagnostics from `kind: "wasm-prototype"` to
  `kind: "wasm-runtime"` and from `native-wasm-not-bundled` fallback reporting
  to `native-wasm-init-failed` when native initialization falls back.
- Added native WASM artifact provenance checks, generated-byte freshness checks,
  browser smoke coverage, and a bounded WASM linear-memory maximum.

## 2026-05-07

### Public surface and test coverage

- Expanded unit and E2E coverage for workflow recording, manual PNG layer split
  behavior, See-through warnings, media export, lip sync, and rig-health cleanup.
- Split full Playwright coverage into project-sized runs so pre-release checks
  do not rely on one timeout-prone monolithic E2E job.
- Kept public-facing parameter defaults on Vivi2D-owned `vivi.*` IDs while
  leaving viewer auto-mapping free to detect user-provided aliases.
- Moved exploratory design notes to ignored `docs/backlog/`; tracked docs now
  focus on release-facing architecture, API, threat model, and policy.

## 2026-05-04

### Manual PNG workflow and source gating

- Expanded manual raster import into a supported workflow with:
  - `Open Image...`
  - `Import Image As Layer...`
  - `Import Images As Layers...`
  - `Import Folder As Layers...`
  - manual PNG reimport
- Added import guidance for oversized raster assets:
  - large-image auto-centering
  - transparent-padding warnings
  - viewport focusing after import when the imported bounds exceed the current
    canvas
- Formalized project source-kind behavior:
  - `Auto Setup` is now treated as a PSD/See-through workflow
  - single flat PNG projects show Auto Setup as disabled until the user
    manually splits the character into multiple raster ViviMesh layers

### Dialog, locale, and design polish

- Reworked overlay dialogs so they portal to the app window root and center
  against the full viewport instead of local panel/canvas layout.
- Standardized dialog spacing, line-height, and Japanese sentence wrapping.
- Localized remaining English-heavy dialog/menu surfaces, including:
  - rig health
  - timeline helper dialogs
  - quick actions
  - theme/language settings labels
- Added stronger design-oriented E2E guarantees for:
  - dialog centering
  - viewport fit
  - focus entry/return/trap
  - dropdown placement
  - notification layout

### Synthetic visual fixtures and E2E stability

- Kept repository-owned synthetic PSD fixtures as the default for visual and
  structure-sensitive workflows.
- Removed local absolute path assumptions from tests and scripts.
- Refreshed visual baselines and Playwright owner specs so full E2E remains
  green with the newer dialog/layout behavior.

## 2026-05-02

### Manual PNG import

- Added `Open Image...` to create a new project directly from a single PNG.
- Added `Import Image As Layer...` and `Import Images As Layers...` for manual
  cutout workflows.
- Added PNG drag-and-drop handling that opens a new project when none is loaded
  and imports top-level layers when a project is already open.

### Text cleanup

- Removed the remaining mojibake from E2E helpers, targeted tests, and
  release-facing text so menus and automated workflows use stable localized
  labels again.

## 2026-05-01

### Startup and overlay runtime

- Moved the app entry to a lazy `App` bootstrap path to reduce cold-start entry
  pressure before the full editor graph loads.
- Extended the SVG selection-overlay spike from collider/IK to bone and lattice
  visuals so those select-mode overlays no longer require Pixi `Graphics`.
- Kept collider, IK, bone, and overlay interaction logic in their existing
  hooks while shifting visual overlay work out of the Pixi hot path.
- Added a mesh-overlay SVG-host spike so mesh edit visuals can render without
  requiring a runtime Pixi `Graphics` overlay.

### Perf monitoring and docs

- Split the perf monitor workflow into pull-request report-only runs and
  scheduled/manual enforced runs.
- Updated roadmap and baseline documentation to reflect startup-perf work and
  the current `vendor-pixi` investigation direction.
- Added timeout/concurrency and clearer CI perf summaries, plus a compact
  phase-completion summary document.

### Overlay Polish

- Refreshed status and operations notes in the README for the current overlay
  and perf-monitoring state.

## 2026-04-30

### Rigging Workflow

- Expanded Rig Health actions so cleanup and repair flows can jump into Auto
  Setup, Validation, Depth Inspector, and Physics workflows.
- Added global quick actions for reference overlay compare modes and mesh
  heatmap toggles.

### See-through downstream workflow

- Completed the See-through import, cleanup, quality report, eye clipping, eye
  rig, mouth rig, left/right repair, and setup checklist flow.
- Added actionable Depth Inspector and Rig Health integrations for downstream
  repair work.

### Perf and rendering

- Added perf baselines for canvas open and editor interaction in addition to
  bundle, startup, FPS, memory, and timeline render metrics.
- Reduced the main entry bundle by aggressively lazy-loading editor panels and
  dialog hosts.
- Consolidated Pixi runtime responsibilities under `@vivi2d/renderer-pixi` and added a
  scheduled perf-monitor workflow.

### Overlay and diagnostics polish

- Added compare presets, swap/pin controls, and drift summaries for Reference
  Overlay.
- Added mesh heatmap quick actions and tighter overlay/debug wiring for
  clip-target mesh editing.

## Notes

- Performance baselines live under `docs/developer/quality/baselines/`.
- Exploratory roadmap notes are kept outside the tracked release documentation
  until they are reviewed for public distribution.
