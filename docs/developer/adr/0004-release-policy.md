# ADR 0004: Release Engineering Policy

## Status

Accepted for the pre-public OSS refactor.

## Context

Vivi2D is planned for OSS publication, but not every workspace package or native
artifact is ready for public support. Release automation must avoid long-lived
secrets, broad workflow permissions, and ambiguous provenance.

## Decision

Use minimal GitHub Actions permissions by default. Future npm publication should
use trusted publishing and provenance instead of long-lived npm tokens. Release
artifacts must include generated notices and a reproducible CycloneDX SBOM.
Native or WASM binary publication requires an explicit checksum/signing policy
before artifacts become public.

## Consequences

- `npm run check:quality` includes release-surface, package-boundary, license,
  notice, SBOM, audit, and OSS-readiness gates.
- Repository settings such as Secret Scanning, Push Protection, branch
  protection, and Private Vulnerability Reporting remain manual public-release
  checklist items.
- OpenSSF Scorecard is deferred until the repository is public.
