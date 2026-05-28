# Security Policy

Vivi2D is a desktop-first editor and viewer that handles local project files,
images, PSDs, generated assets, Electron IPC, optional local providers, and
release artifacts. Please treat suspected security issues carefully and do not
post vulnerability details in public issues, pull requests, Discussions, logs,
screenshots, or social media.

Do not disclose vulnerability details publicly until a maintainer has confirmed
that a fix or mitigation is available and disclosure timing is coordinated.

## Supported Versions

Vivi2D is pre-public and pre-1.0. Until the first public release, security fixes
target the current `main` branch only.

After the first public release, this table must be updated explicitly:

| Version | Supported |
| --- | --- |
| `main` (pre-public) | Yes |
| All tags, local snapshots, and older commits | No |

Forks are maintained by their fork owners and are outside the Vivi2D security
support boundary.

## Reporting a Vulnerability

After the repository becomes public, use GitHub Private Vulnerability Reporting
for this repository. Do not open a public issue, pull request, Discussion, or
chat thread for vulnerability details.

If GitHub Private Vulnerability Reporting is not available, public release is
blocked until maintainers publish an equivalent monitored private contact path
for the repository. Do not open public issues or discussions for vulnerability
details.

Please include as much of this as you can safely share:

- affected commit, release, package, or app surface
- whether the issue involves Electron IPC, file parsing, project import/export,
  Viewer API, runtime/WASM/native code, provider integration, dependency
  supply chain, or release artifacts
- reproduction steps or a minimized proof of concept
- expected impact and whether user files, credentials, generated assets, or
  local services are involved
- whether the issue is already public anywhere
- any coordinated disclosure deadline

Do not include real user secrets, private artwork, proprietary model files, or
unreviewed generated assets unless a maintainer explicitly asks for a secure
private transfer path.

## What to Report Privately

Please use the private vulnerability path for:

- code execution, sandbox escape, or privilege escalation
- Electron main/preload IPC bypasses or renderer-to-main confused deputy bugs
- path traversal, symlink/junction escapes, unsafe external URL handling, or
  arbitrary local file reads/writes
- parser denial-of-service or memory exhaustion in `.vivi`, `.vivb`, `.vivid`,
  PSD, image, audio, or bundle inputs
- Viewer API authentication, pairing, token, origin-binding, scope, or local
  WebSocket bypasses
- SDK package vulnerabilities, including `@vivi2d/web` model-loading issues,
  Viewer API client token handling bugs, provider SDK boundary escapes, or
  public package supply-chain/provenance problems
- unsafe handling of ComfyUI, See-through, or other local provider responses
- leaks of tokens, secrets, private paths, project files, generated artifacts,
  model weights, or local user identifiers
- release artifact substitution, dependency compromise, SBOM/provenance issues,
  or GitHub Actions artifact/log leaks

General bugs without security impact can use public issue templates.

## Project Security Defaults

- Vivi2D application code does not enable telemetry, crash reporting, update
  ping, analytics, or remote upload by default.
- ComfyUI and other provider integrations are treated as untrusted local
  services even when they run on loopback.
- Electron privileged actions must pass through typed IPC contracts and main
  process validation.
- The Viewer API is disabled by default, loopback-only, scoped, and
  user-mediated. Browser clients must match an approved `Origin`.
- API prop file handles are user-selected, opaque, grant-bound, origin-bound,
  short-lived, one-time-use, and specified in `docs/developer/api/viewer-api.md`.
- Public runtime and web package surfaces must use the public model boundary and
  must not expose private authoring/deformation internals.

## Maintainer Response

Maintainers should acknowledge private vulnerability reports within 5 business
days. Until a public release process is formalized, the project owner is the
security owner and coordinates triage, fix scope, disclosure timing, and credit.

Expected triage steps:

1. Confirm receipt and whether more information is needed.
2. Classify severity, affected surfaces, and supported versions.
3. Keep exploit details private until a fix or mitigation is available.
4. Add or update regression tests where practical.
5. Prepare release notes or an advisory that avoids unnecessary exploit detail.
6. Credit reporters unless they request otherwise.

## Public Release Security Controls

Before making the repository public, maintainers must enable or document an
equivalent for:

- GitHub Private Vulnerability Reporting
- GitHub Secret Scanning
- GitHub Push Protection
- branch protection with required checks
- CodeQL code scanning
- dependency update review
- release artifact provenance, notices, and SBOM generation

Local pre-release gates:

```bash
npm run check:quality
npm run check:quality:e2e-workflow-record
```

Secret scanners can also be run in isolation while investigating a suspected
leak:

```bash
npm run check:secrets
npm run check:history-secrets
```

External-tool cross-check:

```bash
# current working tree without walking git history
gitleaks detect --source . --no-git
# reachable git history and current tree
gitleaks detect --source .
```

The repository scripts scan the current tree and reachable history for
high-confidence problems. The direct `gitleaks` commands are an external-tool
cross-check: one pass catches the current working tree quickly, and the other
walks reachable history. They complement, but do not replace, a hosted-surface
review of GitHub issues, pull requests, Discussions, Actions logs, retained
artifacts, and release uploads before publication.
