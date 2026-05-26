# Web SDK npm Alpha Release Contract

This document defines the release design for the first `@vivi2d/web` npm alpha.
It is a design contract, not permission to publish. The package may be published
only after every exit gate in this document and the public release checklist is
green on the final release tree.

## Scope

`@vivi2d/web` is the first npm package we intend to make installable by external
developers. The alpha goal is narrow:

- publish the browser-facing Web SDK package as `@vivi2d/web`
- let external apps load public-profile `.vivi` files
- support the documented programmatic player and guarded custom element entry
  points
- keep examples, internal workspaces, native/WASM runtime packages, provider
  SDKs, viewer APIs, ComfyUI bundles, and source documentation out of the npm
  tarball

The alpha is intentionally pre-1.0. It does not promise stable file-format
compatibility, native runtime ABI stability, official WASM binary distribution,
Unity SDK support, Viewer API stability, provider SDK stability, or
third-party-product compatibility.

## Current Package Boundary

The current package contract is:

- package name: `@vivi2d/web`
- publication status: `experimental`
- package root import: side-effect free ESM
- side-effect entry points: `@vivi2d/web/auto-register` and `@vivi2d/web/umd`
- packed files: `dist` only, plus npm's always-included package metadata
- provenance setting: `publishConfig.provenance: true`
- access setting: `publishConfig.access: "public"`

`npm run check:sdk-unlock:web`, `npm run check:pack-contents`, and
`npm run check:sdk-external-consumer` are the current package-boundary gates.
They do not by themselves authorize publication; they prove the package shape is
ready for release review.

Current local dry-run posture:

- `@vivi2d/web` is configured as `0.1.0-alpha.0`.
- Local dry-run artifacts are written under the ignored
  `tmp/web-alpha-dry-run/` directory when maintainers exercise the release
  commands manually.
- A dry-run record should include `web-pack-result.json`, the packed
  `vivi2d-web-<version>.tgz`, `web-npm-alpha-release-record.json`, sanitized
  gate transcripts, `release-notes-draft.md`, and the repository-wide SBOM
  digest.
- Dry-run artifacts are not release authority. The real publish must regenerate
  them from the final release tag so the recorded source commit, tarball digest,
  SBOM digest, npm provenance, and release notes all refer to the same tree.

## Non-Goals For The npm Alpha

The first npm alpha must not:

- publish `@vivi2d/runtime`, `@vivi2d/runtime-wasm`,
  `@vivi2d/runtime-native`, renderer packages, provider packages, viewer
  packages, or C ABI packages
- publish raw native or `.wasm` artifacts as standalone public artifacts
- publish Viewer MediaPipe WASM/model assets; those are same-origin vendored
  viewer runtime assets and are not part of the `@vivi2d/web` tarball
- include `examples/**`, `docs/**`, `src/**`, tests, coverage, Playwright
  artifacts, source maps not explicitly approved by the pack-content gate, or
  repository-local demos in the package tarball
- include private-profile authoring data, source artwork, provider payloads,
  generated-hidden pixels, workflow recordings, or Auto Setup diagnostic
  internals
- make "compatible with" or "official support for" claims about third-party
  products
- require long-lived npm automation tokens for publication

## Release Artifacts

Each `@vivi2d/web` alpha release must produce or record the following artifacts:

| Artifact | Owner | Required Location |
| --- | --- | --- |
| npm tarball | publish workflow | npm registry and workflow artifact |
| tarball SHA-256 digest | publish workflow | release notes and workflow summary |
| published tarball verification | post-publish workflow step | workflow summary |
| npm provenance attestation | npm Trusted Publishing | npm package provenance UI |
| CycloneDX SBOM | release workflow | GitHub release artifact |
| `THIRD_PARTY_NOTICES` | repository | GitHub release artifact and tracked source |
| source commit SHA | release workflow | release notes |
| package version and dist-tag | release workflow | release notes |
| gate transcript summary | release workflow | workflow summary or release notes |

The release notes must identify the release as an alpha and include the package
version, git commit, tarball digest, npm dist-tag, supported browser/runtime
assumptions, and known limitations.

## Trusted Publishing Design

The preferred publication path is npm Trusted Publishing from GitHub Actions.
The publish workflow must use OIDC rather than a long-lived npm automation
token.

Trusted publisher setup:

- create the `@vivi2d/web` package or package placeholder under the Vivi2D npm
  organization
- configure exactly one trusted publisher connection for the package on
  npmjs.com
- set provider to GitHub Actions
- set owner/repository to the public Vivi2D repository
- set workflow file to the dedicated npm alpha publish workflow
- set environment to the protected release environment, if npm supports that
  field for the selected publisher configuration
- prefer stage-only permissions when ready, so CI creates a staged package and a
  maintainer approves the final publication with 2FA
- disable or revoke any long-lived automation tokens after trusted publishing is
  verified

Workflow requirements:

- run on GitHub-hosted runners, not self-hosted runners
- split validation/packaging from publication; validation and pack jobs must not
  request `id-token: write`
- request `id-token: write` only in the minimal publish job that consumes an
  already-packed tarball artifact
- keep all other permissions minimal, normally `contents: read`
- use SHA-pinned actions with source-tag comments
- set `persist-credentials: false` on release workflow checkouts
- avoid dependency caches in release builds
- run from a clean checkout of the reviewed release tag with full git history in
  the validation job, because history-secret gates must not run against a shallow
  clone
- verify the checked-out commit matches the annotated release tag being
  published
- verify `GITHUB_REF` is `refs/tags/<release-tag>` before any packaging or
  publication step, so npm provenance records the release tag rather than
  `main` or another dispatch ref
- install with `npm ci`
- use Node `22.14.0` or newer and npm `11.5.1` or newer for trusted
  publishing, then assert the actual versions before packaging
- run the full release candidate gate sequence before publishing
- include `npm run test:fuzz:parsers` and history-aware gitleaks in the workflow
  itself, not only in a separate human runbook
- install gitleaks from a reviewed pinned tool manifest before running gitleaks;
  GitHub-hosted runners must not be assumed to provide gitleaks
- pack the package exactly once, record the pack output, and publish that exact
  `.tgz` file
- run `npm publish` directly, rather than a third-party publish wrapper
- publish with the `alpha` dist-tag, never `latest`
- verify the registry tarball digest after publication

The package `repository.url` must exactly match the GitHub repository used by
the trusted publisher. If a fork or mirror is used, the package metadata and npm
trusted publisher configuration must be updated together and reviewed as a
release-boundary change.

## Publish Workflow Shape

The initial workflow should be manual, protected, and boring:

```yaml
name: Publish Web SDK Alpha

on:
  workflow_dispatch:
    inputs:
      version:
        description: "Expected @vivi2d/web version"
        required: true
      ref:
        description: "Release tag to publish, for example web-v0.1.0-alpha.0"
        required: true
      dryRun:
        description: "Run all gates and pack, but skip npm publish"
        type: boolean
        default: true

permissions:
  contents: read

concurrency:
  group: publish-web-alpha
  cancel-in-progress: false

jobs:
  validate-and-pack-web-alpha:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    env:
      VERSION: ${{ inputs.version }}
      RELEASE_REF: ${{ inputs.ref }}
    outputs:
      tarball-name: ${{ steps.pack.outputs.filename }}
    steps:
      - uses: actions/checkout@<full-sha> # vN
        with:
          ref: ${{ inputs.ref }}
          fetch-depth: 0
          persist-credentials: false
      - uses: actions/setup-node@<full-sha> # vN
        with:
          node-version: 22.14.0
          registry-url: https://registry.npmjs.org
      - name: Verify release tag before repository scripts run
        shell: bash
        run: |
          set -euo pipefail
          case "$VERSION" in
            *[!0-9A-Za-z.-]*|'') echo "Invalid version input" >&2; exit 1 ;;
          esac
          test "$RELEASE_REF" = "web-v$VERSION"
          test "$GITHUB_REF" = "refs/tags/$RELEASE_REF"
          git rev-parse -q --verify "refs/tags/$RELEASE_REF^{tag}" >/dev/null
          test "$(git rev-list -n 1 "$RELEASE_REF")" = "$(git rev-parse HEAD)"
      - run: npm install -g npm@11.5.1 --ignore-scripts
      - run: npm ci
      - run: node scripts/check-npm-cli-version.mjs --min-node 22.14.0 --min-npm 11.5.1
      - run: node scripts/check-release-input-version.mjs --workspace @vivi2d/web --version "$VERSION" --dist-tag alpha
      - run: node scripts/check-release-tag.mjs --tag "web-v$VERSION" --ref "$RELEASE_REF" --sha "$(git rev-parse HEAD)"
      - run: npm run test:fuzz:parsers
      - run: npm run check:quality
      - run: npm run check:quality:e2e-workflow-record
      - run: npm run check:sdk-unlock:web
      - run: npm run check:oss-readiness
      - run: npm run check:oss-publication
      - run: npm run check:release-surface
      - run: npm run check:pack-contents
      - run: npm run check:sdk-external-consumer
      - run: npm run notices:check
      - run: npm run check:sbom
      - run: npm run audit:all
      - run: npm run audit:prod
      - run: node scripts/install-pinned-gitleaks.mjs --manifest scripts/release-tool-versions.json
      - run: npm run check:history-secrets
      - run: gitleaks detect --source . --no-git
      - run: gitleaks git --log-opts="--all" .
      - run: npm run sbom:generate
      - id: pack
        run: |
          npm pack --workspace @vivi2d/web --json > web-pack-result.json
          node scripts/write-pack-output.mjs --pack-result web-pack-result.json >> "$GITHUB_OUTPUT"
      - run: node scripts/record-web-npm-alpha-artifacts.mjs --pack-result web-pack-result.json --gate-transcript transcripts --workspace @vivi2d/web
      - uses: actions/upload-artifact@<full-sha> # vN
        with:
          name: web-npm-alpha-release-record
          path: |
            web-pack-result.json
            *.tgz
            transcripts/
            dist/sbom/

  publish-web-alpha:
    if: ${{ !inputs.dryRun }}
    needs: validate-and-pack-web-alpha
    runs-on: ubuntu-latest
    environment: npm-alpha
    permissions:
      contents: read
      id-token: write
    env:
      VERSION: ${{ inputs.version }}
      RELEASE_REF: ${{ inputs.ref }}
    steps:
      - uses: actions/checkout@<full-sha> # vN
        with:
          ref: ${{ inputs.ref }}
          fetch-depth: 0
          persist-credentials: false
      - name: Verify release tag before publication
        shell: bash
        run: |
          set -euo pipefail
          case "$VERSION" in
            *[!0-9A-Za-z.-]*|'') echo "Invalid version input" >&2; exit 1 ;;
          esac
          test "$RELEASE_REF" = "web-v$VERSION"
          test "$GITHUB_REF" = "refs/tags/$RELEASE_REF"
          git rev-parse -q --verify "refs/tags/$RELEASE_REF^{tag}" >/dev/null
          test "$(git rev-list -n 1 "$RELEASE_REF")" = "$(git rev-parse HEAD)"
      - uses: actions/setup-node@<full-sha> # vN
        with:
          node-version: 22.14.0
          registry-url: https://registry.npmjs.org
      - run: npm install -g npm@11.5.1 --ignore-scripts
      - uses: actions/download-artifact@<full-sha> # vN
        with:
          name: web-npm-alpha-release-record
      - run: node scripts/check-npm-cli-version.mjs --min-node 22.14.0 --min-npm 11.5.1
      - run: node scripts/verify-web-npm-alpha-release-record.mjs --pack-result web-pack-result.json --tarball "${{ needs.validate-and-pack-web-alpha.outputs.tarball-name }}" --version "$VERSION"
      - run: npm publish "$PACKED_TARBALL" --access public --tag alpha --provenance
        env:
          PACKED_TARBALL: ${{ needs.validate-and-pack-web-alpha.outputs.tarball-name }}
      - run: node scripts/verify-web-npm-alpha-publish.mjs --package @vivi2d/web --version "$VERSION" --pack-result web-pack-result.json --run-id "$GITHUB_RUN_ID"
```

The concrete workflow must split validation/packaging from publication. The
publish job must consume the exact tarball produced from the same release commit
by an earlier job that did not have OIDC publication permission. The publish job
must not run `npm ci`, package lifecycle hooks, build/test/fuzz commands, or pack
commands; it may use a read-only checkout of the same release tag so Node-based
release verifier scripts are available. It may install a pinned npm CLI, verify
the release record, publish the already packed tarball, and verify the registry
result. Those verifier scripts must be dependency-free Node scripts that do not
execute package lifecycle hooks. If release notes or GitHub release uploads need
`contents: write`, put them in a separate narrow job that consumes the same
recorded tarball, SBOM, and digest artifacts.

`scripts/install-pinned-gitleaks.mjs` must read a tracked tool-version manifest
that records the gitleaks version, download URL, SHA-256 digest, and expected
binary name. The installer must verify the digest before adding the binary to
`PATH`. The release workflow must not rely on whatever tools happen to be
preinstalled on the hosted runner. The validation checkout must use
`fetch-depth: 0`; otherwise `check:history-secrets` and `gitleaks git --all`
can false-pass by scanning only the release tag's shallow commit.

The concrete workflow should wrap required gates with a transcript helper, for
example `node scripts/run-release-step.mjs --name check-quality -- npm run
check:quality`, so each gate writes a sanitized log file under `transcripts/`.
The transcript helper must fail if a command fails and must not mask exit codes.

## Versioning And Dist-Tags

The first publish should use an explicit alpha semver version, for example:

```text
0.1.0-alpha.0
```

Rules:

- never publish alpha builds under `latest`
- use `--tag alpha`
- require a semver pre-release suffix such as `-alpha.0`; `0.1.0` is not a
  valid npm alpha publication version even if published under the `alpha` tag
- do not reuse a version; npm package versions are immutable once published
- bump the pre-release number for each alpha
- record the git commit in release notes
- if an alpha is bad, deprecate it and publish a new alpha; do not rely on
  unpublish as a rollback strategy
- `check-release-input-version.mjs` must prove:
  `packages/web/package.json.version === inputs.version`, the version matches
  `^\d+\.\d+\.\d+-alpha\.\d+$`, the requested dist-tag is exactly `alpha`,
  and the target version is not already present in the npm registry

Promotion to `latest` or stable pre-1.0 install guidance requires a separate
review. That promotion should happen only after real external feedback,
installation docs, and support expectations are updated.

## Tarball Contract

The npm tarball must contain only the reviewed Web SDK runtime surface:

- `package.json`
- `README.md`
- `LICENSE` or npm-included license metadata
- `dist/**`

It must not contain:

- `src/**`
- `tests/**` or `__tests__/**`
- `examples/**`
- `docs/**`
- `coverage/**`
- `playwright-report/**`
- `test-results/**`
- `integrations/**`
- `electron/**`
- private workspace package manifests
- source review archives
- user-doc media

The pack-content gate must inspect the actual `npm pack --dry-run --json`
output for `@vivi2d/web`. The release workflow must also record the real tarball
name, size, SHA-256 digest, and npm integrity value when available.

The release workflow must not record a digest for one tarball and publish a
freshly packed second tarball. The allowed patterns are:

- `npm pack --workspace @vivi2d/web --json > web-pack-result.json`, record the
  generated `.tgz`, and publish the same `.tgz`; or
- run two pack operations only when a gate proves the resulting `.tgz` bytes are
  identical before publication.

After publication, `verify-web-npm-alpha-publish.mjs` must fetch the registry
metadata, download the published tarball URL, compute SHA-256, and compare it
with the recorded local tarball digest. It must also fetch npm's attestation
metadata for the package version and confirm that the attested subject digest,
workflow repository, workflow path, release tag/ref, GitHub run identifier, and
hosted-runner environment match the local release record.

`check:pack-contents` should behave like an allowlist, not only a denylist: it
must require `package.json`, `README.md`, `LICENSE`, and the approved `dist/**`
entry points, and it must reject every unexpected path.

## SBOM And Notices

Before publication:

- `npm run notices:check` must pass
- `npm run check:sbom` must pass
- `npm run sbom:generate` must create the release SBOM
- the SBOM must be attached to the GitHub release or equivalent release record
- release notes must identify the SBOM file and digest

The current repository SBOM is generated from the root lockfile. If we later
need package-specific SBOMs, add a dedicated `sbom:web:generate` command rather
than weakening the root SBOM gate.

Until a package-scoped SBOM exists, release notes must explicitly say that the
attached CycloneDX SBOM is repository-wide and generated from the root lockfile;
it is not a byte-for-byte manifest of only the `@vivi2d/web` tarball contents.

## Release Gate Sequence

Run these gates on the final release commit:

```sh
npm ci
npm run test:fuzz:parsers
npm run check:quality
npm run check:quality:e2e-workflow-record
npm run check:sdk-unlock:web
npm run check:sdk-external-consumer
npm run check:pack-contents
npm run check:release-surface
npm run check:oss-readiness
npm run check:oss-publication
npm run check:viewer-mediapipe-assets
npm run notices:check
npm run check:sbom
npm run audit:all
npm run audit:prod
node scripts/install-pinned-gitleaks.mjs --manifest scripts/release-tool-versions.json
npm run check:history-secrets
gitleaks detect --source . --no-git
gitleaks git --log-opts="--all" .
```

Release-specific dry-run commands:

```sh
npm pack --workspace @vivi2d/web --dry-run --json
npm pack --workspace @vivi2d/web --json > web-pack-result.json
npm publish ./vivi2d-web-<version>.tgz --access public --tag alpha --provenance --dry-run
```

The local dry-run should also record the tarball with:

```sh
node scripts/write-pack-output.mjs --pack-result web-pack-result.json
node scripts/record-web-npm-alpha-artifacts.mjs --pack-result web-pack-result.json --gate-transcript transcripts --workspace @vivi2d/web
node scripts/verify-web-npm-alpha-release-record.mjs --pack-result web-pack-result.json --tarball vivi2d-web-<version>.tgz --version <version>
```

The final publish workflow should run the non-dry-run publish only after the
same final tree passes all release gates.

The publish workflow must be covered by a static gate such as
`check:web-npm-alpha-release`. That gate should parse the workflow and prove the
release workflow contains every required release gate, including fuzz tests,
pack/release-surface checks, audits, SBOM/notices, history secret checks, and
both gitleaks modes. It must also prove gitleaks is installed from the pinned
tool manifest before `check:history-secrets` or either gitleaks command runs,
and that the validation checkout uses `fetch-depth: 0` before those history
scans run.

## Public Copy And Support Boundary

Package README, release notes, examples, and website copy must say:

- `@vivi2d/web` is experimental
- it loads public-profile `.vivi` models
- the root import is side-effect free
- `auto-register` is the explicit side-effect entry point
- no telemetry or remote upload is enabled by default
- the host app controls model URLs, CORS, and user file input
- unknown model files and external URLs should be treated as untrusted input

They must not say:

- stable runtime ABI
- stable WASM/native distribution
- official support for all third-party workflows
- compatibility with third-party model formats or products
- automatic safety for user-provided models
- one-click generation or provider-backed authoring promises

## Rollback And Incident Handling

If an alpha package is broken:

1. Publish a fixed alpha version under the `alpha` tag. This moves
   `@vivi2d/web@alpha` to the fixed version.
2. Deprecate the affected npm version with a short fixed message.
3. Open a tracked issue or security advisory depending on severity.
4. If the package contains a security issue, follow `SECURITY.md` and avoid
   public exploit details until a fix is available.
5. If provenance, SBOM, or digest records are wrong, publish corrected release
   notes and keep the original artifact record for auditability.
6. If post-publish verification fails after npm accepts the package, immediately
   deprecate the version with fixed copy that tells users not to install it,
   remove the `alpha` dist-tag if no fixed alpha is ready, open a release
   incident, and attach the failed verification record for audit.

Do not delete release notes or rewrite package provenance. npm version
immutability means rollback is a new version, not a hidden replacement.
If a fixed version cannot be published promptly, remove the `alpha` dist-tag
with `npm dist-tag rm @vivi2d/web alpha` and record that version-specific
installs remain possible because npm versions are immutable.

## Tracked Implementation Support

The package metadata and release support files are tracked, but publication is
still blocked until a maintainer performs the real npm/GitHub configuration and
the final release tree passes every gate below. The implementation support
includes:

1. A dedicated SHA-pinned manual publish workflow for `@vivi2d/web`.
2. A release-input version checker so a workflow dispatch cannot publish the
   wrong package version or a non-alpha semver version under the `alpha` tag.
3. An artifact recorder that writes tarball name, size, SHA-256, npm
   integrity, SBOM digest, source commit, and gate transcript summary.
4. A post-publish verifier that compares the registry tarball digest with
   the locally recorded digest and confirms npm provenance is present.
5. `check:web-npm-alpha-release`, which verifies the
   workflow, protected environment name, package metadata, trusted publisher
   owner/repository/workflow expectation, release notes template, SBOM command,
   npm CLI version assertion, release tag rule, pre-release semver rule, pinned
   gitleaks installation, job-level OIDC isolation, required script invocations,
   and dist-tag rules are machine-checked.
6. `check:pack-contents`, which requires the approved files and rejects
   unexpected files, rather than only blocking known bad paths.
7. A release notes template for `@vivi2d/web` alpha.
8. A dry-run CI path that runs everything except `npm publish` on pull
   requests or main-branch release-prep changes.
9. A pinned release-tool manifest and installer for gitleaks so the release
   workflow cannot depend on runner-preinstalled binaries.
10. `check:npm-token-hygiene`, which
   proves long-lived publish tokens are absent or explicitly revoked after
   trusted publishing is verified.
11. `check:environment-protection`, which validates the tracked policy for the
    `npm-alpha` environment: at least two required reviewers, deployment limited
    to `web-v*` release tags, admin bypass disabled when supported, and any wait
    timer or exception explicitly recorded.
12. A remaining manual release step to confirm npm organization settings and
    trusted publisher configuration before the first real publish.
13. Release-gate alignment for same-origin vendored MediaPipe viewer assets:
    `check:viewer-mediapipe-assets` locks their bytes and provenance, while
    publication-history, native-artifact, and security-pattern gates allow only
    that locked third-party asset set.

## Exit Criteria

The `@vivi2d/web` npm alpha is ready to publish only when:

- package metadata names the correct public repository and npm organization
- trusted publisher is configured on npmjs.com for the exact workflow
- trusted publisher settings are paired with token restrictions or a reviewed
  token-hygiene exception
- release workflow is SHA-pinned and gives OIDC permission only to the minimal
  publish job
- validation and packaging jobs pass without OIDC publication permission
- release workflow installs pinned gitleaks before running gitleaks checks
- validation checkout uses full git history before history-secret scans run
- protected `npm-alpha` environment requires maintainer approval
- protected `npm-alpha` environment limits deployments to `web-v*` release tags,
  and the workflow verifies `GITHUB_REF` matches the requested release tag
- package version is an alpha pre-release
- publish is executed from a reviewed release tag matching the workflow SHA
- release notes identify alpha status and limitations
- release notes include the fixed repository-wide SBOM disclaimer until a
  package-scoped SBOM exists
- `npm pack --dry-run --json` output is reviewed and machine-checked
- the exact packed `.tgz` is the file passed to `npm publish`
- tarball digest and SBOM digest are recorded
- artifact recorder and post-publish verifier exist and pass on dry-run or
  fixture input
- full release gates pass on the final commit
- the package is published with `--tag alpha`
- npm provenance appears on the package page after publish
- post-publish registry tarball digest verification passes

## References

- npm Trusted Publishing:
  <https://docs.npmjs.com/trusted-publishers/>
- npm provenance:
  <https://docs.npmjs.com/generating-provenance-statements/>
- npm publish and pack contents:
  <https://docs.npmjs.com/cli/v10/commands/npm-publish/>
