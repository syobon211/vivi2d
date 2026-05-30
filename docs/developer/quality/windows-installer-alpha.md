# Windows Installer Alpha Contract

This document defines the release design for the first Vivi2D Windows desktop
installer alpha. It is a design contract, not permission to publish. The
installer may be attached to a GitHub Release only after this contract is
implemented, checked by release automation, and reviewed on the final release
tag.

The initial installer goal is to let early users try Vivi2D without cloning the
repository. It is not a stable distribution channel, an auto-update channel, or
evidence that the desktop app API and project format are stable.

## Release Channel

The first installer-capable repository release should use a new alpha tag after
the source/provenance-only `v0.1.0-alpha.1` release:

```text
v0.1.0-alpha.2
```

Rules:

- Installer automation must reject `v0.1.0-alpha.1`; that tag is reserved for
  the source/provenance-only alpha.
- Do not mutate a published installer tag. If an installer is wrong after
  publication, publish a new alpha tag and mark the old release as superseded.
- GitHub Releases are the canonical location for desktop installer assets until
  a signed download CDN or store channel is approved.
- The release must be marked as a pre-release.
- Installer release notes must keep the pre-1.0 warning visible above the fold.
- The installer release may coexist with the existing source/provenance assets,
  but installer assets must have their own record, checksums, and review notes.
- The first installer alpha supersedes the earlier source/provenance-only alpha
  for users who want a downloadable app. It must regenerate the source review
  archive, SBOM, notices, release record, and checksums from its own final tag
  rather than inheriting assets from a previous release.
- Release notes must explicitly state whether the previous alpha is superseded,
  still useful for source review, or both.

## Initial Platform Scope

The first installer alpha is limited to:

| Platform | Architecture | Installer format | Status |
| --- | --- | --- | --- |
| Windows | x64 | NSIS `.exe` setup installer | Planned first target |

Out of scope until separate contracts are written:

- macOS `.dmg`, `.pkg`, notarization, and Apple Developer ID signing.
- Linux AppImage, `.deb`, `.rpm`, Flatpak, Snap, or distro packages.
- Windows MSI, MSIX, Squirrel, Winget, Microsoft Store, or enterprise
  deployment packages.
- Auto-update metadata such as `latest.yml`, `.blockmap`, feed manifests, or
  background updater endpoints.
- ComfyUI bundles, See-through bundles, model weights, Python wheels, or custom
  node bundles.
- Native/WASM runtime artifacts published as standalone assets.

## Packaging Decision

Use `electron-builder` for the first Windows installer alpha unless a later
ADR chooses a different packager. The expected first target is NSIS because it
has a familiar one-click setup flow and does not require the heavier MSIX
identity/signing model.

Required packager settings:

- Build from a clean checkout of the final release tag.
- Build the installer on a GitHub-hosted Windows runner or another recorded
  clean Windows release machine. Do not cross-build the canonical Windows
  installer from a developer workstation.
- Build the app with production Electron settings and no dev server fallback.
- Set `electron-builder` `publish: null` or `publish: []` so neither
  `latest*.yml` nor packaged `app-update.yml` metadata is generated.
- Disable first-launch update checks, telemetry, crash uploads, or remote
  diagnostics unless a separate privacy/security contract approves them.
- Exclude `node_modules/.cache`, `coverage`, `playwright-report`,
  `test-results`, `tmp`, `docs/backlog`, local logs, source review archives, and
  private workflow recordings from packaged app contents.
- Include `LICENSE` and `THIRD_PARTY_NOTICES.txt` in the packaged app or
  installer resources.
- The packaged app may include only the locked third-party MediaPipe viewer
  assets validated by `check:viewer-mediapipe-assets`. It must not include
  Vivi2D-owned native or WASM runtime artifacts as standalone public assets
  until the native/WASM artifact policy is closed.
- MediaPipe viewer assets must be bundled from
  `packages/viewer/public/vendor/mediapipe/` and loaded from the packaged app.
  Runtime fetches from `cdn.jsdelivr.net`, `storage.googleapis.com`, or any
  other MediaPipe CDN are forbidden for the installer alpha.
- Preserve the existing Electron security posture: sandboxed renderers,
  context isolation, fail-closed IPC contracts, strict navigation trust, and
  production CSP.
- Generate deterministic file names from the release version and platform.
  This is a naming guarantee only; NSIS installers are not assumed to be
  byte-reproducible.
- Keep `electron-builder` and any packaging helpers covered by the dependency
  license policy before they are added to `devDependencies`.
- Record `electron-builder`, NSIS, Electron, `@electron/get`, and any signing
  helper versions in `scripts/release-tool-versions.json` or a successor
  installer-tool manifest before implementation. `check:windows-installer-alpha`
  must reject builds where installed tool versions diverge from the manifest.
- Record the Electron prebuilt binary source and digest, or the
  `electron-builder`/`@electron/get` checksum mechanism used to verify it, in
  the installer release record. If this cannot be enforced for the first
  installer alpha, the release record must carry an owner-approved
  supply-chain exception.

The required installer asset name is:

```text
vivi2d-<version>-windows-x64-setup.exe
```

The workflow must reject additional desktop artifacts unless they are explicitly
added to this document and to the verifier allowlist.

## Signing Policy

Signed installers are preferred, but not required for the first public Windows
installer alpha if a signing certificate is not yet available.

The default for the first installer alpha is unsigned publication. Before
signing is enabled, the owner must choose one of:

- a cloud signing service, such as Azure Trusted Signing, DigiCert KeyLocker, or
  SignPath, with OIDC or another auditable non-exportable key flow
- an HSM or USB token on a self-hosted Windows release machine with documented
  physical custody and recovery procedures
- deferred signing, with all installer copy clearly marked unsigned

Cloud signing and HSM/self-hosted signing both require an ADR before enablement.

If the installer is unsigned:

- Release notes must state that the installer is unsigned and may trigger
  Microsoft Defender SmartScreen or browser warnings.
- The installer release record must include `codeSigning.status: "unsigned"`.
- The download section on `vivi2d.com` must label the build as an unsigned
  alpha.
- The workflow must not claim publisher identity, trusted app status, or
  malware reputation.
- The owner must approve the unsigned release in the protected release
  environment before publishing.

If signing is enabled later:

- The certificate owner, storage mechanism, renewal process, and revocation
  response must be recorded before use.
- The signing step must run only in the protected release environment.
- The workflow must verify the Authenticode signature after packaging and before
  checksums are recorded.
- The signing order is: sign the installer, verify the signature, compute
  SHA-256 and SHA-512 over the signed installer file, then write
  `checksums.txt` and the installer release record.
- The signing step must apply an RFC 3161 timestamp with SHA-256 digest
  settings, for example `signtool sign /tr <url> /td sha256 /fd sha256`.
- The release record must store the timestamp authority URL and signature
  verification summary. The verifier must reject signed builds without a valid
  timestamp.
- The release notes must state the expected publisher name and certificate
  fingerprint.

The installer release record must use this signing shape:

```json
{
  "codeSigning": {
    "status": "unsigned|signed",
    "publisherName": null,
    "certificateSha256": null,
    "timestampAuthorityUrl": null,
    "verificationSummary": "unsigned alpha approved by protected environment"
  }
}
```

Signed builds must replace the nullable certificate and timestamp fields with
verified values. Unsigned builds must keep them `null`.

## Required Installer Artifacts

Each Windows installer alpha release must produce:

| Artifact | Required | Notes |
| --- | --- | --- |
| `vivi2d-<version>-windows-x64-setup.exe` | Yes | The NSIS installer. |
| `vivi2d-<version>-windows-installer-record.json` | Yes | Machine-readable release record. |
| `checksums.txt` | Yes | Covers every attached downloadable artifact except itself with SHA-256 and SHA-512 entries where available. |
| `vivi2d-<version>.cdx.json` | Yes | Repository-wide SBOM regenerated from the release tag. |
| `THIRD_PARTY_NOTICES.txt` | Yes | Generated notices for the release tag. |
| source review archive and manifest | Yes | Same source/provenance baseline as the GitHub alpha release. |
| build-provenance attestation status | Yes | Recorded in the release record. A downloadable attestation file is optional until its exact filename is added to the allowlist. |
| `release-notes.md` | Generated only | Used as release body, not attached as a downloadable asset. |

The installer release record must include:

- schema version and release kind
- release version and tag
- source commit SHA
- Electron version, Chromium major version, Electron-embedded Node.js version,
  and the Node.js version used to run the packaging workflow
- packager name and version
- artifact names, byte sizes, SHA-256 digests, and SHA-512 digests where
  available
- code signing status and signature verification result
- protected release environment name and approval summary
- build-provenance attestation URL or owner-approved exception
- manual Windows VM review summary, including reviewer, review date, Windows
  version, install result, first-launch network result, uninstall result, and
  intentional remnants
- installer scope: Windows x64 NSIS only
- exact required gate transcript names or workflow run IDs
- explicit absence of auto-update metadata
- explicit absence of bundled ComfyUI, See-through, model weights, and Python
  wheels

The protected release environment name is:

```text
desktop-installer-alpha
```

`check:environment-protection` or a successor hosted-settings check must verify
that the environment requires owner approval, restricts publishing to release
tags, and records any temporary exception before installer publication.

The verifier must use a positive allowlist for the exact downloadable asset set:

```text
THIRD_PARTY_NOTICES.txt
checksums.txt
vivi2d-<version>-windows-installer-record.json
vivi2d-<version>-windows-x64-setup.exe
vivi2d-<version>-source-review.zip
vivi2d-<version>-source-review-manifest.json
vivi2d-<version>.cdx.json
```

`release-notes.md` is used as the release body and must not be attached as a
downloadable asset. If build-provenance attestations are later attached as
downloadable files, their exact names must be added to this allowlist before the
workflow can publish them.

Default size budgets:

- Windows installer: 300 MiB maximum
- installed application footprint: 700 MiB maximum

Exceeding either budget requires an owner-approved release exception recorded in
the installer release record.

## First-Launch Network Policy

For installer alpha smoke testing, the Vivi2D app process must initiate no
outbound network connections during install, first launch, idle, or uninstall.
MediaPipe assets are bundled and must not be fetched from the network. ComfyUI,
provider, or viewer API connections require later user configuration and are not
part of the first-launch baseline.

The maintainer network capture may record OS-owned traffic such as DNS, NTP,
certificate revocation, or Windows reputation checks separately. Those entries
do not satisfy or expand Vivi2D's app-level allowlist. Any connection attributed
to the Vivi2D or Electron app process before explicit user configuration fails
the installer alpha gate unless an owner-approved release exception documents
the exact destination, reason, and user-facing copy.

The implementation must fix the process attribution method before publication.
Acceptable evidence includes a clean VM baseline plus Windows Resource Monitor,
`Get-NetTCPConnection` with owning process, Sysmon, `pktmon`, or an equivalent
reviewed capture method. The review packet must record the process name, PID,
destination, reason, tool used, and reviewer for each observed connection.

## Forbidden Installer Assets

The verifier must first assert that the downloadable asset directory exactly
matches the positive allowlist above. The forbidden globs below are a deliberate
second defense: they apply to any file not already accepted by that exact
allowlist; for example, only the allowlisted
`vivi2d-<version>-source-review.zip` may appear.

The release verifier must fail if any non-allowlisted file matching these
patterns appears in the installer asset directory unless a later contract
explicitly allows it:

```text
*.msi
*.msix
*.appx
*.dmg
*.pkg
*.cab
*.wim
*.iso
*.7z
*.AppImage
*.deb
*.rpm
*.snap
*.nupkg
*.blockmap
latest.yml
latest-*.yml
RELEASES
*.pth
*.safetensors
*.ckpt
*.onnx
*.whl
*.tar.gz
*.zip
```

The app package itself must also be scanned for:

- absolute local paths
- `docs/backlog`
- Playwright traces, screenshots, videos, and workflow recordings
- provider prompts, provider payloads, and source artwork diagnostics
- private editor-only preview data
- private keys, tokens, `.env` files, and local credentials
- unreviewed generated media
- `app-update.yml`, `resources/app-update.yml`, `electron-builder.yml`,
  `electron-builder.yaml`, `builder-effective-config.yaml`, packaged
  `resources/electron-builder/**`, or any `autoUpdater` runtime config

## Required Gates

The installer release workflow must split gates by operating system. The Linux
read-only validation job runs the existing repository quality and publication
checks:

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
npm run check:license-policy
npm run notices:check
npm run check:sbom
npm run check:source-review-archive
npm run check:viewer-mediapipe-assets
npm run check:history-secrets
node scripts/install-pinned-gitleaks.mjs --manifest scripts/release-tool-versions.json
gitleaks detect --source . --no-git
gitleaks git --log-opts="--all" .
```

`gitleaks` remains Linux-only until `scripts/release-tool-versions.json` adds a
reviewed `windows-x64` entry. Windows packaging jobs must not call
`scripts/install-pinned-gitleaks.mjs` before that manifest support exists.

The Windows read-only packaging job runs the installer packaging and
installer-specific verification steps:

```sh
npm ci
npm run check:viewer-mediapipe-assets
npm run release:windows-installer:prepare
npm run verify:windows-installer-assets
```

The SBOM and notices must be regenerated on the Linux validation job from the
final tag. If the Windows packaged dependency graph ever diverges from the
Linux SBOM, the installer contract must add a Windows SBOM artifact and verifier
before publication.

Additional installer-specific gates must be added before publication. The
script names below are placeholders until the scripts are implemented, and the
release is blocked until they exist and fail closed.

Linux validation job owns the master/orchestration gates that read the prepared
asset bundle:

```text
npm run check:windows-installer-alpha
npm run release:windows-installer:review-packet
```

Windows packaging job owns the packaging and per-asset verification gates that
are already listed in the Windows job above:

```text
npm run release:windows-installer:prepare
npm run verify:windows-installer-assets
```

Installer-specific checks must prove:

- packaging config is present and reviewed
- auto-update output is disabled or absent
- only allowlisted installer assets are attached
- installer record fields match the final tag and source commit
- checksums verify the exact files attached to the release
- the workflow step graph computes checksums only after any signing and
  signature verification step has completed
- code signing status matches the release notes
- signed builds have a valid Authenticode signature and RFC 3161 timestamp;
  unsigned builds have no publisher claim and are clearly marked unsigned
- `THIRD_PARTY_NOTICES` and SBOM are regenerated from the final tag
- packaged app contents do not include private surfaces or local artifacts
- the packaged app directory or extracted installer payload is scanned before
  the installer is attached to a release
- the packaged app does not contain `VITE_DEV_SERVER_URL`, localhost dev-server
  URLs, sourcemaps unless explicitly allowlisted, update feed URLs, or telemetry
  endpoints
- `vivi2d.com` download copy matches the release state
- sourcemaps are forbidden in installer alpha builds unless a later contract
  names an exact sourcemap allowlist file and explains why it is public-safe

Required negative fixtures for the installer verifier:

```text
windows_installer_allows_exact_source_review_zip_name
windows_installer_rejects_extra_zip_asset
windows_installer_rejects_installer_zip_archive
windows_installer_rejects_blockmap_latest_yml_and_app_update_yml
windows_installer_check_rejects_unsigned_build_with_publisher_claim
```

Signed-build order fixtures such as
`windows_installer_check_rejects_checksum_before_signing` and
`windows_installer_check_rejects_signed_build_without_timestamp_verify` are
required when a later ADR enables code signing. The first implementation is
unsigned-only and must reject any signed build inputs before release-record or
checksum generation.

## Workflow Shape

The installer workflow should mirror the hardened GitHub Release alpha pattern:

- `workflow_dispatch` with `version` and `ref` inputs.
- Top-level `permissions: contents: read`.
- The workflow runs in at least two stages:
  - a Linux read-only quality-gate job for the existing Xvfb-backed repository
    checks
  - a Windows read-only packaging/signing job that creates the canonical NSIS
    installer
- Validation and packaging jobs run with `contents: read` and no release-write
  token.
- Packaging runs in a Windows job. Linux Xvfb validation may run in a separate
  read-only job, but the canonical `.exe` must be produced by the Windows
  packaging job.
- Windows packaging jobs must not invoke `xvfb-run`; Linux validation jobs must
  not invoke Windows signing tools or create the canonical installer.
- Release creation is the only job with `contents: write`.
- The `contents: write` job must not check out source or run reusable Actions
  before release creation.
- Release creation must use a single shell step with step-local `GH_TOKEN` and
  explicit `GH_REPO`.
- The release step must download the previously verified asset bundle, re-check
  the exact file set, re-run checksum verification, re-check the tag target
  against `GITHUB_SHA`, and then create or update a draft pre-release.
- The workflow must create a draft release first. Publishing remains a separate
  owner action after visual review and hosted security setting confirmation.
- Artifact upload between jobs must use a short retention window and a stable
  allowlisted artifact name. The write-scoped release job must verify the
  downloaded bundle again before attaching it.

Do not combine installer publication with the source/provenance-only workflow
until both verifier contracts are merged intentionally. A separate installer
workflow is easier to audit for the first binary release.

## Release Notes Requirements

Installer release notes must include:

- pre-1.0 alpha warning
- Windows x64-only support statement
- unsigned or signed status, including expected warnings
- Electron and Chromium major versions
- SHA-256 verification instructions
- source commit and release tag
- SBOM and notices scope
- explicit non-goals for auto-update, macOS, Linux, MSI/MSIX, ComfyUI bundles,
  See-through bundles, model weights, and stable API guarantees
- uninstall instructions or a link to user docs
- security reporting path

The release notes must not imply that the installer is production-ready,
enterprise-managed, signed by a trusted publisher, or safe to bypass operating
system warnings without checksum verification.

## Website Download Copy

Before an installer is published, `vivi2d.com` should show:

```text
Download for Windows: Coming soon
```

After an installer is published, `vivi2d.com` may link to the GitHub Release
asset only if:

- the release is public and marked pre-release
- the release notes include the signing status and checksum instructions
- `checksums.txt` includes the installer digest
- the website copy says "Windows x64 alpha"
- unsigned builds are clearly labeled as unsigned

The website must not link directly to a stale GitHub asset URL copied from an
old release. Prefer linking to the release page until a stable download API or
redirect service is reviewed.

## Exit Criteria

The Windows installer alpha is ready only when:

- this document is implemented by tracked scripts and workflow checks
- `npm run check:windows-installer-alpha` passes
- the installer build is generated from a clean final release tag
- the installer asset set is exactly allowlisted
- checksums and release record verify on a fresh download
- release notes accurately describe the installer signing status
- the protected release environment records owner approval
- a maintainer manually installs and uninstalls the build on a clean Windows
  machine or VM
- the packaged app launches without a dev server, does not open unapproved
  network endpoints on first launch, and does not perform an auto-update check
- a maintainer captures outbound network traffic during install, first launch,
  idle, and uninstall on a clean VM and confirms it matches the documented
  no-update/no-telemetry expectation
- after uninstall, a maintainer confirms no registry key, Start Menu shortcut,
  file association, `%APPDATA%/Vivi2D` remnant, or equivalent user data remnant
  remains, or records each intentional remnant in release notes and user docs
- no ComfyUI bundle, See-through bundle, model weight, Python wheel, native/WASM
  standalone artifact, or auto-update metadata is attached
