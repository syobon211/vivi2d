# GitHub Release Alpha Contract

This document defines the GitHub Release design for the first public Vivi2D
alpha. GitHub Releases are the source-of-truth release index for
repository-level artifacts while signed attestations are still pending. SHA-256
checksums provide tamper evidence, but they are not a substitute for future
signing or Sigstore-style provenance. npm remains the canonical registry for
`@vivi2d/web`; Cloudflare R2 may become a mirror later, but it is not the source
of truth for the initial alpha.

This contract is a release design, not permission to publish. A release may be
created only after the final tagged tree passes the gates below and the public
release checklist records any remaining owner-managed GitHub settings.

## Release Tag And Channel

The first repository release should use an explicit alpha tag:

```text
v0.1.0-alpha.1
```

Rules:

- GitHub release tags use `v<semver>`, for example `v0.1.0-alpha.1`.
- npm package release tags use the package-specific `web-v<semver>` form
  defined in the Web SDK npm alpha contract.
- The initial alpha workflow always creates a draft GitHub Release. Publishing
  the draft is a separate owner action after hosted security settings and
  release notes are confirmed.
- Do not reuse a tag after publication. If a release is wrong, publish a new
  alpha and deprecate or mark the old release as superseded.

## Initial Asset Set

The first GitHub Release is a source/provenance release, not an installer
release. It must attach only reviewable, public-safe artifacts:

| Asset | Source | Required |
| --- | --- | --- |
| `vivi2d-<version>-source-review.zip` | `npm run archive:source-review` | Yes |
| `vivi2d-<version>-source-review-manifest.json` | source-review archive tool | Yes |
| `vivi2d-<version>.cdx.json` | `npm run sbom:generate` | Yes |
| `THIRD_PARTY_NOTICES.txt` | tracked `THIRD_PARTY_NOTICES` | Yes |
| `vivi2d-<version>-release-record.json` | `scripts/prepare-github-release-assets.mjs` | Yes |
| `checksums.txt` | `scripts/prepare-github-release-assets.mjs` | Yes |
| `release-notes.md` | template plus generated release record | Generated for `--notes-file`, not attached |

The initial release must not attach:

- Electron installers, app archives, or auto-updaters.
- Native runtime binaries, standalone WASM runtime artifacts, or C ABI builds.
- ComfyUI, See-through, Python wheels, model weights, or bundled custom nodes.
- User-doc media marked `placeholder` or not reviewed.
- Playwright reports, coverage HTML, local logs, `tmp/**`, or workflow traces.
- `@vivi2d/web` npm tarballs as the canonical package. npm is the canonical
  package registry; GitHub release notes may link to npm and record the package
  digest once published.

Installer assets can be added in a later release only after their own signing,
checksum, notarization, support, and platform QA gates are written.

## Required Gates

Run these gates on the final release tag before preparing assets:

```sh
npm ci
npx playwright install --with-deps chromium firefox webkit
rustup target add wasm32-unknown-unknown
xvfb-run -a npm run check:quality
xvfb-run -a npm run check:quality:e2e-workflow-record
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
npm run check:viewer-mediapipe-assets
npm run check:history-secrets
node scripts/install-pinned-gitleaks.mjs --manifest scripts/release-tool-versions.json
gitleaks detect --source . --no-git
gitleaks git --log-opts="--all" .
```

The workflow must run the same gate family before creating a release. It may
skip installer/package publication work because no binary package is part of the
initial GitHub Release asset set.

## Workflow Shape

The tracked workflow is `.github/workflows/github-release-alpha.yml`.

Required properties:

- `workflow_dispatch` with `version` and `ref` inputs only.
- Top-level `permissions: contents: read`.
- Validation job checks out the requested `v<version>` tag with
  `fetch-depth: 0` and `persist-credentials: false`.
- A read-only verification job checks out the requested tag, downloads the
  prepared release artifact, and verifies the downloaded asset set with
  `scripts/verify-github-release-assets.mjs`.
- Release creation job is the only job with `contents: write`; it must not run
  reusable Actions such as `actions/checkout` or `actions/download-artifact`.
- All Actions are pinned to full commit SHAs and include source-tag comments.
- Gitleaks is installed from `scripts/release-tool-versions.json` before any
  direct gitleaks command.
- The validation job installs the Playwright Chromium, Firefox, and WebKit
  browsers before `npm run check:quality`, because the quality gate includes
  runtime-WASM browser sample smoke tests across all supported engines.
- The validation job installs the Rust `wasm32-unknown-unknown` target before
  `npm run check:quality`, because the runtime-native quality gate builds the
  WASM validation artifact.
- The validation job runs the quality and workflow-record gates under Xvfb,
  because those gates launch Electron in CI and GitHub-hosted Linux runners do
  not provide a display server by default.
- `npm run archive:source-review` runs only after the tree is clean and all
  release-surface gates pass.
- `scripts/prepare-github-release-assets.mjs` generates the release asset
  directory and checksum record.
- `actions/upload-artifact` stores the generated asset set for review with
  retention of at most 14 days.
- The release job consumes the exact generated and verified asset artifact and
  always creates a draft GitHub Release.
- Release creation uses the repository token only inside a single shell step;
  no long-lived personal token is allowed. That same step downloads the
  previously verified artifact with `gh run download`, rechecks the tag and
  release record, and then calls `gh release create`. Because the write-scoped
  job has no checkout, the step must set `GH_REPO` and pass `--repo "$GH_REPO"`
  to `gh run download` and `gh release create`.
- After `gh run download` and before `gh release create`, that same shell step
  must re-check the exact downloaded file set, run `sha256sum -c checksums.txt`,
  and verify the `release-notes.md` digest recorded in the release record.
- Immediately before `gh release create`, the release creation step rechecks the
  tag target with the GitHub API and rejects a mismatch with `GITHUB_SHA`.
- The release record stores a SHA-256 digest and byte size for `release-notes.md`
  even though release notes are not attached as a downloadable asset; the
  verifier checks that digest before publication.
- Release creation must pass every downloadable asset through an explicit
  allowlist and must not attach `release-notes.md`, because that file is already
  used as the release body.

The release job must not check out source, run reusable Actions, rebuild the
project, regenerate assets, re-run the verifier, or rewrite release notes. Its
single shell step may download the reviewed asset set and create the GitHub
Release from those files.

## Release Notes

Release notes must use
`docs/developer/quality/templates/github-release-alpha-notes.md` as the source
template and must include:

- alpha status and pre-1.0 warning
- source commit and release tag
- attached asset list
- SHA-256 checksum instructions
- SBOM scope and digest
- npm package status for `@vivi2d/web`
- explicit non-goals for installers, native/WASM binaries, and ComfyUI bundles
- security reporting path
- known limitations and next planned distribution work

## Local Preparation

For a local dry run after the working tree is clean:

```sh
npm run sbom:generate
npm run archive:source-review
npm run release:github:prepare -- --version 0.1.0-alpha.1 --tag v0.1.0-alpha.1
npm run release:github:review-packet
```

The output lives under `tmp/github-release-assets/` and is ignored. It is
review evidence only. Regenerate it from the final release tag before publishing.
The review packet lives at `tmp/github-release-alpha-review-packet.md` and
includes full workflow/script contents, parsed job/step metadata, and verifier
negative-fixture results for external review.

## Exit Criteria

The GitHub Release alpha is ready only when:

- `npm run check:github-release-alpha` passes.
- `npm run check:quality:e2e-workflow-record` passes on the final tag.
- `npm run archive:source-review` and `npm run sbom:generate` have been run from
  the final tag.
- The generated `checksums.txt` covers every attached artifact except itself.
- The workflow-created release remains draft until GitHub security settings are
  enabled or an owner-approved exception is recorded.
- Public release notes do not promise installer, native/WASM, ComfyUI bundle, or
  stable API support that the attached assets do not provide.
