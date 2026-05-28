# Performance Baselines

This directory keeps the current local performance snapshots used by the Playwright perf specs:

- `perf-bundle-2026-04-30.json`
- `perf-canvas-open-2026-04-30.json`
- `perf-editor-interaction-2026-04-30.json`
- `perf-startup-2026-04-30.json`
- `perf-fps-2026-04-30.json`
- `perf-memory-leak-2026-04-30.json`
- `perf-timeline-render-2026-04-30.json`

## Naming

- The filename date uses the local measurement date in `Asia/Tokyo`.
- The `recordedAt` field stays in UTC ISO-8601 because it is written with `new Date().toISOString()`.

## Update Rules

Update these baselines only when one of these is true:

- a deliberate performance improvement lands
- a deliberate performance tradeoff is accepted
- the measurement harness changes in a way that invalidates the previous snapshot

When updating:

1. Re-run the perf specs to regenerate the JSON snapshots.
   Use `npm run test:e2e:perf` so the app is rebuilt with `VITE_EXPOSE_E2E=true`
   before Playwright launches the perf project.
2. Rename the files to the new local measurement date if the date changed.
3. Update the `BASELINE_PATH` constants in the perf specs.
4. Keep explanatory `note` fields readable UTF-8 text.
5. Commit the baseline refresh separately from unrelated feature work when possible.

## Scope

These JSON files are descriptive snapshots. The actual pass/fail thresholds live in:

- `e2e/perf-budgets.json`
- `docs/developer/quality/baselines/bundle-budget.json`
- `scripts/check-bundle-budget.mjs`

## CI Monitoring

Performance checks now have a dedicated GitHub Actions workflow:

- `.github/workflows/perf-monitor.yml`

That workflow is intended for:

- pull-request perf reporting without blocking merges automatically
- nightly regression detection on `perf` Playwright specs
- manual runs when a large rendering or workflow change lands

Recommended usage:

1. keep local baseline refreshes separate from feature commits when possible
2. treat pull-request perf runs as report-only diagnostics
3. treat scheduled and manual perf failures as budget regressions first, not as automatic baseline refreshes
4. refresh baselines only after confirming the regression is an intentional tradeoff or a real improvement

## Triage loop

When CI perf monitoring reports a regression:

1. inspect the uploaded `playwright-report/` and `test-results/` artifacts first
2. compare the failing metric against the most recent local baseline snapshot
3. decide whether the change is
   - an accidental regression that should be fixed
   - an intentional tradeoff that needs threshold review
   - a harness change that requires a clean baseline refresh
4. tighten soft budgets only after multiple green runs show stable headroom
5. prefer changing one threshold family at a time (`startup`, `canvas open`, `editor interaction`, etc.)

## Threshold tuning guidance

- Use pull-request runs as signal collection, not as automatic baseline refresh triggers.
- Use scheduled or manual enforced runs to confirm whether a regression is repeatable.
- If a metric improves substantially and stays stable across several runs, tighten the corresponding soft budget before touching the hard budget.
- If a metric regresses but remains within the hard budget for an intentional reason, document the tradeoff before refreshing the baseline snapshot.
- The current `startup`, `canvas open`, `editor interaction`, `fps`, `memory leak`, `timeline render`, and lightweight `bundle` thresholds were tightened after three consecutive local `perf` runs on `2026-05-02`.
- Prefer tightening the app-internal probe family first; keep coarse browser-visible envelopes looser or report-only unless they show repeatable regressions that are visible to real users.

## Editor interaction guidance

`perf-editor-interaction` now tracks two metric families:

- coarse browser-visible timings such as `enterMeshEditMs`
- app-internal probe timings such as
  - `layerPanelClickToNextFrameMs`
  - `selectionStoreSelectLayerMs`
  - `selectionViviMeshReadyMs`
  - `toolButtonClickToNextFrameMs`
  - `viewportSetToolMs`
  - `meshEditAppReadyMs`
  - `meshOverlayVertexDetailsReadyMs`
  - `meshOverlayVisualModelBuildMs`

Treat the internal probe family as the primary regression signal when deciding
whether app-side work actually slowed down. A coarse regression without a
matching probe regression usually points to DOM interaction overhead, browser
automation variance, or measurement-boundary drift rather than a real store or
render hot-path regression.

For this reason, `perf-editor-interaction` may keep coarse envelope metrics
such as `enterMeshEditMs` in report-only mode while enforcing the app-internal
probe family. Refreshing the baseline should not be the first reaction to a
coarse-only regression if the internal probes remain green.

## Canvas open guidance

`perf-canvas-open` now tracks both:

- coarse PSD-import envelope timings such as `openToEditableCanvasMs`
- app-internal milestones such as
  - `projectReadyMs`
  - `layerListReadyInternalMs`
  - `editableCanvasReadyInternalMs`

Treat the internal milestones as the first place to look when `canvas open`
shifts. If the coarse import envelope regresses without the internal milestones
moving, the likely causes are browser-visible DOM work, Electron automation
variance, or measurement-boundary drift rather than the PSD import hot path
itself.

For this reason, `perf-canvas-open` may keep coarse envelope metrics such as
`openToEditableCanvasMs` in report-only mode while enforcing:

- `projectReadyMs`
- `layerListReadyInternalMs`
- `editableCanvasReadyInternalMs`
