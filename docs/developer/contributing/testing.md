# Testing Guide

Use the smallest test that covers the behavior while iterating, then run the
broader gate before merging.

## Core Gates

```bash
npm run test
npm run check:packages-types
npm run check:quality
```

`check:quality` is the default local release gate. It includes type checks,
unit/integration tests, IPC checks, i18n checks, package checks, security
patterns, release-surface checks, and runtime/package smoke tests.

## Coverage

```bash
npm run test:coverage
npm run check:quality:coverage
```

Coverage thresholds are current baselines. Raise them when adding tests; do not
lower them for unrelated work.

## E2E

```bash
npm run test:e2e:smoke
npm run test:e2e:workflows
npm run test:e2e:workflow-record
npm run test:e2e:visual
npm run test:e2e:perf
npm run test:e2e:full
```

Use `check:quality:e2e-workflow-record` for pre-release workflow-sensitive
changes because it records the Auto Setup workflow project.

## Documentation Gates

```bash
npm run check:docs-architecture
npm run check:task-guide-paths
npm run check:task-guide-gates
npm run check:troubleshooting-content
npm run docs:user:check
npm run check:docs-public-surface
```

These gates enforce tracked documentation architecture, localized user-doc slug
parity, media fallback rules, contributor task-guide path/gate validity,
sanitized troubleshooting examples, and public-copy/IP scanning.

## Release And Publication Gates

Use these when a change touches public package output, release automation,
vendored runtime assets, or source/publication review policy:

```bash
npm run check:web-npm-alpha-release
npm run check:sdk-unlock:web
npm run check:sdk-external-consumer
npm run check:pack-contents
npm run check:viewer-mediapipe-assets
npm run check:publication-history
npm run check:native-artifact-policy
npm run check:security-patterns
npm run check:source-review-archive
```

`check:viewer-mediapipe-assets` owns the same-origin vendored MediaPipe
WASM/model lock. Publication-history, native-artifact, and security-pattern
checks allow only that locked third-party asset set; do not add broad vendor
exceptions without extending those gates and tests.

## Task-Specific Gates

Start with the task guide that matches your change:

- [Viewer API](task-guides/viewer-api.md)
- [Auto Setup](task-guides/auto-setup.md)
- [Internationalization](task-guides/i18n.md)
- [SDK samples](task-guides/sdk-samples.md)

Task guides list focused gates. Run those before the broad quality gate so
failures point at the smallest relevant surface.
