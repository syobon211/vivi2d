---
stability: preview
---

# Web SDK Preview

`@vivi2d/web` is the experimental browser SDK for loading and displaying
public-profile `.vivi` models in external web apps.

## Current Shape

Primary entry points:

- `loadViviWebModel(source, options?)`
- `createViviWebPlayer(options)`
- `defineViviModelElement(options?)`
- `isViviWebError(error)`
- `@vivi2d/web/auto-register`
- `@vivi2d/web/umd`

The root import is side-effect free. Custom-element registration must be
explicit or use the guarded `auto-register` subpath.

The package is built as a browser-facing SDK. Pixi and other browser runtime
dependencies are bundled into the reviewed `dist/**` output for the current
alpha shape; the published package must not expose private workspace packages
as npm dependencies.

## Current Gates

- `npm run check:samples`
- `npm run check:sdk-external-consumer`
- `npm run check:sdk-unlock:web`
- `npm run check:pack-contents`
- `npm run check:web-npm-alpha-release`
- `npm run check:ip-product-profile`

The current unlock state permits Phase 1 programmatic SDK implementation and
the reviewed experimental npm alpha surface. It does not approve stable
compatibility promises or additional package promotion. Later versions must use GitHub Actions OIDC Trusted Publishing and must follow the release contract in
`docs/developer/quality/web-npm-alpha-release.md`, the protected npm publisher
configuration, and a final release-tag dry-run/publish record.

## Alpha Release Shape

The current alpha version is `0.1.0-alpha.1`. It was published through GitHub
Actions OIDC Trusted Publishing and has npm provenance attestation. Use
`npm install @vivi2d/web@alpha` or pin `@vivi2d/web@0.1.0-alpha.1` for
experiments.

`0.1.0-alpha.0` was the documented one-time bootstrap package. It has no npm
provenance attestation, is deprecated on npm, and is retained only as an audit
record for the package-creation exception. `latest` currently resolves to that
bootstrap package, so `latest` is not a stable install channel for Vivi2D.

A valid npm alpha dry-run records:

- the exact packed tarball from `npm pack --workspace @vivi2d/web --json`
- the tarball SHA-256, npm integrity, package version, git commit, and alpha
  dist-tag
- repository-wide CycloneDX SBOM path and digest
- gate transcripts for pack contents, SBOM, production audit, and web npm alpha
  release checks

Dry-run artifacts are local review evidence only. They should be regenerated
from the final release tag immediately before publication so the source commit,
tarball digest, provenance, SBOM, and release notes match. The bootstrap audit
record for `0.1.0-alpha.0` is tracked in
`docs/developer/quality/web-npm-alpha-bootstrap-record.md`.

## Examples

- `examples/web-sdk-basic/README.md`
- `packages/web/README.md`
