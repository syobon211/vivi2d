# SDK Samples Task Guide

## When To Use This Guide

Use this guide when adding or changing Web SDK, Viewer API client, or Provider
SDK samples, example READMEs, sample smoke tests, or external-consumer checks.

## Ownership And Boundaries

- Samples must consume public package entry points. They must not import
  monorepo source files or package internals.
- Samples must not commit credentials, full credential-bearing URLs, private
  local paths, prompts, private model data, or provider-private payloads.
- Sample helper code remains local to the sample unless a separate API review
  explicitly promotes it into a package export.
- Sample fixtures must be repository-owned, synthetic, and safe for release.

## Primary Files

- `examples/web-sdk-basic/**`
- `examples/viewer-api-node-client/**`
- `examples/viewer-api-browser-client/**`
- `examples/provider-sdk-layer-proposals/**`
- `examples/provider-sdk-adapter-template/**`
- `scripts/check-web-sdk-basic-*.mjs`
- `scripts/check-viewer-api-samples*.mjs`
- `scripts/check-provider-sdk-samples.mjs`
- `scripts/check-sdk-external-consumer.mjs`

## Tests And Gates

```bash
npm run check:samples
npm run check:samples-public-surface
npm run check:viewer-api-samples
npm run check:provider-sdk-samples
npm run check:sdk-external-consumer
npm run check:pack-contents
npm run check:release-surface
```

## Safe Change Pattern

1. Keep the sample minimal and copy-pasteable from a clean external project.
2. Use the public package root or documented public subpath only.
3. Add static checks before adding browser or Viewer smoke coverage.
4. Keep secrets and service endpoints out of committed files.
5. Update sample README instructions and pack/release-surface checks together.

## Common Failure Modes

- A sample works only because it imports a workspace source file.
- A smoke test misses startup errors because listeners are installed too late.
- A sample README teaches a credential-bearing URL or local path.
- A fixture is regenerated without updating the checksum or static gate.
- A helper promoted from sample code is not documented as a package API.

## PR Checklist

- Samples import only public package entry points.
- Static, smoke, public-surface, pack-content, and external-consumer checks pass.
- Any fixture regeneration is intentional and reviewed.
- README snippets match the actual sample code.
- No sample output exposes credentials, private paths, or source-derived data.

## Related Docs

- [`../../api/web-sdk.md`](../../api/web-sdk.md)
- [`../../api/viewer-api.md`](../../api/viewer-api.md)
- [`../../api/provider-sdk.md`](../../api/provider-sdk.md)
- [`../../quality/public-api-status.md`](../../quality/public-api-status.md)

