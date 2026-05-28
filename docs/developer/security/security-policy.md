# Developer Security Policy

This document is for contributors and maintainers. The root
[`SECURITY.md`](../../../SECURITY.md) is the public vulnerability-reporting
entry point.

## Source Of Truth

- [`threat-model.md`](threat-model.md) owns the attack-surface inventory,
  trust boundaries, assumptions, and out-of-scope threats.
- This file owns security gate ownership and implementation expectations.
- [`ipc-and-local-api.md`](ipc-and-local-api.md) owns Electron IPC and local
  Viewer API guidance.

## Security-Sensitive Surfaces

- Electron main/preload IPC
- file parsing and project import/export
- Viewer API pairing, token, Origin, scope, and rate-limit handling
- provider integrations and local service responses
- public SDK loading paths
- runtime/WASM/native artifacts
- release provenance, SBOM, package contents, and GitHub-hosted surfaces

## Required Gates

```bash
npm run check:security-patterns
npm run check:ipc-contract
npm run check:ipc-contract-sync
npm run check:release-surface
npm run check:history-secrets
npm run check:oss-readiness
```

Use `npm run check:quality:e2e-workflow-record` before release-facing UI or
workflow changes.

## Review Expectations

Security-sensitive changes should state:

- what boundary is touched
- what input is untrusted
- which validation happens before privileged effects
- which tests cover denial, malformed input, and stale/revoked state
- which release or public-copy scanners were run
