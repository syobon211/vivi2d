# Contributor Troubleshooting

This page helps contributors isolate common local failures without weakening
the gate that caught them. If a gate fails, fix the cause or document a
maintainer-approved exception. Do not remove or disable gates to make a pull
request pass.

Use synthetic, sanitized examples in documentation and issues. Do not paste raw
host-specific terminal dumps, filesystem paths, stack traces, credentials, or
private project data.

## Reading `check:quality`

`npm run check:quality` runs many focused gates in sequence. The first failing
command is usually the best place to start. Re-run that focused command after a
fix instead of repeating the full gate every time.

Common pattern:

```text
[quality] npm run <focused-gate>
[focused-gate] failed:
- <sanitized explanation>
```

After the focused gate passes, run `npm run check:quality` again before merge.

## Focused Gate Strategy

- Type or package errors: run the package-specific type or build command.
- UI behavior errors: run the smallest component, unit, or Playwright project.
- Documentation errors: run the documented docs gate directly.
- Release-surface errors: inspect the public file or sample named by the gate.

## Gate Failure Escalation

If a gate appears to reject a safe change, use the
`Gate failure review` issue template or a pull request comment with the label
`gate-false-positive`. Include:

- the focused command that failed
- the sanitized failure summary
- the repository-relative file paths involved
- the smallest reproduction step
- why you believe the change is safe

Do not paste raw output directly. Do not include raw project files, credentials,
local machine paths, or private assets. A maintainer will decide whether the
rule should be narrowed, the documentation should change, or the code should be
adjusted.

## Playwright And Electron

- Rebuild before E2E when renderer, preload, or Electron entry files changed.
- Use `npm run test:e2e:smoke` before wider workflow or visual projects.
- On Linux CI, Electron runs under a virtual display; local Windows and macOS
  runs do not need that wrapper.
- For flaky visual work, prefer a focused spec plus an attached screenshot or
  video rather than broad retries.

## Windows And Line Endings

- Use `git diff --check` before committing.
- Keep generated binary or media files out of text normalization rules.
- Prefer repository-relative paths in docs and errors.
- Avoid examples that depend on a user-specific home directory.

## Native, Runtime, And WASM Gates

Runtime gates protect package boundaries and artifact policy. If a native or
WASM gate fails, first confirm whether the change touches runtime code,
generated artifacts, headers, or release metadata. Public binary or WASM
distribution requires stronger provenance checks than internal source changes.

## Internationalization

If locale checks fail:

- confirm every locale has the same key set
- update translation review metadata for changed namespaces
- check URL/test overrides do not persist into user settings
- run the relevant locale smoke or layout gate for visible text

## Documentation Architecture And Public Surface

`npm run check:docs-architecture` protects the documentation layout and backlog
rules. `npm run check:docs-public-surface` scans public documentation surfaces,
including developer docs and localized user docs.

Use tracked developer or user docs for current guidance. Keep roadmap,
scratchpad, and review-loop notes in ignored backlog files.

## Auto Setup And IP Boundary Gates

Auto Setup failures in the compliance gate usually mean that editor-only
diagnostics, generated details, stale accepted-mask metadata, or public copy
need review. The gate is intentionally conservative.

Allowed troubleshooting steps:

- identify which public surface or safe summary the gate names
- check whether the changed file belongs to Auto Setup, docs, examples, or a
  release artifact
- confirm the pull request uses the public workflow gate named in the task guide
- ask a maintainer when the failure involves IP, public terminology, or review
  signoff

Do not document scanner internals or teach ways around the gate.

## Pack Contents And Release Surface

If a pack or release-surface gate fails, inspect whether a public package,
sample, generated fixture, source map, screenshot, or docs artifact now includes
material that was meant to stay internal. Fix the artifact or narrow the package
manifest; do not broaden public package contents casually.

## Viewer API Contract Drift

Viewer API failures usually mean contract fixtures, capabilities, client SDK
behavior, and samples disagree. Update the protocol fixture and the client or
sample together, then run the Viewer API gates listed in the
[Viewer API task guide](task-guides/viewer-api.md).
