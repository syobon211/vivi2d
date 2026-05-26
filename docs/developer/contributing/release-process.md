# Release Process

Vivi2D is pre-1.0. Release procedures are still conservative and must be kept
aligned with the public release checklist.

## Release Candidate Flow

1. Confirm package/API status in
   [`public-api-status.md`](../quality/public-api-status.md).
2. Run the standard quality gate.
3. Run release-facing E2E and workflow recording when UI or workflow behavior
   changed.
4. Run release-surface, pack-content, license, SBOM, and secret-history checks.
5. Verify documentation gates and public-copy/IP scanners.
6. Update the release checklist with skipped checks, known risks, and the Git
   history publication model.

## Important Commands

```bash
npm run check:quality
npm run check:quality:e2e-workflow-record
npm run check:release-surface
npm run check:pack-contents
npm run check:history-secrets
npm run check:oss-readiness
```

## Publication Channels

- Root package remains private.
- Only packages marked `experimental` or `public` in
  [`public-api-status.md`](../quality/public-api-status.md) can be considered
  for publication.
- Native/WASM artifacts require their own artifact policy, checksums,
  provenance, and security review before public binary distribution.

## Changelog Security Entries

Security fixes must use an explicit `Security` subsection in `CHANGELOG.md`.
When a fix has a CVE, GHSA, or private vulnerability report identifier, record
that stable identifier in the release notes. If disclosure is embargoed, use a
placeholder entry that names the affected surface, owner, and publication date
without revealing exploit details.

## Website Domain And Hosting Backlog

Before launching public user documentation, acquire `vivi2d.com` through
Cloudflare Registrar and keep DNS on Cloudflare. The first public documentation
site should deploy through Cloudflare Pages or Vercel, with Cloudflare DNS
reserved for future subdomains such as `docs.vivi2d.com`, `api.vivi2d.com`, and
`cdn.vivi2d.com`.

## Git History Publication

The first public release must choose either full-history publication or a clean
public mirror/import. The selected model and required checks are tracked in
[`public-release-checklist.md`](../quality/public-release-checklist.md).
