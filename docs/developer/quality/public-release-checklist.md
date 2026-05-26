# Public Release Checklist

This checklist must pass before making the repository public.

## Current Implementation Snapshot

Last reconciled: 2026-05-27.

Implemented and locally verified:

- Current GitHub Actions workflow references are pinned to full commit SHAs with
  source-tag comments. `npm run check:oss-readiness` enforces this for tracked
  workflows.
- Viewer MediaPipe tracking assets are vendored under
  `packages/viewer/public/vendor/mediapipe/tasks-vision-0.10.35/`, locked by
  `packages/viewer/mediapipe-assets.lock.json`, and checked by
  `npm run check:viewer-mediapipe-assets`.
- Native/WASM artifact policy gates allow only the reviewed vendored MediaPipe
  assets and continue to block unreviewed Vivi2D-owned native/WASM artifacts.
- Source review archive tooling is implemented: `npm run check:source-review-archive`
  validates tracked files and `npm run archive:source-review` requires a clean
  working tree before producing the archive.
- `@vivi2d/web` alpha release dry-run tooling is implemented and locally
  exercised through `npm pack`, release-record generation, release-record
  verification, and `npm publish --dry-run`.

Still open before public release:

- GitHub repository settings that cannot be completed from the source tree:
  Private Vulnerability Reporting or equivalent private contact path, Secret
  Scanning, Push Protection, branch protection, required checks, and CodeQL
  code scanning enablement.
- npm Trusted Publishing must be configured in the npm/GitHub UI for
  `@vivi2d/web`; the tracked `npm-alpha` environment policy records the desired
  settings but does not prove the hosted environment is configured.
- Full git history and hosted surfaces still need a final release-machine scan
  and owner sign-off.
- SBOM/provenance/tarball records must be regenerated from the final release
  tag before any real publish.
- Legal or owner decisions remain open for bundled ComfyUI/See-through
  distribution and public native/WASM artifact signing.

## Governance

- [x] Decide DCO or CLA.
- [x] Identify trademark owner.
- [x] Identify npm organization owner.
- [x] Identify code-signing and release-key owners.
- [x] Decide which packages are public, experimental, or internal.

Governance decisions for the initial OSS release:

| Decision | Owner | Initial decision | Follow-up gate |
| --- | --- | --- | --- |
| Contribution terms | @xltt | DCO, no CLA for the initial public release | Add DCO automation before accepting outside PRs |
| Trademark owner | @xltt | Vivi2D project owner controls the Vivi2D name and logo until a formal entity exists | Revisit before commercial trademark registration |
| npm organization owner | @xltt | Keep root package private; publish only packages marked `experimental` or `public` in `docs/developer/quality/public-api-status.md` | Configure npm trusted publishing before first npm release |
| Code-signing and release-key owner | @xltt | No public native binary signing until native/WASM artifact policy is complete | Finish R5 artifact signing/provenance policy |
| Initial publication intent | @xltt | `@vivi2d/web` remains experimental; all other workspace packages remain internal or internal-app | Update `docs/developer/quality/public-api-status.md` before changing any package status |

## Security Controls

- [x] `SECURITY.md` is complete for the current pre-public support model.
- [x] `SECURITY.md` explicitly covers SDK package vulnerabilities, Viewer API
  token handling bugs, provider boundary escapes, and public package
  supply-chain reports.
- [x] `.github/CODEOWNERS` covers workflows, Electron IPC/security code,
  scripts, release automation, runtime/native packages, and public package
  surfaces.
- [ ] GitHub Private Vulnerability Reporting is enabled or equivalent is documented.
- [ ] GitHub Secret Scanning is enabled or equivalent is documented.
- [ ] GitHub Push Protection is enabled or equivalent is documented.
- [ ] Branch protection and required checks are enabled.
- [ ] CodeQL code scanning is enabled and passing.
- [ ] `npm run check:secrets` passes for the current working tree.
- [ ] `npm run check:history-secrets` passes for the reachable git history.
- [ ] No telemetry, crash reporting, update pings, or remote upload are enabled by default.

Exception tracking for controls that cannot be enabled immediately:

| Control | Reason | Owner | Deadline | Status |
| --- | --- | --- | --- | --- |
| GitHub Private Vulnerability Reporting | Enable when the repository is prepared for public visibility, or publish an equivalent monitored private contact path. Public release is blocked if neither exists. | @xltt | Before publication | Open |
| GitHub Secret Scanning | Enable for the private repository if the account plan supports it, or document unavailable account plan limitations | @xltt | Before R1 exit | Open |
| GitHub Push Protection | Enable for the private repository if the account plan supports it, or document unavailable account plan limitations | @xltt | Before R1 exit | Open |
| Branch protection and required checks | Configure after repository visibility and default branch policy are final; source-side runbooks and required gate names are tracked, but hosted enforcement is not proved locally. | @xltt | Before publication | Open |
| CodeQL code scanning | Workflow exists and is SHA-pinned; hosted code scanning must be enabled and passing after repository publication settings are finalized. | @xltt | Before publication | Open |

## History and Hosted Surfaces

- [ ] Full git history scanned with gitleaks, trufflehog, or equivalent history-aware scanner.
- [ ] Historical file names reviewed for secret-like paths, model weights, private assets, generated media, and See-through material.
- [ ] Findings remediated before publication.
- [ ] Historical secrets rotated regardless of history rewrite outcome.
- [ ] Required `git-filter-repo` or BFG rewrites completed.
- [ ] Post-rewrite repository re-scanned clean.
- [ ] Issues, PRs, comments, Discussions, Wiki pages, and project boards reviewed.
- [ ] Actions logs, workflow summaries, and retained artifacts reviewed.
- [ ] Hosted-surface findings remediated under the same clean criteria as git history.
- [x] Workflow artifacts do not include private paths, source image bytes,
  provider payloads, or unreviewed generated media according to
  `npm run check:workflow-artifact-safety`; final hosted artifact review is
  still required.
- [x] Perf, screenshot, and workflow-recording artifact policy requires synthetic public fixtures through `npm run check:workflow-artifact-safety`; final hosted artifact review is still required.
- [x] `npm run archive:source-review` creates the public-source review archive from `git ls-files` only and requires a clean working tree.

Clean criteria:

- zero unresolved secrets
- zero unresolved license or IP blockers
- zero unresolved model-weight or private-asset findings
- no high or critical security findings without written exception, owner, expiry date, and security/legal sign-off where relevant

## Dependencies and Notices

- [ ] `npm run audit:all` passes for full dependency visibility.
- [ ] `npm run audit:prod` passes for runtime dependency release risk.
- [ ] `npm run check:license-policy` passes.
- [ ] `npm run check:ip-product-profile` passes.
- [ ] Public profile hostile fixtures reject private-profile deformation fields.
- [ ] Public profile hostile fixtures reject private mesh-shaping layers and morph-target lip-sync outputs.
- [ ] Public package exports match the approved allowlist.
- [ ] Public package tarballs and bundles contain no private-profile deformation modules.
- [x] `npm run check:native-artifact-policy` passes for embedded native/WASM runtime artifacts and reviewed third-party MediaPipe exceptions.
- [ ] Public Web Component uses the public runtime model boundary, not the internal authoring model.
- [x] Viewer tracking MediaPipe WASM/model assets are same-origin vendored or
  hash-pinned with recorded provenance; public packaged builds do not depend on
  unpinned third-party CDN fetches.
  Current structure: the reviewed MediaPipe asset set is vendored under
  `packages/viewer/public/vendor/mediapipe/tasks-vision-0.10.35/` and locked by
  `packages/viewer/mediapipe-assets.lock.json`. Run
  `npm run check:viewer-mediapipe-assets` after any dependency, model, or viewer
  tracking change.
- [ ] Public docs and examples use Vivi2D-owned or neutral parameter IDs by default.
- [ ] Auto Setup uses `SafeAutoSetupPlan` and rejects unsafe serialized drafts.
- [ ] Auto Setup source fingerprints include role/mesh preset versions and stay stable after managed setup objects are added.
- [ ] Auto Setup reapply skips user-modified managed objects unless an explicit overwrite UX is approved.
- [ ] Flat single-image projects are blocked from full Auto Setup until the user splits layers.
- [ ] Full Playwright E2E runs through the split `full-*` projects without relying on one long timeout-prone project.
- [ ] Python dependency license review completed if the ComfyUI plugin is shipped.
- [ ] `THIRD_PARTY_NOTICES` generated for release artifacts.
- [ ] CycloneDX SBOM generated for release artifacts.
- [ ] SLSA provenance generated, targeting Build L2 for every package whose
  `docs/developer/quality/public-api-status.md` publication intent is `experimental` or `public`.
- [ ] `npm run build:packages` passes for every public or experimental package.
- [ ] `npm run test:runtime-wasm:browser` passes in Chromium, Firefox, and WebKit if native WASM remains bundled.
- [x] `npm run check:pack-contents` confirms public package tarballs only contain release artifacts for the current package set.
- [ ] `npm run check:release-surface` passes after `npm run build`.
- [ ] `npm run i18n:check:all` passes for all supported UI locales.
- [ ] `zh-Hans` and `ko-KR` translation review manifest entries are current.
- [ ] Native-speaker review is complete for newly added release-candidate
  localized copy, or a documented release exception exists.

## ComfyUI and See-through

- [ ] ComfyUI GPL-3.0 distribution boundary decided.
- [ ] Vivi2D ComfyUI compat plugin license and SPDX expression decided.
- [ ] Tracked `integrations/comfyui/vivi2d_compat_plugin/` source is covered by
  `docs/developer/quality/comfyui-plugin-source-record.json` before public
  repository or source archive publication.
- [ ] Bundled custom-node packs, Python wheels, release archives, or release
  notes that tell users to install `vivi2d_compat_plugin/` use the same reviewed
  source record and have separate artifact checksums or signatures.
- [ ] `npm run check:oss-publication` passes before publishing the repository,
  a source archive, or a clean public mirror that includes
  `integrations/comfyui/vivi2d_compat_plugin/`.
- [ ] See-through source, weights, and derivative assets are not bundled unless legal review approves.
- [ ] Provider docs explain that ComfyUI Python nodes run with local user privileges.

License/legal decision tracking:

| Decision | Owner | Deadline | Status |
| --- | --- | --- | --- |
| ComfyUI GPL-3.0 distribution boundary | @xltt, with legal counsel if distribution remains in scope | Before bundled custom-node pack or binary artifact | Open for bundled artifacts; not blocking source-only publication |
| Vivi2D ComfyUI compat plugin license/SPDX | @xltt | Before public source publication | Decided: Apache-2.0 source, tracked in `comfyui-plugin-source-record.json` |
| See-through source, weights, and derivative asset policy | @xltt, with legal counsel if bundled artifacts remain in scope | Before publication | Open |

## Release Artifact Decisions

| Decision | Owner | Deadline | Status |
| --- | --- | --- | --- |
| CycloneDX SBOM generator and CI integration | @xltt | Before R5 implementation begins | Implemented for local and workflow validation with `@cyclonedx/cyclonedx-npm`, `npm run sbom:generate`, and `npm run check:sbom`; final release attachment must be regenerated from the release tag |
| Native/WASM checksum and signing mechanism | @xltt | Before native or WASM artifacts are public | Open |
| GitHub Actions SHA pinning policy | @xltt | Before repository publication | Implemented for current workflows: Actions are pinned to full commit SHAs with tag comments and checked by `npm run check:oss-readiness` |

The native/WASM signing decision above applies to Vivi2D-owned native runtime
artifacts. The vendored MediaPipe WASM files are third-party viewer tracking
assets and are handled by `check:viewer-mediapipe-assets`, the MediaPipe
lockfile, and the release-surface scanners.

## npm Alpha Gates

These gates apply before publishing any npm package, including an
`@vivi2d/web` alpha:

- [ ] npm Trusted Publishing or equivalent provenance is configured for the
  package.
- [x] Publish workflow actions are SHA-pinned, or an owner-approved exception is
  documented.
- [ ] CycloneDX SBOM is generated and attached to the release artifact set from
  the final release tag. The generator and workflow path are implemented.
- [x] Package tarball digest is recorded in release notes or provenance
  artifacts.
- [x] `npm pack --dry-run` contents are reviewed for the current
  `0.1.0-alpha.0` package shape. Rerun for the final release tag.
- [ ] `npm run check:sdk-unlock:web` passes before changing `@vivi2d/web`
  implementation scope or publication status.

Local dry-run evidence for an npm alpha should live under an ignored directory
such as `tmp/web-alpha-dry-run/` and should include the packed tarball, pack
JSON, release record, gate transcripts, SBOM digest, and release-notes draft.
Those artifacts are disposable review evidence; rerun the same commands on the
final release tag before real publication.

Native/WASM checksum and signing decisions are required before public
native/WASM artifact publication. They do not block an `@vivi2d/web` alpha when
native/WASM binaries are absent from the published package.

## Product and Contributor Docs

- [ ] `CONTRIBUTING.md` exists.
- [ ] `CODE_OF_CONDUCT.md` exists.
- [ ] PR and issue templates exist.
- [ ] `docs/developer/architecture/overview.md` exists.
- [ ] `docs/developer/contributing/package-boundaries.md` exists.
- [ ] `docs/developer/security/threat-model.md` exists.
- [ ] `docs/developer/quality/public-api-status.md` exists.
- [ ] `docs/developer/api/web-sdk.md`,
  `docs/developer/api/viewer-api.md`, and
  `docs/developer/api/provider-sdk.md` exist and match the current SDK/API
  preview status.
- [ ] `docs/developer/api/viewer-api.md` exists and matches the experimental Viewer API
  contract fixtures, scopes, errors, prop safety rules, and unsupported
  surfaces.
- [ ] `docs/developer/api/spec/runtime-spec-v1.md` exists and matches the implemented runtime conformance surface.
- [ ] `docs/developer/ip/policy.md` exists.
- [ ] `docs/developer/quality/release-policy.md` exists and names support, provenance, SBOM, and native/WASM artifact gates.
- [ ] `docs/developer/contributing/i18n/README.md` exists and matches supported locale IDs, review
  gates, and public-copy terminology rules.
- [ ] `docs/developer/quality/docs-migration-manifest.json` records every
  archived roadmap/planning source with promoted targets or explicit drop
  rationales.
- [ ] Git history publication model is selected and recorded: full-history
  publication with history-surface scans, or clean public mirror/import with
  private provenance archive ownership.
- [ ] Major architecture decisions have ADRs under `docs/developer/adr/`.
- [ ] `THIRD_PARTY_NOTICES` exists and has been replaced with generated notices for public artifacts.
- [ ] `docs/backlog/` is ignored, untracked, and contains only local design notes.

## Public Website And Domain

- [ ] Acquire `vivi2d.com` through Cloudflare Registrar.
- [ ] Keep authoritative DNS on Cloudflare.
- [ ] Choose the first user-docs host: Cloudflare Pages or Vercel.
- [ ] Reserve Cloudflare DNS entries for future `docs.vivi2d.com`,
  `api.vivi2d.com`, and `cdn.vivi2d.com` subdomains.
- [ ] Confirm public website routes consume tracked `docs/user/` content rather
  than ignored backlog or private planning notes.

## Final Local Gate Runbook

Run this local gate sequence immediately before making the repository public or
before publishing an experimental package. Record the command output location in
the release notes or owner checklist.

```sh
npm run check:quality
npm run check:quality:e2e-workflow-record
npm run check:oss-readiness
npm run check:oss-publication
npm run check:release-surface
npm run check:pack-contents
npm run check:ip-product-profile
npm run check:clean-room-coverage
npm run check:license-policy
npm run notices:check
npm run check:sbom
npm run check:publication-history
npm run check:hosted-release-surfaces
npm run check:workflow-artifact-safety
npm run check:source-review-archive
npm run archive:source-review
npm run check:viewer-mediapipe-assets
npm run check:history-secrets
gitleaks version
gitleaks detect --source . --no-git
gitleaks git --log-opts="--all" .
```

Four-locale release checks:

- [ ] `npm run i18n:check:all` passes for `en`, `ja`, `zh-Hans`, and `ko-KR`.
- [ ] Editor and Viewer smoke screenshots are reviewed for all four locales.
- [ ] Release-adjacent dialogs, including integration settings, media export,
  `.vivid` import/export, Auto Setup, Manual Split, and Viewer side sheets, have
  no unintended English fallback, mojibake, tofu glyphs, or text clipping.
- [ ] Any screenshots, videos, workflow recordings, and Playwright artifacts
  intended for release docs use public fixtures and are scanned as release
  surfaces.
- [ ] Public screenshots and recordings do not expose private assets, provider
  prompts, source artwork diagnostics, stress-check scalar values, preview
  geometry, or internal algorithm terminology.

The direct `gitleaks` commands are external-tool confirmation runs. They do not
replace `npm run check:history-secrets`, because the npm script also captures
Vivi2D-specific policy expectations and documented allowlists.
The history-mode command above is verified with `gitleaks 8.30.1`. If the
release machine uses a different `gitleaks` version, record `gitleaks version`
and the exact history-scan command in the release notes, and confirm the command
exits with code `0` while reporting that at least one reachable commit was
scanned.
