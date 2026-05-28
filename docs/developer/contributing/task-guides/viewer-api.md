# Viewer API Task Guide

## When To Use This Guide

Use this guide when changing the Viewer API protocol, local API server,
Viewer API client package, protocol fixtures, examples, or Viewer API E2E
coverage.

## Ownership And Boundaries

- The Viewer API is still preview-only and must remain loopback-first,
  user-mediated, scoped, and explicit about pairing, token, Origin, and rate
  limits.
- Protocol-visible request, event, scope, and error names are public-surface
  candidates. Avoid third-party product or protocol naming.
- Protocol changes must update both contract fixtures and
  [`../../api/viewer-api.md`](../../api/viewer-api.md).
- Browser and Node samples must consume public package entry points, not
  monorepo internals.

## Primary Files

- `packages/viewer/electron/viewer-api-*.cjs`
- `packages/viewer/src/api/**`
- `packages/viewer/contracts/viewer-api/**`
- `packages/viewer-api-client/src/**`
- `examples/viewer-api-node-client/**`
- `examples/viewer-api-browser-client/**`
- `scripts/check-viewer-api-*.mjs`

## Tests And Gates

```bash
npm run check:viewer-api-contracts
npm run check:viewer-api-samples
npm run check:viewer-api-e2e
npm run check:viewer-tests
npm run check:security-patterns
npm run check:release-surface
```

Run `npm run check:release-surface` when contracts, examples, screenshots, or
public protocol docs change.

## Safe Change Pattern

1. Update schema, capability, dispatch, auth, rate-limit, or transport helpers
   in small slices.
2. Add or update contract fixtures before widening sample behavior.
3. Update the Viewer API client wrapper only after the protocol shape is clear.
4. Update Viewer API docs and samples in the same pull request when the change
   is externally visible.
5. Run focused Viewer API gates before the broad quality gate.

## Common Failure Modes

- A request works in the UI but is missing from contract fixtures.
- A fixture exposes internal-only names or unstable error details.
- A sample stores tokens or endpoint details in an unsafe place.
- A security boundary helper changes without focused tests.
- Capabilities and request-scope metadata drift apart.

## PR Checklist

- Contract fixtures updated or explicitly unchanged.
- Capability, scope, error, and close-code behavior documented.
- Node and browser samples still use public client APIs.
- Security-sensitive behavior has focused tests.
- Public API status remains accurate.

## Related Docs

- [`../../api/viewer-api.md`](../../api/viewer-api.md)
- [`../../security/ipc-and-local-api.md`](../../security/ipc-and-local-api.md)
- [`../../security/threat-model.md`](../../security/threat-model.md)
- [`../../quality/public-api-status.md`](../../quality/public-api-status.md)

